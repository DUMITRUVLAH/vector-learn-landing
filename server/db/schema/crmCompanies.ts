/**
 * CRM — baza unică de firme + jurnalul importurilor.
 *
 * Portat din crm-vector (`companies.ts` + `duplicates.ts` + `importFile.ts`).
 * De ce o entitate separată și nu doar textul `leads.company`: fără un id stabil
 * nu poți unifica duplicate, nu poți lega mai multe oportunități de aceeași
 * firmă și nu poți raporta pe client. Textul rămâne pe lead ca afișare de
 * rezervă, exact ca în sursă — cele existente nu se rescriu.
 *
 * Coloanele normalizate (`*_normalized`) sunt cele pe care se face dedup:
 * telefonul redus la ultimele 8 cifre, emailul lowercase. Fără ele,
 * „+373 69 39 19 79" și „069391979" ar fi două firme diferite.
 *
 * Migrare: drizzle/0164_crm_companies.sql
 */
import { pgTable, uuid, varchar, text, numeric, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const crmCompanies = pgTable(
  "crm_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 300 }),
    /** Cod fiscal (IDNO în RM) — când există, e criteriul decisiv la dedup. */
    idno: varchar("idno", { length: 40 }),
    industry: varchar("industry", { length: 120 }),
    region: varchar("region", { length: 120 }),
    companySize: varchar("company_size", { length: 40 }),
    annualConsumptionKwh: numeric("annual_consumption_kwh"),
    website: varchar("website", { length: 300 }),
    phone: varchar("phone", { length: 32 }),
    phoneNormalized: varchar("phone_normalized", { length: 32 }),
    email: varchar("email", { length: 255 }),
    emailNormalized: varchar("email_normalized", { length: 255 }),
    address: varchar("address", { length: 500 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_companies_tenant_idx").on(t.tenantId),
    index("crm_companies_name_idx").on(t.tenantId, t.nameNormalized),
    index("crm_companies_phone_idx").on(t.tenantId, t.phoneNormalized),
    index("crm_companies_email_idx").on(t.tenantId, t.emailNormalized),
    index("crm_companies_idno_idx").on(t.tenantId, t.idno),
  ]
);

export type CrmCompany = typeof crmCompanies.$inferSelect;
export type NewCrmCompany = typeof crmCompanies.$inferInsert;

/**
 * Jurnalul importurilor: cine a importat ce fișier, cu ce mapare și cu ce
 * rezultat. Fără el, un import prost peste o bază reală e imposibil de explicat
 * după fapt.
 */
export const crmImportJobs = pgTable(
  "crm_import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 300 }),
    source: varchar("source", { length: 40 }).notNull().default("file"),
    mapping: jsonb("mapping"),
    totalRows: integer("total_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errors: jsonb("errors"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_import_jobs_tenant_idx").on(t.tenantId, t.createdAt)]
);

export type CrmImportJob = typeof crmImportJobs.$inferSelect;

/** Mapări de coloane salvate, ca al doilea fișier de la aceeași sursă să nu ceară refacerea mapării. */
export const crmImportMappings = pgTable(
  "crm_import_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    mapping: jsonb("mapping").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_import_mappings_tenant_idx").on(t.tenantId, t.name)]
);

export type CrmImportMapping = typeof crmImportMappings.$inferSelect;
