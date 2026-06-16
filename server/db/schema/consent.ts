/**
 * CONSENT-001 — Formulare de consimțământ cu e-semnătură
 *
 * Entități:
 *   consent_templates — șabloanele formularelor (foto, excursie, medical, GDPR)
 *   consent_requests  — cereri trimise tutorelui per elev, cu status semnare
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { studentGuardians } from "./guardians";

// ─── consent_templates ────────────────────────────────────────────────────────

export const consentTemplates = pgTable(
  "consent_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Ex. „Acord foto/video", „Consimțământ excursie" */
    title: varchar("title", { length: 200 }).notNull(),
    /** Conținut HTML/text al formularului */
    body: text("body").notNull(),
    /**
     * Categoria formularului — varchar (nu enum) pentru flexibilitate.
     * Ex: "photo_video" | "field_trip" | "medical" | "gdpr"
     */
    category: varchar("category", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantActiveIdx: index("consent_templates_tenant_active_idx").on(t.tenantId, t.isActive),
  })
);

export type ConsentTemplate = typeof consentTemplates.$inferSelect;
export type NewConsentTemplate = typeof consentTemplates.$inferInsert;

// ─── consent_requests ─────────────────────────────────────────────────────────

export const consentRequests = pgTable(
  "consent_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => consentTemplates.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => studentGuardians.id, { onDelete: "cascade" }),
    /**
     * Status curent al cererii.
     * Valori: "pending" | "signed" | "declined"
     */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Timestamp al semnării (null dacă pending/declined) */
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Numele tastat de tutore la semnare */
    signedByName: varchar("signed_by_name", { length: 200 }),
    /** Timestamp al refuzului (null dacă pending/signed) */
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    /** Motivul refuzului (opțional) */
    declineReason: varchar("decline_reason", { length: 500 }),
    /** Când a fost trimisă cererea */
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Un tutore semnează un formular o singură dată per elev */
    uniqueRequest: unique("consent_requests_template_student_guardian_uniq").on(
      t.templateId,
      t.studentId,
      t.guardianId
    ),
    tenantStatusIdx: index("consent_requests_tenant_status_idx").on(t.tenantId, t.status),
    tenantStudentIdx: index("consent_requests_tenant_student_idx").on(t.tenantId, t.studentId),
  })
);

export type ConsentRequest = typeof consentRequests.$inferSelect;
export type NewConsentRequest = typeof consentRequests.$inferInsert;
