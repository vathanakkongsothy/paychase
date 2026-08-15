import { prisma } from "@/server/db/prisma";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, publicUser } from "@/server/auth/session";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 409 = 400,
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

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      workspaces: {
        create: {
          name: input.workspaceName?.trim() || `${input.name.trim()}'s workspace`,
        },
      },
    },
    include: { workspaces: true },
  });

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
    data: input.name ? { name: input.name.trim() } : undefined,
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
