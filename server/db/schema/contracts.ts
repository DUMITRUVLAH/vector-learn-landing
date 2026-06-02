import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  jsonb,
  integer,
  date,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { students } from "./students";
import { users } from "./users";
import { courses } from "./courses";

export const beneficiaryTypeEnum = pgEnum("beneficiary_type", ["pf", "pj"]);
export const contractFormatEnum = pgEnum("contract_format", ["fizic", "online"]);
export const contractCurrencyEnum = pgEnum("contract_currency", ["MDL", "EUR", "RON"]);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Auto-generated: {prefix}{daily_seq}-{DD.MM.YYYY} e.g. VA1-31.05.2026 */
    number: varchar("number", { length: 64 }).notNull(),
    /** Prefix used for this contract (snapshot from tenant at creation time) */
    prefix: varchar("prefix", { length: 10 }).notNull().default("VL"),
    /** Daily sequence counter (1-based, resets each day per tenant) */
    dailySeq: integer("daily_seq").notNull().default(1),
    /** Date string for the day this contract was created (YYYY-MM-DD) */
    contractDate: date("contract_date").notNull(),

    beneficiaryType: beneficiaryTypeEnum("beneficiary_type").notNull().default("pf"),

    // PF fields
    beneficiaryName: varchar("beneficiary_name", { length: 300 }),
    idn: varchar("idn", { length: 20 }),

    // PJ fields
    companyName: varchar("company_name", { length: 300 }),
    companyIdno: varchar("company_idno", { length: 20 }),
    repName: varchar("rep_name", { length: 200 }),
    repRole: varchar("rep_role", { length: 100 }),

    // Course details
    course: varchar("course", { length: 200 }),
    hours: integer("hours"),
    scheduleText: varchar("schedule_text", { length: 500 }),
    language: varchar("language", { length: 100 }),
    format: contractFormatEnum("format"),
    location: varchar("location", { length: 200 }),
    priceCents: integer("price_cents").notNull().default(0),
    currency: contractCurrencyEnum("currency").notNull().default("MDL"),
    persons: integer("persons").notNull().default(1),

    /**
     * INTEG-202: FK to courses — structural link for revenue-per-course analytics.
     * Nullable (backward compatible). ON DELETE SET NULL.
     * contracts.course (varchar) is preserved for display/template; courseId is the FK.
     */
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    /** Optional link to source lead */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** Optional link to source student */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    /** URL to stored PDF (future: S3/R2 upload) */
    pdfUrl: varchar("pdf_url", { length: 1000 }),
    /** Full snapshot of all fields at creation time (for audit / re-render) */
    data: jsonb("data"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("contracts_tenant_idx").on(t.tenantId),
    tenantDateIdx: index("contracts_tenant_date_idx").on(t.tenantId, t.contractDate),
    numberIdx: index("contracts_number_idx").on(t.tenantId, t.number),
    leadIdx: index("contracts_lead_idx").on(t.leadId),
    studentIdx: index("contracts_student_idx").on(t.studentId),
  })
);

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
