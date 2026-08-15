import { prisma } from "@/server/db/prisma";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, publicUser } from "@/server/auth/session";
import { CoreUnavailableError, CoreSyncError } from "@/server/core/errors";
import {
  retryIdentitySyncOnLogin,
  syncIdentityToCore,
  syncUserProfileToCore,
} from "@/server/core/sync";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 409 | 503 = 400,
  ) {
    super(message);
  }
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  workspaceName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError("An account with that email already exists.", 409);
  }

  const workspaceName =
    input.workspaceName?.trim() || `${input.name.trim()}'s workspace`;

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      workspaces: {
        create: {
          name: workspaceName,
        },
      },
    },
    include: { workspaces: true },
  });

  const workspace = user.workspaces[0];
  try {
    await syncIdentityToCore({
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: workspace.id, name: workspace.name },
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    if (error instanceof CoreUnavailableError) {
      throw new AuthError(
        "Account creation failed because Phumi Core is unreachable. Try again shortly.",
        503,
      );
    }
    if (error instanceof CoreSyncError) {
      throw new AuthError(error.message, 503);
    }
    throw error;
  }

  const session = await createSession(user.id);
  return {
    user: publicUser(user),
    workspace: user.workspaces[0],
    session,
  };
}

export async function login(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AuthError("Invalid email or password.", 401);
  }

  let workspace = user.workspaces[0] ?? null;
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: `${user.name}'s workspace`,
        ownerId: user.id,
      },
    });

    try {
      await syncIdentityToCore({
        user: { id: user.id, name: user.name, email: user.email },
        workspace: { id: workspace.id, name: workspace.name },
      });
    } catch (error) {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      if (error instanceof CoreUnavailableError) {
        throw new AuthError(
          "Could not create your workspace because Phumi Core is unreachable. Try again shortly.",
          503,
        );
      }
      if (error instanceof CoreSyncError) {
        throw new AuthError(error.message, 503);
      }
      throw error;
    }
  } else {
    await retryIdentitySyncOnLogin({
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: workspace.id, name: workspace.name },
    });
  }

  const session = await createSession(user.id);
  return {
    user: publicUser(user),
    workspace,
    session,
  };
}

export async function updateProfile(
  userId: string,
  input: { name?: string; workspaceName?: string },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input.name ? { name: input.name.trim() } : {},
  });

  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });

  if (workspace && input.workspaceName?.trim()) {
    workspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { name: input.workspaceName.trim() },
    });
  }

  await syncUserProfileToCore({
    user: { id: user.id, name: user.name, email: user.email },
    workspace,
  });

  return { user: publicUser(user), workspace };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AuthError("Current password is incorrect.", 401);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  await prisma.session.deleteMany({ where: { userId } });
}
