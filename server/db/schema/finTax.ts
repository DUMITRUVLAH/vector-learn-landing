/**
 * FISC-001: FinDesk — Modul fiscal (perioade + declarații)
 *
 * Tables:
 *   fin_tax_periods      — perioade fiscale (lunar/trimestrial/anual) per tenant
 *   fin_tax_declarations — declarații generate per perioadă (TVA12-MD, D394-RO, D301-RO, income_md)
 *
 * Migration: drizzle/0121_fin_tax.sql
 *
 * Design decisions:
 * - FIN-CORE §1.10 + regulile #1, #2, #4: calcule DETERMINISTE în cod, nu AI.
 * - fin_tax_periods: o perioadă poate fi lunară (month != null), trimestrială (quarter != null)
 *   sau anuală. start_date/end_date permit raportare oricând, inclusiv perioadă personalizată.
 * - fin_tax_declarations: legată la perioadă. Câmpul `payload` (JSONB) stochează rezultatul
 *   calculului (TVA colectat, deductibil, de plată, impozit venit) — scris de FISC-002.
 *   La FISC-001, payload rămâne `{}` (nu calculat).
 * - Enum-uri create idempotent cu DO $$ BEGIN IF NOT EXISTS … END $$; (portabilitate PGlite+Postgres).
 * - Banii: ÎNTOTDEAUNA în cenți (integer). (FIN-CORE regula #10.)
 * - Tenant isolation: TOATE interogările filtrează explicit după tenant_id.
 * - Portabilitate PGlite↔Postgres: usați db.query.X.findMany() (nu raw execute).
 *
 * Reuse:
 * - `tenants` table FK (cascadă delete).
 * - Pattern multi-tenant de la server/routes/invoices.ts.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Tipul perioadei fiscale. */
export const finTaxPeriodTypeEnum = pgEnum("fin_tax_period_type", [
  "monthly",      // lunar (TVA12-MD, D394-RO)
  "quarterly",    // trimestrial (unele declarații RO)
  "annual",       // anual (impozit pe venit / bilanț)
]);

/** Statusul perioadei fiscale. */
export const finTaxPeriodStatusEnum = pgEnum("fin_tax_period_status", [
  "open",    // perioadă deschisă — tranzacțiile pot fi adăugate
  "locked",  // înghețată — nu mai permit modificări, declarații în lucru
  "filed",   // toate declarațiile depuse la autorități
]);

/** Tipul declarației fiscale. */
export const finDeclarationTypeEnum = pgEnum("fin_declaration_type", [
  "tva12_md",   // Declarație TVA lunară, Republica Moldova (SFS)
  "d394_ro",    // Declarație informativă D394, România (ANAF)
  "d301_ro",    // Cerere ramburs TVA D301, România (ANAF)
  "income_md",  // Declarație impozit pe venit, Republica Moldova
]);

/** Statusul declarației. */
export const finDeclarationStatusEnum = pgEnum("fin_declaration_status", [
  "draft",   // creat, necompletă (payload gol sau parțial)
  "ready",   // calculat, gata de depunere
  "filed",   // depus la autorități (filed_at populat)
]);

// ─── fin_tax_periods ──────────────────────────────────────────────────────────

/**
 * Perioade fiscale per tenant.
 *
 * O perioadă = un interval de timp pentru care se întocmesc declarații fiscale.
 * Exemple: luna 2025-01 (monthly), trimestrul Q1 2025 (quarterly), anul 2025 (annual).
 */
export const finTaxPeriods = pgTable(
  "fin_tax_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține perioada. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Tipul perioadei: lunar, trimestrial, anual. */
    periodType: finTaxPeriodTypeEnum("period_type").notNull(),

    /** Anul calendaristic al perioadei. */
    year: integer("year").notNull(),

    /**
     * Luna (1–12), utilizată când period_type = 'monthly'.
     * NULL pentru perioade trimestriale sau anuale.
     */
    month: integer("month"),

    /**
     * Trimestrul (1–4), utilizat când period_type = 'quarterly'.
     * NULL pentru perioade lunare sau anuale.
     */
    quarter: integer("quarter"),

    /** Prima zi a perioadei. */
    startDate: date("start_date").notNull(),

    /** Ultima zi a perioadei (inclusiv). */
    endDate: date("end_date").notNull(),

    /** Statusul perioadei fiscale. */
    status: finTaxPeriodStatusEnum("status").notNull().default("open"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_tax_periods_tenant_idx").on(t.tenantId),
    index("fin_tax_periods_tenant_year_idx").on(t.tenantId, t.year),
    index("fin_tax_periods_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── fin_tax_declarations ─────────────────────────────────────────────────────

/**
 * Declarații fiscale generate per perioadă.
 *
 * Câmpul `payload` (JSONB) stochează rezultatul calculului fiscal (TVA colectat,
 * deductibil, de plată, impozit venit, nr. facturi incluse, etc.).
 * Structura payload este completată de FISC-002 (motor calcul TVA determinist).
 * La creare (FISC-001), payload = '{}' (nedeterminat).
 */
export const finTaxDeclarations = pgTable(
  "fin_tax_declarations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține declarația. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Perioada fiscală corespunzătoare.
     * FK → fin_tax_periods.id (cascade delete).
     */
    periodId: uuid("period_id")
      .notNull()
      .references(() => finTaxPeriods.id, { onDelete: "cascade" }),

    /** Tipul declarației: tva12_md, d394_ro, d301_ro, income_md. */
    declarationType: finDeclarationTypeEnum("declaration_type").notNull(),

    /** Statusul declarației: draft / ready / filed. */
    status: finDeclarationStatusEnum("status").notNull().default("draft"),

    /**
     * Data la care declarația a fost depusă la autorități.
     * NULL dacă nu a fost depusă.
     */
    filedAt: timestamp("filed_at", { withTimezone: true }),

    /**
     * Note opționale: număr înregistrare SFS/ANAF, observații contabil.
     */
    notes: text("notes"),

    /**
     * Payload JSONB — datele calculului fiscal, completat de FISC-002.
     * Structură așteptată (opacă la nivelul FISC-001):
     * {
     *   vat_collected_cents: number,
     *   vat_deductible_cents: number,
     *   vat_due_cents: number,
     *   income_tax_base_cents: number,
     *   income_tax_cents: number,
     *   rate_pct: number,
     *   calculated_at: string,
     *   invoice_count: number,
     *   expense_count: number,
     * }
     */
    payload: jsonb("payload").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_tax_decl_tenant_idx").on(t.tenantId),
    index("fin_tax_decl_period_idx").on(t.periodId),
    index("fin_tax_decl_type_idx").on(t.tenantId, t.declarationType),
    index("fin_tax_decl_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── TypeScript inference types ───────────────────────────────────────────────

export type FinTaxPeriod = typeof finTaxPeriods.$inferSelect;
export type InsertFinTaxPeriod = typeof finTaxPeriods.$inferInsert;
export type FinTaxPeriodType = (typeof finTaxPeriodTypeEnum.enumValues)[number];
export type FinTaxPeriodStatus = (typeof finTaxPeriodStatusEnum.enumValues)[number];

export type FinTaxDeclaration = typeof finTaxDeclarations.$inferSelect;
export type InsertFinTaxDeclaration = typeof finTaxDeclarations.$inferInsert;
export type FinDeclarationType = (typeof finDeclarationTypeEnum.enumValues)[number];
export type FinDeclarationStatus = (typeof finDeclarationStatusEnum.enumValues)[number];

// ─── Label maps (Romanian) ────────────────────────────────────────────────────

export const FIN_TAX_PERIOD_TYPE_LABELS: Record<FinTaxPeriodType, string> = {
  monthly: "Lunar",
  quarterly: "Trimestrial",
  annual: "Anual",
};

export const FIN_TAX_PERIOD_STATUS_LABELS: Record<FinTaxPeriodStatus, string> = {
  open: "Deschisă",
  locked: "Blocată",
  filed: "Depusă",
};

export const FIN_DECLARATION_TYPE_LABELS: Record<FinDeclarationType, string> = {
  tva12_md: "TVA12 (MD)",
  d394_ro: "D394 (RO)",
  d301_ro: "D301 (RO)",
  income_md: "Impozit venit (MD)",
};

export const FIN_DECLARATION_STATUS_LABELS: Record<FinDeclarationStatus, string> = {
  draft: "Ciornă",
  ready: "Gata",
  filed: "Depusă",
};
