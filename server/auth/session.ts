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
 * PERF-005 — cache de sesiune în proces.
 *
 * Fiecare cerere autentificată făcea 3 dus-întorsuri la baza de date: SELECT din `sessions`,
 * SELECT din `users`, UPDATE pe `last_active_at`. Local, cu PGlite în proces, e invizibil; pe
 * producție, cu Supabase peste rețea, sunt ~60–120 ms de overhead pur de autentificare pe
 * FIECARE cerere — înmulțit cu zecile de cereri pe care le face o pagină.
 *
 * TTL 30 s, deliberat scurt: e fereastra maximă în care o sesiune revocată ar mai fi acceptată.
 * Revocarea explicită (logout, ștergerea sesiunii din ecranul de securitate, dezactivarea
 * utilizatorului) golește cache-ul pe loc prin `dropCachedSession`, deci fereastra se aplică doar
 * expirărilor naturale, nu și acțiunilor deliberate de securitate.
 *
 * Cache-ul e per instanță de proces. Pe Vercel fiecare instanță are propriul cache — corect: nu
 * există stare partajată de invalidat, iar o instanță nouă pornește cu cache gol.
 */
const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map<string, { at: number; value: { session: Session; user: User } }>();

/** Șterge o sesiune din cache. OBLIGATORIU la logout/revocare — vezi comentariul de mai sus. */
export function dropCachedSession(token: string): void {
  sessionCache.delete(token);
}

/** Golește tot cache-ul (dezactivare de utilizator, schimbare de parolă). */
export function dropAllCachedSessions(): void {
  sessionCache.clear();
}

/**
 * PERF-005: `last_active_at` se scria la FIECARE cerere — amplificare de scrieri pentru un câmp
 * a cărui unică utilizare e ecranul „sesiunile mele". Îl scriem cel mult o dată pe minut per
 * sesiune; precizia rămâne mult peste ce arată acel ecran.
 */
const LAST_ACTIVE_WRITE_INTERVAL_MS = 60_000;
const lastActiveWrittenAt = new Map<string, number>();

export async function getSessionUser(token: string): Promise<{ session: Session; user: User } | null> {
  const cached = sessionCache.get(token);
  if (cached && Date.now() - cached.at < SESSION_CACHE_TTL_MS) {
    touchLastActive(cached.value.session.id);
    return cached.value;
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    sessionCache.delete(token);
    return null;
  }
  // AUTH-004: block pending 2FA sessions from accessing protected endpoints
  if (session.twoFactorPending) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return null;

  const value = { session, user };
  sessionCache.set(token, { at: Date.now(), value });
  touchLastActive(session.id);

  return value;
}

/** Scrie `last_active_at` cel mult o dată pe minut per sesiune, fără să blocheze cererea. */
function touchLastActive(sessionId: string): void {
  const last = lastActiveWrittenAt.get(sessionId) ?? 0;
  if (Date.now() - last < LAST_ACTIVE_WRITE_INTERVAL_MS) return;
  lastActiveWrittenAt.set(sessionId, Date.now());
  void db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .catch(() => {});
}

export async function revokeSession(token: string): Promise<void> {
  // PERF-005: cache-ul trebuie golit ÎNAINTE de ștergere. Altfel, timp de până la 30 s după
  // logout, o cerere cu acel token ar fi servită din cache — adică logout-ul n-ar deconecta.
  dropCachedSession(token);
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return result.length;
}
