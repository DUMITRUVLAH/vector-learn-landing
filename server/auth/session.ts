import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users, type Session, type User } from "../db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "vl_session";

export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<{ session: Session; user: User } | null> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return null;
  return { session, user };
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return result.length;
}
