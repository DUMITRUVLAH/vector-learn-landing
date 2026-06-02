import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users, type Session, type User } from "../db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "vl_session";

export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

export interface CreateSessionOptions {
  /** Client IP address — stored for the session-management UI (AUTH-004). */
  ipAddress?: string;
  /** User-Agent string — stored for the session-management UI (AUTH-004). */
  userAgent?: string;
  /**
   * AUTH-004: when the user has 2FA enabled and has just passed the password
   * check, create a "pending" session that can only access the 2FA verify
   * endpoint.  After TOTP verification, set this to false.
   */
  twoFactorPending?: boolean;
}

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    lastActiveAt: new Date(),
    twoFactorPending: options.twoFactorPending ?? false,
  });
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
  // AUTH-004: block pending 2FA sessions from accessing protected endpoints
  if (session.twoFactorPending) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return null;

  // Update lastActiveAt (fire-and-forget, don't await)
  void db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.id, session.id))
    .catch(() => {});

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
