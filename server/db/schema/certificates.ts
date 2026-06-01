/**
 * DIPLOMA-801 — Certificate templates + issued certificates
 *
 * Ported from copy-roas supabase/migrations + types.ts:
 *   - certificate_templates: background + field positions per tenant/course/cohort
 *   - issued_certificates: one row per emitted certificate with unique verification token
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { cohorts } from "./cohorts";

// ─── certificate_templates ────────────────────────────────────────────────────

export type FieldConfig = {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  align?: "left" | "center" | "right";
  maxWidth?: number;
};

export type FieldsConfig = {
  participant_name?: FieldConfig;
  course_name?: FieldConfig;
  edition?: FieldConfig;
  mentor_name?: FieldConfig;
  completion_date?: FieldConfig;
  qr_code?: FieldConfig & { size?: number };
  certificate_id?: FieldConfig;
  [key: string]: FieldConfig | (FieldConfig & { size?: number }) | undefined;
};

export const certificateTemplates = pgTable(
  "certificate_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    cohortId: uuid("cohort_id").references(() => cohorts.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    backgroundUrl: varchar("background_url", { length: 1000 }),
    fieldsConfig: jsonb("fields_config").$type<FieldsConfig>(),
    isGlobal: boolean("is_global").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantGlobalIdx: index("cert_tmpl_tenant_global_idx").on(t.tenantId, t.isGlobal),
    tenantCourseIdx: index("cert_tmpl_tenant_course_idx").on(t.tenantId, t.courseId),
  })
);

export type CertificateTemplate = typeof certificateTemplates.$inferSelect;
export type NewCertificateTemplate = typeof certificateTemplates.$inferInsert;

// ─── issued_certificates ─────────────────────────────────────────────────────

export const issuedCertificates = pgTable(
  "issued_certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    certificateId: varchar("certificate_id", { length: 100 }).notNull(),
    cohortId: uuid("cohort_id").references(() => cohorts.id, {
      onDelete: "set null",
    }),
    templateId: uuid("template_id").references(() => certificateTemplates.id, {
      onDelete: "set null",
    }),
    participantName: varchar("participant_name", { length: 300 }).notNull(),
    courseName: varchar("course_name", { length: 300 }).notNull(),
    edition: varchar("edition", { length: 100 }),
    mentorName: varchar("mentor_name", { length: 200 }),
    completionDate: date("completion_date"),
    verificationToken: uuid("verification_token")
      .defaultRandom()
      .notNull()
      .unique(),
    pdfUrl: varchar("pdf_url", { length: 1000 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("issued_cert_tenant_idx").on(t.tenantId),
    tenantCertIdIdx: unique("issued_cert_tenant_certid_uniq").on(
      t.tenantId,
      t.certificateId
    ),
  })
);

export type IssuedCertificate = typeof issuedCertificates.$inferSelect;
export type NewIssuedCertificate = typeof issuedCertificates.$inferInsert;
