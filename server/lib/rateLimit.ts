/**
 * SEC-02 — durable, serverless-safe rate limiter for auth endpoints.
 *
 * Backed by the `login_attempts` table (one row per bucket key) so the counter survives across
 * serverless cold starts — unlike an in-memory Map, which resets per instance and gave attackers
 * effectively unlimited password guesses.
 *
 * Model: a fixed window of `windowMs`. Each failure increments `count`; once `count >= max`, the
 * bucket is locked until `windowStart + windowMs` and callers get 429 + Retry-After. A successful
 * auth clears the bucket. The window auto-rolls when the current one has expired.
 *
 * Graceful degradation: if the table doesn't exist yet (Vercel deploys code before migrations
 * finish — §3.5.1ter), every function fails OPEN (allows the request) rather than 500-ing the
 * login page. The migration + sync-schema heal close that gap quickly.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export interface RateLimitConfig {
  /** Max failures allowed within the window before locking. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** True if the caller is currently locked out. */
  limited: boolean;
  /** Seconds until the lock lifts (for the Retry-After header). 0 when not limited. */
  retryAfterSec: number;
  /** Remaining attempts in the current window (informational). */
  remaining: number;
}

/** Default policy for password endpoints: 5 failures / 15 min. */
export const LOGIN_RATE_LIMIT: RateLimitConfig = { max: 5, windowMs: 15 * 60 * 1000 };

/** Build the bucket key from an email + client IP. Email lowercased; either part may be empty. */
export function rateLimitKey(email: string | undefined, ip: string | undefined): string {
  return `${(email ?? "").toLowerCase().slice(0, 255)}|${(ip ?? "").slice(0, 64)}`;
}

/**
 * Check (and roll/clear the window if expired) WITHOUT counting a failure. Call BEFORE verifying
 * the password: if it returns `limited`, reject with 429 immediately.
 */
export async function checkRateLimit(
  key: string,
  cfg: RateLimitConfig = LOGIN_RATE_LIMIT,
): Promise<RateLimitResult> {
  try {
    const rows = (await db.execute(sql`
      SELECT count, window_start, locked_until
      FROM login_attempts
      WHERE attempt_key = ${key}
      LIMIT 1
    `)) as unknown;
    const row = firstRow<{ count: number; window_start: string; locked_until: string | null }>(rows);
    if (!row) return { limited: false, retryAfterSec: 0, remaining: cfg.max };

    const now = Date.now();
    const windowStart = new Date(row.window_start).getTime();
    const windowExpired = now - windowStart >= cfg.windowMs;

    if (windowExpired) {
      // Window rolled over — treat as fresh (the row is cleared lazily on next failure/success).
      return { limited: false, retryAfterSec: 0, remaining: cfg.max };
    }

    const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
    if (lockedUntil > now) {
      return { limited: true, retryAfterSec: Math.ceil((lockedUntil - now) / 1000), remaining: 0 };
    }

    const remaining = Math.max(0, cfg.max - row.count);
    return { limited: remaining === 0, retryAfterSec: remaining === 0 ? Math.ceil((windowStart + cfg.windowMs - now) / 1000) : 0, remaining };
  } catch {
    // Table missing / DB hiccup → fail open (don't lock users out of login).
    return { limited: false, retryAfterSec: 0, remaining: cfg.max };
  }
}

/**
 * Record a failed attempt. Increments the counter (rolling the window if expired) and sets
 * `locked_until` when the threshold is reached. Returns the post-increment limit state.
 */
export async function recordFailure(
  key: string,
  cfg: RateLimitConfig = LOGIN_RATE_LIMIT,
): Promise<RateLimitResult> {
  const windowSec = Math.ceil(cfg.windowMs / 1000);
  try {
    // Atomic upsert. On conflict: if the window expired, reset to count=1 & new window; else +1.
    // Set locked_until when the (possibly reset) count reaches max.
    const rows = (await db.execute(sql`
      INSERT INTO login_attempts (attempt_key, count, window_start, updated_at)
      VALUES (${key}, 1, now(), now())
      ON CONFLICT (attempt_key) DO UPDATE SET
        count = CASE
          WHEN now() - login_attempts.window_start >= (${windowSec} * interval '1 second') THEN 1
          ELSE login_attempts.count + 1
        END,
        window_start = CASE
          WHEN now() - login_attempts.window_start >= (${windowSec} * interval '1 second') THEN now()
          ELSE login_attempts.window_start
        END,
        locked_until = CASE
          WHEN (CASE
                  WHEN now() - login_attempts.window_start >= (${windowSec} * interval '1 second') THEN 1
                  ELSE login_attempts.count + 1
                END) >= ${cfg.max}
            THEN login_attempts.window_start + (${windowSec} * interval '1 second')
          ELSE login_attempts.locked_until
        END,
        updated_at = now()
      RETURNING count, window_start, locked_until
    `)) as unknown;
    const row = firstRow<{ count: number; window_start: string; locked_until: string | null }>(rows);
    if (!row) return { limited: false, retryAfterSec: 0, remaining: cfg.max };

    const now = Date.now();
    const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
    const remaining = Math.max(0, cfg.max - row.count);
    return {
      limited: lockedUntil > now,
      retryAfterSec: lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0,
      remaining,
    };
  } catch {
    return { limited: false, retryAfterSec: 0, remaining: cfg.max };
  }
}

/** Clear the bucket after a successful auth. Best-effort. */
export async function clearRateLimit(key: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM login_attempts WHERE attempt_key = ${key}`);
  } catch {
    /* ignore */
  }
}

/** Postgres-js returns an array; pglite returns { rows }. Normalize. */
function firstRow<T>(res: unknown): T | undefined {
  if (Array.isArray(res)) return res[0] as T | undefined;
  const r = res as { rows?: unknown[] };
  return (r?.rows?.[0] as T | undefined) ?? undefined;
}
