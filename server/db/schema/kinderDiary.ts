/**
 * KINDER-002 — Daily report / child diary
 *
 * daily_report_events: per-child log of daily events (meals, naps, diapers, activities, photos)
 * event_type drives the structure of the `details` JSONB field
 */
import {
  pgTable,
  pgEnum,
  uuid,
  timestamp,
  date,
  text,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

/** Event types for the daily child diary */
export const diaryEventTypeEnum = pgEnum("diary_event_type", [
  "meal",      // details: { food: string, amountMl?: number, reaction?: string }
  "nap",       // details: { startTime: string, endTime?: string }
  "diaper",    // details: { type: "wet" | "soiled" | "both" }
  "activity",  // details: { description: string }
  "photo",     // details: { caption?: string }, photoUrl set
  "note",      // details: { text: string }
]);

export const dailyReportEvents = pgTable(
  "daily_report_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Date of the event (YYYY-MM-DD, local date of the center) */
    eventDate: date("event_date").notNull(),
    eventType: diaryEventTypeEnum("event_type").notNull(),
    /** Type-specific data */
    details: jsonb("details"),
    /** URL for photo events (external URL or S3 key in production) */
    photoUrl: text("photo_url"),
    /** Staff member who logged this event */
    staffUserId: uuid("staff_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("daily_report_events_tenant_idx").on(t.tenantId),
    studentDateIdx: index("daily_report_events_student_date_idx").on(t.studentId, t.eventDate),
    tenantDateIdx: index("daily_report_events_tenant_date_idx").on(t.tenantId, t.eventDate),
  })
);

export type DailyReportEvent = typeof dailyReportEvents.$inferSelect;
export type NewDailyReportEvent = typeof dailyReportEvents.$inferInsert;
export type DiaryEventType = (typeof diaryEventTypeEnum.enumValues)[number];
