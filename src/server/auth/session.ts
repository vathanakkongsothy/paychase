import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/prisma";

export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 30;

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function sessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  return expiresAt;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const expiresAt = sessionExpiry();
  await prisma.session.create({
    data: { userId, token, expiresAt },
  });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          workspaces: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  const workspace = session.user.workspaces[0] ?? null;
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    workspace,
  };
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

export function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}
