/**
 * KINDER-007 — Incident/accident reports + parent acknowledgment signature
 *
 * incident_reports: one row per incident per student, with parent signature flow
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  date,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

export const incidentTypeEnum = pgEnum("incident_type", [
  "fall",
  "bite",
  "cut",
  "allergy",
  "behavioral",
  "other",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "parent_notified",
  "acknowledged",
  "closed",
]);

/**
 * Incident/accident report for a specific child.
 * Follows a status flow: open → parent_notified → acknowledged → closed.
 * Parent signs digitally (canvas base64) to confirm they were informed.
 */
export const incidentReports = pgTable(
  "incident_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Local date of the incident (YYYY-MM-DD) */
    incidentDate: date("incident_date").notNull(),
    /** Optional time of the incident (HH:MM, 24-hour) */
    incidentTime: varchar("incident_time", { length: 5 }),
    type: incidentTypeEnum("type").notNull().default("other"),
    description: text("description").notNull(),
    /** Body area affected, e.g. "genunchi drept", "mâna stângă" */
    injuryLocation: varchar("injury_location", { length: 200 }),
    /** First aid steps taken by staff */
    firstAidGiven: text("first_aid_given"),
    /** Witness names (free text) */
    witnessName: varchar("witness_name", { length: 200 }),
    /** When the parent was first notified (in-app or phone) */
    parentNotifiedAt: timestamp("parent_notified_at", { withTimezone: true }),
    /** Base64 canvas data URL of the parent's e-signature */
    parentSignatureUrl: text("parent_signature_url"),
    /** When the parent signed/acknowledged the report */
    parentAcknowledgedAt: timestamp("parent_acknowledged_at", { withTimezone: true }),
    status: incidentStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("incident_reports_tenant_idx").on(t.tenantId),
    studentIdx: index("incident_reports_student_idx").on(t.studentId),
    tenantDateIdx: index("incident_reports_tenant_date_idx").on(t.tenantId, t.incidentDate),
    statusIdx: index("incident_reports_status_idx").on(t.status),
  })
);

export type IncidentReport = typeof incidentReports.$inferSelect;
export type NewIncidentReport = typeof incidentReports.$inferInsert;
