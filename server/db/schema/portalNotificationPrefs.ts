/**
 * GAP-017: Portal notification preferences per student.
 * Controls which proactive notifications are sent (lesson reminders, debt alerts, package low).
 * One row per student — created on demand (upsert pattern).
 */
import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const portalNotificationPrefs = pgTable(
  "portal_notification_prefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Send a lesson reminder N hours before each upcoming lesson */
    lessonReminder: boolean("lesson_reminder").notNull().default(true),
    /** How many hours before the lesson to send the reminder (default 24 = day before) */
    reminderHoursBefore: integer("reminder_hours_before").notNull().default(24),
    /** Send an alert when student debt exceeds debtThresholdCents */
    debtAlert: boolean("debt_alert").notNull().default(true),
    /** Debt threshold in cents above which alerts are sent (default 200 RON = 20000 bani) */
    debtThresholdCents: integer("debt_threshold_cents").notNull().default(20000),
    /** Send an alert when lesson package credits fall to or below packageLowThreshold */
    packageLowAlert: boolean("package_low_alert").notNull().default(true),
    /** Number of remaining credits that triggers the low-package alert (default 2) */
    packageLowThreshold: integer("package_low_threshold").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("pnp_tenant_idx").on(t.tenantId),
    studentUniq: uniqueIndex("pnp_student_uniq").on(t.studentId),
  })
);

export type PortalNotificationPrefs = typeof portalNotificationPrefs.$inferSelect;
export type NewPortalNotificationPrefs = typeof portalNotificationPrefs.$inferInsert;
