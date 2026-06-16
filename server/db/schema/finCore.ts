/**
 * FinDesk — CORE module schema
 * Tables: fin_org_profile, fin_invoice_series, fin_members, fin_onboarding
 * Migration: drizzle/0116_fin_core.sql
 * CORE: backlog/fin/FIN-CORE.md §1.1
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const finCountryEnum = pgEnum("fin_country", ["MD", "RO"]);

export const finVatRegimeEnum = pgEnum("fin_vat_regime", [
  "payer",
  "non_payer",
]);

export const finRoleEnum = pgEnum("fin_role", [
  "owner",
  "accountant",
  "cfo",
  "viewer",
]);

export const finDocTypeEnum = pgEnum("fin_doc_type", [
  "invoice",
  "proforma",
  "receipt",
]);

export const finOnboardingStepEnum = pgEnum("fin_onboarding_step", [
  "company",
  "parties",
  "first_invoice",
  "done",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * fin_org_profile — fiscal profile of the company workspace.
 * One row per tenant (UNIQUE constraint on tenant_id).
 */
export const finOrgProfile = pgTable(
  "fin_org_profile",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Legal name of the company */
    legalName: varchar("legal_name", { length: 200 }).notNull(),
    /** Fiscal code: CIF/CUI (RO) or IDNO (MD) */
    idno: varchar("idno", { length: 30 }),
    country: finCountryEnum("country").notNull().default("MD"),
    vatRegime: finVatRegimeEnum("vat_regime").notNull().default("non_payer"),
    vatNumber: varchar("vat_number", { length: 30 }),
    /** ISO 4217 currency, default MDL */
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("MDL"),
    /** Physical/legal address */
    address: text("address"),
    /** URL to company logo (stored externally) */
    logoUrl: text("logo_url"),
    /** Month number (1–12) fiscal year starts */
    fiscalYearStart: integer("fiscal_year_start").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_org_profile_tenant_idx").on(t.tenantId),
    tenantUniq: unique("fin_org_profile_tenant_uniq").on(t.tenantId),
  })
);

/**
 * fin_invoice_series — document numbering series.
 * e.g. prefix="VEGA-2026-", next_number=1, pad_width=4 → "VEGA-2026-0001"
 */
export const finInvoiceSeries = pgTable(
  "fin_invoice_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Series prefix, e.g. "VEGA-2026-" */
    prefix: varchar("prefix", { length: 50 }).notNull(),
    /** Next sequential number to use */
    nextNumber: integer("next_number").notNull().default(1),
    /** Zero-pad width for the number part */
    padWidth: integer("pad_width").notNull().default(4),
    docType: finDocTypeEnum("doc_type").notNull().default("invoice"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_invoice_series_tenant_idx").on(t.tenantId),
  })
);

/**
 * fin_members — user ↔ FinDesk role mapping within a tenant workspace.
 */
export const finMembers = pgTable(
  "fin_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: finRoleEnum("role").notNull().default("viewer"),
    /** Granular permission overrides (optional JSON object) */
    permissions: jsonb("permissions").$type<Record<string, boolean>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_members_tenant_idx").on(t.tenantId),
    userIdx: index("fin_members_user_idx").on(t.userId),
    tenantUserUniq: unique("fin_members_tenant_user_uniq").on(t.tenantId, t.userId),
  })
);

/**
 * fin_onboarding — onboarding progress tracker per tenant.
 * Tracks the guided setup flow (<10 min): company → parties → first_invoice → done.
 */
export const finOnboarding = pgTable(
  "fin_onboarding",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    step: finOnboardingStepEnum("step").notNull().default("company"),
    /** Array of completed step names */
    completedSteps: jsonb("completed_steps").$type<string[]>().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_onboarding_tenant_idx").on(t.tenantId),
    tenantUniq: unique("fin_onboarding_tenant_uniq").on(t.tenantId),
  })
);
