/**
 * FISC-002: Motor calcul TVA + impozit venit — DETERMINIST, nu AI (FIN-CORE regula #4).
 *
 * Calculul se bazează pe:
 *   - TVA colectat:   SUM(invoice.vat_cents) pentru facturi cu issued_date în perioadă
 *   - TVA deductibil: SUM(expense.vat_deductible_cents) pentru cheltuieli deductibile în perioadă
 *   - TVA de plată:   colectat − deductibil
 *   - Impozit venit:  (total_venituri − total_cheltuieli) × cota_income_tax / 10000
 *
 * Deoarece fin_invoices și fin_expenses sunt pe ramuri nemergate, calculatorul acceptă datele
 * direct ca parametri (injecție de dependențe) — testabil și portabil.
 *
 * ATENȚIE: AI nu intervine în NICIO parte a acestui modul. Cotele provin din parametri
 * (stocate în fin_registry_items sau config tenant), nu hardcodate (cu excepția default-ului
 * de 20% MD / 19% RO pentru backward-compatibility).
 */

export interface TaxLineItem {
  /** Suma de bază (fără TVA), în cenți */
  baseCents: number;
  /** TVA aferent, în cenți */
  vatCents: number;
  /** Cota TVA (basis points: 2000 = 20%, 1900 = 19%, 900 = 9%, 500 = 5%, 0 = 0%) */
  vatRateBp: number;
  /** Dacă este deductibil (true = cheltuială cu drept de deducere TVA) */
  deductible?: boolean;
}

export interface TaxCalculationInput {
  /** Perioade: start și end (YYYY-MM-DD) */
  startDate: string;
  endDate: string;
  /** Facturi emise în perioadă cu status sent/paid */
  invoiceLines: TaxLineItem[];
  /** Cheltuieli cu drept de deducere TVA în perioadă */
  expenseLines: TaxLineItem[];
  /** Cota impozit pe venit în basis points (ex: 1200 = 12% MD, 1600 = 16% RO) */
  incomeTaxRateBp: number;
  /** Total venituri brute în perioadă (fără TVA), în cenți */
  totalRevenueCents: number;
  /** Total cheltuieli brute în perioadă (fără TVA), în cenți */
  totalExpenseCents: number;
}

export interface TaxCalculationResult {
  /** TVA colectat total (suma TVA de pe facturi), cenți */
  vatCollectedCents: number;
  /** TVA deductibil total (suma TVA de pe cheltuieli deductibile), cenți */
  vatDeductibleCents: number;
  /** TVA de plată = colectat − deductibil (negativ = ramburs) */
  vatDueCents: number;
  /** Baza de calcul impozit venit = venituri − cheltuieli, cenți */
  incomeTaxBaseCents: number;
  /** Impozit pe venit = baza × cota, cenți */
  incomeTaxCents: number;
  /** Cota impozit venit aplicată (%) cu 2 zecimale */
  incomeTaxRatePct: number;
  /** Detaliu TVA per cotă: { "20": { collected: N, deductible: M } } */
  vatByRate: Record<string, { collectedCents: number; deductibleCents: number }>;
  /** Număr facturi procesate */
  invoiceCount: number;
  /** Număr cheltuieli procesate */
  expenseCount: number;
  /** ISO timestamp al calculului */
  calculatedAt: string;
}

/**
 * Calculează TVA și impozit venit pentru o perioadă fiscală.
 * 100% determinist — niciun apel AI, nicio aleatorie.
 *
 * @param input — datele de intrare (facturi + cheltuieli + cote)
 * @returns TaxCalculationResult — payload stocat în fin_tax_declarations.payload
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  // ─── TVA colectat per cotă ─────────────────────────────────────────────────
  const vatByRate: Record<string, { collectedCents: number; deductibleCents: number }> = {};

  let vatCollectedCents = 0;
  for (const line of input.invoiceLines) {
    vatCollectedCents += line.vatCents;
    const rateKey = String(line.vatRateBp);
    if (!vatByRate[rateKey]) {
      vatByRate[rateKey] = { collectedCents: 0, deductibleCents: 0 };
    }
    vatByRate[rateKey].collectedCents += line.vatCents;
  }

  // ─── TVA deductibil per cotă ───────────────────────────────────────────────
  let vatDeductibleCents = 0;
  for (const line of input.expenseLines) {
    if (!line.deductible) continue;
    vatDeductibleCents += line.vatCents;
    const rateKey = String(line.vatRateBp);
    if (!vatByRate[rateKey]) {
      vatByRate[rateKey] = { collectedCents: 0, deductibleCents: 0 };
    }
    vatByRate[rateKey].deductibleCents += line.vatCents;
  }

  // ─── TVA de plată ──────────────────────────────────────────────────────────
  const vatDueCents = vatCollectedCents - vatDeductibleCents;

  // ─── Impozit pe venit ──────────────────────────────────────────────────────
  const incomeTaxBaseCents = input.totalRevenueCents - input.totalExpenseCents;
  // Calculul doar pe baza pozitivă — pierderea nu generează impozit
  const taxableBase = Math.max(0, incomeTaxBaseCents);
  const incomeTaxCents = Math.round((taxableBase * input.incomeTaxRateBp) / 10000);
  const incomeTaxRatePct = parseFloat((input.incomeTaxRateBp / 100).toFixed(2));

  return {
    vatCollectedCents,
    vatDeductibleCents,
    vatDueCents,
    incomeTaxBaseCents,
    incomeTaxCents,
    incomeTaxRatePct,
    vatByRate,
    invoiceCount: input.invoiceLines.length,
    expenseCount: input.expenseLines.length,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Convertește TaxCalculationResult în JSONB payload stocat în fin_tax_declarations.
 * Câmpurile snake_case pentru compatibilitate cu FISC-003 (generator declarații).
 */
export function toPayload(result: TaxCalculationResult): Record<string, unknown> {
  return {
    vat_collected_cents: result.vatCollectedCents,
    vat_deductible_cents: result.vatDeductibleCents,
    vat_due_cents: result.vatDueCents,
    income_tax_base_cents: result.incomeTaxBaseCents,
    income_tax_cents: result.incomeTaxCents,
    income_tax_rate_pct: result.incomeTaxRatePct,
    vat_by_rate: result.vatByRate,
    invoice_count: result.invoiceCount,
    expense_count: result.expenseCount,
    calculated_at: result.calculatedAt,
  };
}

/**
 * Default cote TVA per jurisdicție (basis points).
 * Acestea sunt valori DEFAULT — cotele reale vin din REGISTRY sau config tenant.
 */
export const DEFAULT_VAT_RATES: Record<string, number> = {
  MD: 2000, // 20% Moldova standard
  RO: 1900, // 19% România standard
};

/**
 * Default cote impozit venit per jurisdicție (basis points).
 */
export const DEFAULT_INCOME_TAX_RATES: Record<string, number> = {
  MD: 1200, // 12% Moldova (IMM)
  RO: 1600, // 16% România
};
