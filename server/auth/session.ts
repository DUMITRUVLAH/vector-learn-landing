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

/**
 * How stale lastActiveAt must be before we bother writing it again.
 * PERF-13 / scaling: this runs on EVERY authenticated request. Writing lastActiveAt every time
 * is write-amplification that, on the serverless `max:1` pool, becomes the scarcest resource at
 * high concurrency (500 users → 500 needless writes/s). The session-management UI only needs
 * ~minute granularity, so we skip the write unless it's >15 min stale.
 */
const LAST_ACTIVE_THROTTLE_MS = 15 * 60 * 1000;

export async function getSessionUser(token: string): Promise<{ session: Session; user: User } | null> {
  // Scaling: fetch session + user in ONE round-trip (inner join) instead of two sequential
  // queries on the hot authenticated path.
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  if (!row) return null;
  const { session, user } = row;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  // AUTH-004: block pending 2FA sessions from accessing protected endpoints
  if (session.twoFactorPending) return null;

  // PERF-13: only refresh lastActiveAt when it's actually stale (fire-and-forget, never await).
  const lastActive = session.lastActiveAt?.getTime() ?? 0;
  if (Date.now() - lastActive > LAST_ACTIVE_THROTTLE_MS) {
    void db
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, session.id))
      .catch(() => {});
  }

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
