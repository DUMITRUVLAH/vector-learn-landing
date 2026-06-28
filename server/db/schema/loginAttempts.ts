import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * SEC-02: durable login rate-limiting store.
 *
 * The previous limiter was an in-memory Map that resets on every serverless cold start, so it
 * provided ~no protection against brute-force / credential-stuffing. This table persists the
 * attempt counter per (key) where key = "<email>|<ip>" so the limit survives across instances.
 *
 * One row per key; `count` is the failure count in the current window, `windowStart` is when the
 * window opened, `lockedUntil` is set once the threshold is exceeded (caller returns 429 +
 * Retry-After until then). A successful login resets the row (count=0, lockedUntil=null).
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** "<lowercased-email>|<ip>" — the rate-limit bucket key */
    attemptKey: varchar("attempt_key", { length: 320 }).notNull().unique(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyIdx: index("login_attempts_key_idx").on(t.attemptKey),
    lockedIdx: index("login_attempts_locked_idx").on(t.lockedUntil),
  })
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
