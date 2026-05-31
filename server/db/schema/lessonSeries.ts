/**
 * SCHED-502: Lesson series — groups recurring lessons together.
 * Each series tracks the recurrence pattern and links to its lessons via lessons.series_id.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const recurrenceTypeEnum = pgEnum("recurrence_type", ["weekly"]);

export const lessonSeries = pgTable(
  "lesson_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Human-readable label (e.g. "Engleză B2 — luni 14:00") */
    label: varchar("label", { length: 300 }).notNull(),
    recurrenceType: recurrenceTypeEnum("recurrence_type").notNull().default("weekly"),
    /** Day-of-week for weekly recurrence: 1=Mon…7=Sun (ISO weekday) */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Count of lessons generated (informational; actual lessons are the source of truth) */
    occurrences: integer("occurrences").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lesson_series_tenant_idx").on(t.tenantId),
  })
);

export type LessonSeries = typeof lessonSeries.$inferSelect;
export type NewLessonSeries = typeof lessonSeries.$inferInsert;
