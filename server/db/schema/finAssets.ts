/**
 * ASSET-001 (FIN): FinDesk — Schema modul Active Fixe (Fixed Assets)
 *
 * Tables:
 *   fin_assets               — active fixe per tenant (laptop, proiector, vehicul, etc.)
 *   fin_depreciation_entries — înregistrări amortizare DETERMINIST per activ per lună
 *
 * Migration: drizzle/0116_fin_assets.sql
 *
 * Design decisions:
 * - FIN-CORE §1.12 + regulile #3, #4:
 *   - Calculul amortizării este DETERMINIST — liniar sau degresiv (ASSET-002)
 *   - Confirmarea amortizării postează cheltuiala în fin_expenses (ASSET-002)
 *   - Metode suportate: linear (amortizare liniară) și declining_balance (degresivă)
 * - Banii: ÎNTOTDEAUNA în cenți (integer). (FIN-CORE regula #10)
 * - Tenant isolation: TOATE interogările filtrează explicit după tenant_id.
 * - Constraint unic (asset_id, period_month) — un activ nu se amortizează de 2× pe lună.
 * - expense_id: NULL până când ASSET-002 postează cheltuiala în fin_expenses.
 *
 * Reuse:
 * - `tenants` table FK (cascadă delete).
 * - Pattern multi-tenant din finPayroll.ts.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  date,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Metoda de amortizare. */
export const finDepreciationMethodEnum = pgEnum("fin_depreciation_method", [
  "linear",            // Amortizare liniară: cotă fixă pe toată durata
  "declining_balance", // Amortizare degresivă: cotă aplicată pe valoarea rămasă
]);

/** Statusul activului fix. */
export const finAssetStatusEnum = pgEnum("fin_asset_status", [
  "active",             // Activ în folosință, în curs de amortizare
  "fully_depreciated",  // Amortizat complet (valoare netă = valoare reziduală)
  "sold",               // Vândut (scos din gestiune)
  "scrapped",           // Casat / distrus
]);

// ─── fin_assets ───────────────────────────────────────────────────────────────

/**
 * Active fixe per tenant.
 *
 * Un activ fix = bun cu valoare > prag de semnificație (stabilit de contabil),
 * cu durată de utilizare > 1 an. Ex: laptop, proiector, vehicul, mobilier.
 *
 * Amortizarea lunară este calculată DETERMINIST de ASSET-002.
 */
export const finAssets = pgTable(
  "fin_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține activul. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Denumirea activului fix. */
    name: varchar("name", { length: 255 }).notNull(),

    /** Descriere opțională (nr. serie, specificații). */
    description: text("description"),

    /**
     * Categoria activului (freeform).
     * Ex: "IT", "mobilier", "transport", "echipament", "imobil".
     * Ajută la gruparea rapoartelor.
     */
    category: varchar("category", { length: 100 }),

    /**
     * Data punerii în funcțiune (data de start a amortizării).
     * Format: DATE (fără oră).
     */
    acquisitionDate: date("acquisition_date").notNull(),

    /**
     * Valoarea de intrare (cost achiziție), în cenți.
     * Aceasta este baza de calcul pentru amortizarea liniară.
     */
    acquisitionCostCents: integer("acquisition_cost_cents").notNull().default(0),

    /**
     * Valoarea reziduală (valoarea estimată la sfârșitul duratei de viață), în cenți.
     * Pentru amortizare liniară: baza amortizabilă = acquisitionCostCents − residualValueCents.
     * De obicei 0 (amortizare completă).
     */
    residualValueCents: integer("residual_value_cents").notNull().default(0),

    /**
     * Durata de viață utilă, în luni.
     * Ex: laptop = 36 luni, vehicul = 60 luni, clădire = 360 luni.
     */
    usefulLifeMonths: integer("useful_life_months").notNull().default(36),

    /**
     * Metoda de amortizare:
     * - linear: amortizare liniară — cotă fixă = (acquisitionCostCents − residualValueCents) / usefulLifeMonths
     * - declining_balance: amortizare degresivă — cotă % aplicată pe valoarea netă rămasă
     */
    depreciationMethod: finDepreciationMethodEnum("depreciation_method")
      .notNull()
      .default("linear"),

    /** Statusul activului. */
    status: finAssetStatusEnum("status").notNull().default("active"),

    /** Note opționale contabil (furnizor, serie, locație). */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_assets_tenant_idx").on(t.tenantId),
    index("fin_assets_tenant_status_idx").on(t.tenantId, t.status),
    index("fin_assets_tenant_category_idx").on(t.tenantId, t.category),
  ]
);

// ─── fin_depreciation_entries ─────────────────────────────────────────────────

/**
 * Înregistrări de amortizare lunară per activ.
 *
 * Fiecare rând = o lună de amortizare calculată DETERMINIST de ASSET-002.
 * Constraint unic (asset_id, period_month) previne înregistrări duble.
 *
 * La confirmare (ASSET-002), expense_id se populează cu ID-ul din fin_expenses.
 */
export const finDepreciationEntries = pgTable(
  "fin_depreciation_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține înregistrarea. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Activul amortizat. */
    assetId: uuid("asset_id")
      .notNull()
      .references(() => finAssets.id, { onDelete: "cascade" }),

    /**
     * Luna perioadei (format YYYY-MM).
     * Ex: "2025-01" = Ianuarie 2025.
     */
    periodMonth: varchar("period_month", { length: 7 }).notNull(),

    /**
     * Suma amortizată în această lună, în cenți.
     * Pentru metoda liniară: constant = (acquisitionCostCents − residualValueCents) / usefulLifeMonths.
     * Pentru metoda degresivă: variabilă = bookValue_luna_precedentă × cota_anuală / 12.
     */
    depreciationCents: integer("depreciation_cents").notNull().default(0),

    /**
     * Valoarea contabilă netă după această înregistrare, în cenți.
     * bookValue = bookValue_luna_precedentă − depreciationCents.
     * La prima lună: bookValue = acquisitionCostCents − depreciationCents.
     * Nu poate fi sub residualValueCents.
     */
    bookValueCents: integer("book_value_cents").notNull().default(0),

    /**
     * Referință spre cheltuiala postată în fin_expenses (FIN-CORE regula #3).
     * NULL dacă amortizarea nu a fost încă postată (ASSET-002 o va face).
     * Opțional — fin_expenses poate să nu existe pe ramura curentă.
     */
    expenseId: uuid("expense_id"),

    /** Note opționale per înregistrare. */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_depr_entries_tenant_idx").on(t.tenantId),
    index("fin_depr_entries_asset_idx").on(t.assetId),
    index("fin_depr_entries_asset_month_idx").on(t.assetId, t.periodMonth),
    // Constraint unic: un activ se amortizează o singură dată pe lună
    unique("fin_depr_entries_asset_month_unique").on(t.assetId, t.periodMonth),
  ]
);

// ─── TypeScript inference types ───────────────────────────────────────────────

export type FinAsset = typeof finAssets.$inferSelect;
export type InsertFinAsset = typeof finAssets.$inferInsert;
export type FinDepreciationMethod =
  (typeof finDepreciationMethodEnum.enumValues)[number];
export type FinAssetStatus = (typeof finAssetStatusEnum.enumValues)[number];

export type FinDepreciationEntry = typeof finDepreciationEntries.$inferSelect;
export type InsertFinDepreciationEntry =
  typeof finDepreciationEntries.$inferInsert;

// ─── Label maps ───────────────────────────────────────────────────────────────

export const FIN_DEPRECIATION_METHOD_LABELS: Record<
  FinDepreciationMethod,
  string
> = {
  linear: "Liniară",
  declining_balance: "Degresivă",
};

export const FIN_ASSET_STATUS_LABELS: Record<FinAssetStatus, string> = {
  active: "Activ",
  fully_depreciated: "Amortizat complet",
  sold: "Vândut",
  scrapped: "Casat",
};

// ─── Drizzle relations ────────────────────────────────────────────────────────

/** finAssets → entries (one-to-many). */
export const finAssetsRelations = relations(finAssets, ({ many }) => ({
  depreciationEntries: many(finDepreciationEntries),
}));

/** finDepreciationEntries → asset (many-to-one). */
export const finDepreciationEntriesRelations = relations(
  finDepreciationEntries,
  ({ one }) => ({
    asset: one(finAssets, {
      fields: [finDepreciationEntries.assetId],
      references: [finAssets.id],
    }),
  })
);
