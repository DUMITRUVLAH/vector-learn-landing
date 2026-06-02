/**
 * MOB-105: Gamification — XP events, streaks, badges
 * Students earn XP for attending lessons, submitting homework, completing quizzes.
 * Streaks track consecutive-day activity. Badges are awarded at milestones.
 */
import { pgTable, uuid, varchar, integer, text, timestamp, date, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** XP events — each row represents a single XP award */
export const xpEvents = pgTable("xp_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  /** attendance | homework_submit | quiz_complete | login */
  type: varchar("type", { length: 50 }).notNull(),
  amount: integer("amount").notNull().default(10),
  description: text("description"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** Per-student streak state — one row per student */
export const studentStreaks = pgTable(
  "student_streaks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull(),
    studentId: uuid("student_id").notNull(),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActivityDate: date("last_activity_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    studentUniq: uniqueIndex("student_streaks_student_uniq").on(t.tenantId, t.studentId),
  })
);

/** Badges — awarded once per type per student */
export const badges = pgTable("badges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  /** streak_7 | streak_30 | xp_100 | xp_500 | first_homework */
  badgeType: varchar("badge_type", { length: 50 }).notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Re-export boolean so leaderboard_opt_in migration doesn't need a separate file
export { boolean };
