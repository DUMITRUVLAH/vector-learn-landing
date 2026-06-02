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
     * INTEG-103: branch_id (soft-ref, nullable UUID).
     * FK constraint to branches.id deferred until BRANCH-faza-1 PR is merged to main.
     * Enables filtering cohorts per branch and per-branch cohort reports.
     */
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCourseIdx: index("cohorts_tenant_course_idx").on(t.tenantId, t.courseId),
    tenantStartIdx: index("cohorts_tenant_start_idx").on(t.tenantId, t.startDate),
  })
);

export type Cohort = typeof cohorts.$inferSelect;
export type NewCohort = typeof cohorts.$inferInsert;
