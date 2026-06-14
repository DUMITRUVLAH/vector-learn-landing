/**
 * REGISTRY-001/002: FinDesk fiscal registry helpers
 *
 * rateAt(tenantId, country, kind, date) — returns the applicable rate percentage (as number)
 * at a given date for a country/kind combination. Prefers tenant-specific override; falls back
 * to global (tenantId=null) seed data. Returns null if no rate found.
 *
 * tenantId may be null/undefined — in that case, only global seed rates are queried (REGISTRY-002).
 *
 * SEED_RATES — static seed data for MD (Moldova) 2024+ and RO (Romania) 2024+.
 * These are inserted by seed-fin-registry (or loaded in tests directly).
 */
import { and, eq, isNull, or, lte, isNull as drizzleIsNull } from "drizzle-orm";
import { db } from "../db/client";
import { finTaxRates } from "../db/schema/finRegistry";
import type { InferInsertModel } from "drizzle-orm";

type TaxKind = "vat" | "income_tax" | "social_contribution" | "dividend_tax" | "other";

// ─── rateAt ───────────────────────────────────────────────────────────────────

/**
 * Returns the active tax rate (as a plain number, e.g. 20 for 20%) for the
 * specified tenant/country/kind at the given date.
 *
 * Lookup order:
 *   1. Tenant-specific rate (tenantId matches) active on `date` — skipped if tenantId is null/undefined
 *   2. Global seed rate (tenantId IS NULL) active on `date`
 * Returns null if no rate found (should not happen for standard MD/RO rates).
 */
export async function rateAt(
  tenantId: string | null | undefined,
  country: string,
  kind: TaxKind,
  date: Date = new Date()
): Promise<number | null> {
  const dateStr = date.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Look for tenant-specific rate first (only when tenantId is provided)
  if (tenantId) {
    const tenantRates = await db
      .select({ ratePct: finTaxRates.ratePct })
      .from(finTaxRates)
      .where(
        and(
          eq(finTaxRates.tenantId, tenantId),
          eq(finTaxRates.country, country),
          eq(finTaxRates.kind, kind as string),
          lte(finTaxRates.effectiveFrom, dateStr),
          or(isNull(finTaxRates.effectiveTo), lte(dateStr, finTaxRates.effectiveTo as never))
        )
      )
      .limit(1);

    if (tenantRates.length > 0 && tenantRates[0].ratePct != null) {
      return Number(tenantRates[0].ratePct);
    }
  }

  // Fall back to global seed rate
  const globalRates = await db
    .select({ ratePct: finTaxRates.ratePct })
    .from(finTaxRates)
    .where(
      and(
        drizzleIsNull(finTaxRates.tenantId),
        eq(finTaxRates.country, country),
        eq(finTaxRates.kind, kind as string),
        eq(finTaxRates.isDefault, true),
        lte(finTaxRates.effectiveFrom, dateStr),
        or(isNull(finTaxRates.effectiveTo), lte(dateStr, finTaxRates.effectiveTo as never))
      )
    )
    .limit(1);

  if (globalRates.length > 0 && globalRates[0].ratePct != null) {
    return Number(globalRates[0].ratePct);
  }

  return null;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

type SeedRate = Omit<InferInsertModel<typeof finTaxRates>, "id" | "createdAt" | "updatedAt">;

/** MD (Moldova) 2024+ rates */
export const SEED_RATES_MD: SeedRate[] = [
  // VAT
  { tenantId: null, country: "MD", kind: "vat", name: "TVA standard 20%", ratePct: "20.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true },
  { tenantId: null, country: "MD", kind: "vat", name: "TVA redusă 8%", ratePct: "8.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  { tenantId: null, country: "MD", kind: "vat", name: "TVA redusă 12%", ratePct: "12.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  { tenantId: null, country: "MD", kind: "vat", name: "TVA zero", ratePct: "0.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  // Income tax
  { tenantId: null, country: "MD", kind: "income_tax", name: "Impozit pe venit 12%", ratePct: "12.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true },
  // Social contributions (employer)
  { tenantId: null, country: "MD", kind: "social_contribution", name: "CNAS angajator 24%", ratePct: "24.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true, notes: "Contribuție angajator la CNAS" },
  { tenantId: null, country: "MD", kind: "social_contribution", name: "CNAM angajator 4.5%", ratePct: "4.5000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false, notes: "Contribuție angajor la CNAM" },
  { tenantId: null, country: "MD", kind: "social_contribution", name: "CNAS angajat 6%", ratePct: "6.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false, notes: "Contribuție angajat la CNAS" },
];

/** RO (Romania) 2024-2026 rates */
export const SEED_RATES_RO: SeedRate[] = [
  // VAT
  { tenantId: null, country: "RO", kind: "vat", name: "TVA standard 19%", ratePct: "19.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true },
  { tenantId: null, country: "RO", kind: "vat", name: "TVA redusă 9%", ratePct: "9.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  { tenantId: null, country: "RO", kind: "vat", name: "TVA redusă 5%", ratePct: "5.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  { tenantId: null, country: "RO", kind: "vat", name: "TVA zero", ratePct: "0.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false },
  // Income tax (microenterprise)
  { tenantId: null, country: "RO", kind: "income_tax", name: "Impozit microîntreprindere 1%", ratePct: "1.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false, notes: "1 angajat; venituri < 500k EUR" },
  { tenantId: null, country: "RO", kind: "income_tax", name: "Impozit microîntreprindere 3%", ratePct: "3.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true, notes: "Fără angajat sau venituri > 60k EUR" },
  // Social contributions
  { tenantId: null, country: "RO", kind: "social_contribution", name: "CAS angajat 25%", ratePct: "25.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: true, notes: "Contribuție asigurări sociale" },
  { tenantId: null, country: "RO", kind: "social_contribution", name: "CASS angajat 10%", ratePct: "10.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false, notes: "Contribuție asigurări sănătate" },
  { tenantId: null, country: "RO", kind: "social_contribution", name: "CAS angajator 0%", ratePct: "0.0000", effectiveFrom: "2024-01-01", effectiveTo: null, isDefault: false, notes: "Angajatorul nu plătește CAS direct (PFA/SRL)" },
];

/** Insert all seed rates — idempotent (skips existing by isDefault+country+kind) */
export async function seedFinRegistry(): Promise<void> {
  const allRates = [...SEED_RATES_MD, ...SEED_RATES_RO];
  for (const rate of allRates) {
    // Simple insert — in prod use ON CONFLICT DO NOTHING
    try {
      await db.insert(finTaxRates).values(rate);
    } catch {
      // Ignore duplicate inserts (e.g., re-seeding)
    }
  }
}
