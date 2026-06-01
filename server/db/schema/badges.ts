/**
 * GAP-019: Gamification badges — insigne automate per elev
 *
 * student_badges — o insignă per tip per elev (unique constraint)
 * Badge types: first_lesson, ten_lessons, hundred_lessons,
 *              first_homework, five_homework,
 *              thirty_day_streak, perfect_week
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

/** Canonical list of badge types recognized by the system */
export const BADGE_TYPES = [
  "first_lesson",
  "ten_lessons",
  "hundred_lessons",
  "first_homework",
  "five_homework",
  "thirty_day_streak",
  "perfect_week",
] as const;

export type BadgeType = (typeof BADGE_TYPES)[number];

export const studentBadges = pgTable(
  "student_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** One badge of each type per student per tenant */
    badgeType: varchar("badge_type", { length: 50 }).notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    /** Human-readable description, e.g. "Attended 10 lessons" */
    awardedReason: text("awarded_reason"),
  },
  (t) => ({
    tenantIdx: index("student_badges_tenant_idx").on(t.tenantId),
    studentIdx: index("student_badges_student_idx").on(t.studentId),
    /** Each badge type can only be awarded once per student per tenant */
    uniqueBadge: unique("student_badges_unique").on(t.tenantId, t.studentId, t.badgeType),
  })
);

export type StudentBadge = typeof studentBadges.$inferSelect;
export type NewStudentBadge = typeof studentBadges.$inferInsert;
