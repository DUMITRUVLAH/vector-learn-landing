/**
 * CX-701 — Cohort (edition) model
 *
 * A cohort is a concrete run of a course:
 *   label "Ediția Mai 2026" + start date + schedule + cost info.
 * Business calculations (end date, progress) live in server/lib/cohortDates.ts.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";

export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** Human-readable label, e.g. "Ediția Mai 2026" */
    label: varchar("label", { length: 300 }).notNull(),
    /** ISO date string YYYY-MM-DD */
    startDate: date("start_date").notNull(),
    /** Total course hours */
    totalHours: integer("total_hours").notNull().default(32),
    /** Hours per session (default 2h) */
    hoursPerSession: integer("hours_per_session").notNull().default(2),
    /**
     * Days of week for this cohort's schedule.
     * Array of English day names: ["Monday","Wednesday",...].
     * Stored as JSONB. Null → fallback to 56-day window.
     */
    scheduleDays: jsonb("schedule_days").$type<string[]>(),
    isOnline: boolean("is_online").notNull().default(false),
    /**
     * If set, overrides the calculated end date.
     * ISO date string YYYY-MM-DD.
     */
    manualEndDate: date("manual_end_date"),
    /** Mentor cost in cents (for break-even CX-705) */
    mentorCostCents: integer("mentor_cost_cents").notNull().default(0),
    /** Room cost in cents */
    roomCostCents: integer("room_cost_cents").notNull().default(0),
    /** Optional Google Drive folder URL */
    driveFolderUrl: varchar("drive_folder_url", { length: 1000 }),
    /**
     * GAP-011: URL-safe slug for public enrollment page, e.g. "engleza-a2-mai-2026".
     * Unique per tenant. Null = not publicly enrollable.
     */
    slug: varchar("slug", { length: 200 }),
    /**
     * GAP-011: Maximum number of participants (seats). 0 = unlimited.
     */
    maxParticipants: integer("max_participants").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCourseIdx: index("cohorts_tenant_course_idx").on(t.tenantId, t.courseId),
    tenantStartIdx: index("cohorts_tenant_start_idx").on(t.tenantId, t.startDate),
    slugIdx: uniqueIndex("cohorts_tenant_slug_uniq").on(t.tenantId, t.slug),
  })
);

export type Cohort = typeof cohorts.$inferSelect;
export type NewCohort = typeof cohorts.$inferInsert;
