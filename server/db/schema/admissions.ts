/**
 * SCHOOL-005 — Schema dosar de admitere (admissions workflow)
 *
 * Entități:
 *   admission_applications — Dosarul de admitere al unui aplicant
 *   admission_documents    — Documentele cerute / recepționate pentru dosar
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { academicYears } from "./school";
import { leads } from "./leads";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const admissionStatusEnum = pgEnum("admission_status", [
  "draft",
  "submitted",
  "review",
  "accepted",
  "waitlisted",
  "rejected",
  "enrolled",
]);

export const admissionDocStatusEnum = pgEnum("admission_doc_status", [
  "required",
  "received",
  "verified",
]);

// ─── admission_applications ───────────────────────────────────────────────────

export const admissionApplications = pgTable(
  "admission_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    /** Numele complet al aplicantului (copilul) */
    applicantName: varchar("applicant_name", { length: 200 }).notNull(),
    applicantEmail: varchar("applicant_email", { length: 200 }),
    applicantPhone: varchar("applicant_phone", { length: 50 }),
    guardianName: varchar("guardian_name", { length: 200 }),
    guardianPhone: varchar("guardian_phone", { length: 50 }),
    /** Clasa dorită: „1", „5", „12" */
    gradeLevel: varchar("grade_level", { length: 10 }).notNull(),
    status: admissionStatusEnum("status").notNull().default("draft"),
    /** Legătură opțională cu un lead CRM */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** Motivul acceptării / respingerii */
    decisionNotes: text("decision_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantYearStatusIdx: index("admission_applications_tenant_year_status_idx").on(
      t.tenantId,
      t.academicYearId,
      t.status
    ),
    tenantStatusIdx: index("admission_applications_tenant_status_idx").on(
      t.tenantId,
      t.status
    ),
  })
);

export type AdmissionApplication = typeof admissionApplications.$inferSelect;
export type NewAdmissionApplication = typeof admissionApplications.$inferInsert;

// ─── admission_documents ──────────────────────────────────────────────────────

export const admissionDocuments = pgTable(
  "admission_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => admissionApplications.id, { onDelete: "cascade" }),
    /** Ex. „Certificat de naștere", „Foaie matricolă" */
    name: varchar("name", { length: 200 }).notNull(),
    status: admissionDocStatusEnum("status").notNull().default("required"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantApplicationIdx: index("admission_documents_tenant_application_idx").on(
      t.tenantId,
      t.applicationId
    ),
  })
);

export type AdmissionDocument = typeof admissionDocuments.$inferSelect;
export type NewAdmissionDocument = typeof admissionDocuments.$inferInsert;
