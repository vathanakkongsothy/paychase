import { randomBytes } from "node:crypto";
import type { User, Session, Workspace } from "./types";
import { batch, guard, id, insert, one, remove, update } from "./db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { CoreUnavailableError, CoreSyncError } from "@/server/core/errors";
import { retryIdentitySyncOnLogin, syncIdentityToCore, syncUserProfileToCore } from "@/server/core/sync";

export class AuthError extends Error {
  constructor(message: string, public status: 400 | 401 | 409 | 503 = 400) { super(message); }
}
export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 30;
export function cookieOptions() {
  return { httpOnly: true, sameSite: "Lax" as const, path: "/",
    maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === "production" };
}
export function publicUser(user: User) { return { id: user.id, email: user.email, name: user.name }; }
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await batch([insert("Session", { id: id(), userId, token, expiresAt, createdAt: new Date() })]);
  return { token, expiresAt };
}
export async function destroySession(token: string | undefined) {
  if (token) await batch([remove("Session", '"token"=?', [token])]);
}
export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await one<Session>("Session", 'WHERE "token"=?', [token]);
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await batch([remove("Session", '"id"=?', [session.id])]);
    return null;
  }
  const user = await one<User>("User", 'WHERE "id"=?', [session.userId]);
  if (!user) return null;
  const workspace = await one<Workspace>("Workspace", 'WHERE "ownerId"=? ORDER BY "createdAt", "id"', [user.id]);
  return { sessionId: session.id, user: publicUser(user), workspace };
}
export async function signup(input: { name: string; email: string; password: string; workspaceName?: string }) {
  const email = input.email.trim().toLowerCase();
  if (await one<User>("User", 'WHERE "email"=?', [email]))
    throw new AuthError("An account with that email already exists.", 409);
  const now = new Date();
  const user: User = { id: id(), name: input.name.trim(), email,
    passwordHash: await hashPassword(input.password), createdAt: now, updatedAt: now };
  const workspace: Workspace = { id: id(), ownerId: user.id,
    name: input.workspaceName?.trim() || user.name + "'s workspace", createdAt: now };
  await batch([insert("User", user), insert("Workspace", workspace)]);
  try {
    await syncIdentityToCore({ user: publicUser(user), workspace });
  } catch (error) {
    // Workspace.owner uses a restrictive FK: remove the child before the user.
    await batch([remove("Workspace", '"id"=? AND "ownerId"=?', [workspace.id, user.id]),
      remove("User", '"id"=?', [user.id])]);
    if (error instanceof CoreUnavailableError)
      throw new AuthError("Account creation failed because Phumi Core is unreachable. Try again shortly.", 503);
    if (error instanceof CoreSyncError) throw new AuthError(error.message, 503);
    throw error;
  }
  return { user: publicUser(user), workspace, session: await createSession(user.id) };
}
export async function login(input: { email: string; password: string }) {
  const user = await one<User>("User", 'WHERE "email"=?', [input.email.trim().toLowerCase()]);
  if (!user || !(await verifyPassword(input.password, user.passwordHash)))
    throw new AuthError("Invalid email or password.", 401);
  let workspace = await one<Workspace>("Workspace", 'WHERE "ownerId"=? ORDER BY "createdAt", "id"', [user.id]);
  if (!workspace) {
    workspace = { id: id(), name: user.name + "'s workspace", ownerId: user.id, createdAt: new Date() };
    await batch([guard('NOT EXISTS (SELECT 1 FROM "Workspace" WHERE "ownerId"=?)', [user.id]),
      insert("Workspace", workspace)]);
    try { await syncIdentityToCore({ user: publicUser(user), workspace }); }
    catch (error) {
      await batch([remove("Workspace", '"id"=? AND "ownerId"=?', [workspace.id, user.id])]);
      if (error instanceof CoreUnavailableError)
        throw new AuthError("Could not create your workspace because Phumi Core is unreachable. Try again shortly.", 503);
      if (error instanceof CoreSyncError) throw new AuthError(error.message, 503);
      throw error;
    }
  } else await retryIdentitySyncOnLogin({ user: publicUser(user), workspace });
  return { user: publicUser(user), workspace, session: await createSession(user.id) };
}
export async function updateProfile(userId: string, input: { name?: string; workspaceName?: string }) {
  const user = await one<User>("User", 'WHERE "id"=?', [userId]);
  if (!user) throw new AuthError("Sign in required", 401);
  const workspace = await one<Workspace>("Workspace", 'WHERE "ownerId"=? ORDER BY "createdAt", "id"', [userId]);
  const changes: D1PreparedStatement[] = [];
  if (input.name) {
    user.name = input.name.trim();
    changes.push(update("User", { name: user.name, updatedAt: new Date() }, '"id"=?', [userId]));
  }
  if (workspace && input.workspaceName?.trim()) {
    workspace.name = input.workspaceName.trim();
    changes.push(update("Workspace", { name: workspace.name }, '"id"=? AND "ownerId"=?', [workspace.id, userId]));
  }
  await batch(changes);
  await syncUserProfileToCore({ user: publicUser(user), workspace });
  return { user: publicUser(user), workspace };
}
export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
  const user = await one<User>("User", 'WHERE "id"=?', [userId]);
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash)))
    throw new AuthError("Current password is incorrect.", 401);
  const passwordHash = await hashPassword(input.newPassword);
  await batch([
    guard('EXISTS (SELECT 1 FROM "User" WHERE "id"=? AND "passwordHash"=?)', [userId, user.passwordHash]),
    update("User", { passwordHash, updatedAt: new Date() }, '"id"=?', [userId]),
    remove("Session", '"userId"=?', [userId]),
  ]);
}
