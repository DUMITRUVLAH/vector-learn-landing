/**
 * REGISTRY-001: FinDesk fiscal nomenclature
 * Tables: fin_tax_rates, fin_chart_of_accounts
 * These are the source of truth for VAT computations (FISC), payroll (PAY), and expenses (SPEND).
 *
 * Design decisions:
 * - fin_tax_rates: versioned by effectiveFrom/effectiveTo; helper rateAt() in server/lib/finRegistry.ts
 * - fin_chart_of_accounts: per-tenant + per-country; account codes are free-form (MD/RO differ)
 * - tenantId is nullable to support shared global rates (null = applies to all tenants of that country)
 * - Unique constraint on (tenantId, accountCode) in fin_chart_of_accounts
 */
import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  boolean,
  index,
  unique,
  timestamp,
  pgEnum,
  char,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Types of tax rates that FinDesk tracks */
export const finTaxKindEnum = pgEnum("fin_tax_kind", [
  "vat",
  "income_tax",
  "social_contribution",
  "dividend_tax",
  "other",
]);

/** Account types in the chart of accounts */
export const finAccountTypeEnum = pgEnum("fin_account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "cost_of_goods",
  "tax",
]);

// ─── fin_tax_rates ────────────────────────────────────────────────────────────

/**
 * Versioned tax rate table: each row is a rate active from effectiveFrom to effectiveTo (exclusive).
 * tenantId = null means the rate is a global default for that country (shared seed data).
 * tenantId set means the tenant has a custom override for that country/kind.
 */
export const finTaxRates = pgTable(
  "fin_tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tenant override; NULL = global seed rate */
    tenantId: uuid("tenant_id"),
    /** ISO 3166-1 alpha-2: "MD", "RO", etc. */
    country: char("country", { length: 2 }).notNull(),
    kind: finTaxKindEnum("kind").notNull(),
    name: text("name").notNull(),
    /** Rate as a percentage (e.g. 20.0000 for 20%) */
    ratePct: numeric("rate_pct", { precision: 6, scale: 4 }).notNull(),
    /** The date from which this rate is effective (inclusive) */
    effectiveFrom: date("effective_from").notNull(),
    /** The date until which this rate is effective (exclusive, NULL = still active) */
    effectiveTo: date("effective_to"),
    /** Mark as the default rate for this country/kind combination */
    isDefault: boolean("is_default").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCountryIdx: index("fin_tax_rates_tenant_country_idx").on(t.tenantId, t.country),
    countryKindIdx: index("fin_tax_rates_country_kind_idx").on(t.country, t.kind),
  })
);

// ─── fin_chart_of_accounts ────────────────────────────────────────────────────

/**
 * Chart of accounts per tenant+country.
 * tenantId = null means global seed data for that country.
 * A tenant can have its own accounts alongside the seed data (or override by copying + modifying).
 */
export const finChartOfAccounts = pgTable(
  "fin_chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tenant override; NULL = global seed chart */
    tenantId: uuid("tenant_id"),
    country: char("country", { length: 2 }).notNull(),
    /** Account number/code (e.g. "221", "4426", "521") */
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    accountType: finAccountTypeEnum("account_type").notNull(),
    /** Parent account code for hierarchy (e.g. "22" is parent of "221") */
    parentCode: text("parent_code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCountryIdx: index("fin_chart_tenant_country_idx").on(t.tenantId, t.country),
    /** Unique account code per tenant+country combination */
    tenantCodeUniq: unique("fin_chart_tenant_code_uniq").on(t.tenantId, t.accountCode, t.country),
  })
);
