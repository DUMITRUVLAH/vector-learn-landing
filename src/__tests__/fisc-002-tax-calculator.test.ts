/**
 * FISC-002: Tests for taxCalculator — motor TVA determinist + impozit venit
 *
 * Tests: T-FISC-002-1..6
 * Scope: calcul TVA colectat/deductibil/de plată, impozit venit, idempotent, edge cases
 * AI nu intervine — toate calculele sunt deterministe în cod.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTax,
  toPayload,
  DEFAULT_VAT_RATES,
  DEFAULT_INCOME_TAX_RATES,
  type TaxCalculationInput,
} from "../../server/lib/fin/taxCalculator";

describe("FISC-002: taxCalculator — motor TVA determinist", () => {
  // T-FISC-002-2 [blocant] — scenariu principal: 3 facturi TVA 20% + 2 cheltuieli deductibile
  it("T-FISC-002-2: TVA colectat − deductibil = TVA de plată corect", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      invoiceLines: [
        { baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000 }, // 1000 lei + 200 TVA
        { baseCents: 200_000, vatCents: 40_000, vatRateBp: 2000 }, // 2000 lei + 400 TVA
        { baseCents: 300_000, vatCents: 60_000, vatRateBp: 2000 }, // 3000 lei + 600 TVA
      ],
      expenseLines: [
        { baseCents: 50_000, vatCents: 10_000, vatRateBp: 2000, deductible: true },
        { baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000, deductible: true },
      ],
      incomeTaxRateBp: 1200, // 12% MD
      totalRevenueCents: 600_000,
      totalExpenseCents: 150_000,
    };

    const result = calculateTax(input);

    // TVA colectat = 20000 + 40000 + 60000 = 120000 cenți
    expect(result.vatCollectedCents).toBe(120_000);
    // TVA deductibil = 10000 + 20000 = 30000 cenți
    expect(result.vatDeductibleCents).toBe(30_000);
    // TVA de plată = 120000 - 30000 = 90000 cenți (900 lei)
    expect(result.vatDueCents).toBe(90_000);
    // 3 facturi + 2 cheltuieli
    expect(result.invoiceCount).toBe(3);
    expect(result.expenseCount).toBe(2);
  });

  // Calcul impozit venit
  it("calculează impozit venit corect", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-03-31",
      invoiceLines: [],
      expenseLines: [],
      incomeTaxRateBp: 1200, // 12% MD
      totalRevenueCents: 1_000_000, // 10000 lei
      totalExpenseCents: 400_000,   // 4000 lei
    };

    const result = calculateTax(input);

    // Baza = 1000000 - 400000 = 600000 cenți
    expect(result.incomeTaxBaseCents).toBe(600_000);
    // Impozit = 600000 × 1200 / 10000 = 72000 cenți (720 lei)
    expect(result.incomeTaxCents).toBe(72_000);
    expect(result.incomeTaxRatePct).toBe(12.0);
  });

  // T-FISC-002-5 [normal] perioadă fără facturi sau cheltuieli → zero, nu eroare
  it("T-FISC-002-5: perioadă fără facturi sau cheltuieli → payload cu zerouri", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      invoiceLines: [],
      expenseLines: [],
      incomeTaxRateBp: 1900, // 19% RO
      totalRevenueCents: 0,
      totalExpenseCents: 0,
    };

    const result = calculateTax(input);

    expect(result.vatCollectedCents).toBe(0);
    expect(result.vatDeductibleCents).toBe(0);
    expect(result.vatDueCents).toBe(0);
    expect(result.incomeTaxBaseCents).toBe(0);
    expect(result.incomeTaxCents).toBe(0);
    expect(result.invoiceCount).toBe(0);
    expect(result.expenseCount).toBe(0);
  });

  // TVA de ramburs (negativ) — mai mult deductibil decât colectat
  it("TVA de ramburs (vat_due negativ) când deductibil > colectat", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
      invoiceLines: [
        { baseCents: 50_000, vatCents: 10_000, vatRateBp: 2000 },
      ],
      expenseLines: [
        { baseCents: 200_000, vatCents: 40_000, vatRateBp: 2000, deductible: true },
      ],
      incomeTaxRateBp: 1200,
      totalRevenueCents: 50_000,
      totalExpenseCents: 200_000,
    };

    const result = calculateTax(input);

    expect(result.vatDueCents).toBe(-30_000); // Ramburs TVA
    // Baza negativă → impozit 0 (nu se aplică pe pierdere)
    expect(result.incomeTaxBaseCents).toBe(-150_000);
    expect(result.incomeTaxCents).toBe(0); // taxableBase = max(0, -150000) = 0
  });

  // TVA per cotă (mai multe cote)
  it("grupează TVA corect per cotă (2000, 900, 0)", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      invoiceLines: [
        { baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000 }, // 20%
        { baseCents: 100_000, vatCents: 9_000,  vatRateBp: 900  }, // 9%
        { baseCents: 100_000, vatCents: 0,       vatRateBp: 0    }, // 0% export
      ],
      expenseLines: [],
      incomeTaxRateBp: 1200,
      totalRevenueCents: 300_000,
      totalExpenseCents: 0,
    };

    const result = calculateTax(input);

    expect(result.vatByRate["2000"]?.collectedCents).toBe(20_000);
    expect(result.vatByRate["900"]?.collectedCents).toBe(9_000);
    expect(result.vatByRate["0"]?.collectedCents).toBe(0);
    expect(result.vatCollectedCents).toBe(29_000);
  });

  // Cheltuieli non-deductibile sunt excluse
  it("cheltuielile non-deductibile sunt excluse din TVA deductibil", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      invoiceLines: [],
      expenseLines: [
        { baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000, deductible: true },
        { baseCents: 50_000,  vatCents: 10_000, vatRateBp: 2000, deductible: false }, // non-deductibil
      ],
      incomeTaxRateBp: 1200,
      totalRevenueCents: 0,
      totalExpenseCents: 150_000,
    };

    const result = calculateTax(input);

    // Doar prima cheltuială e deductibilă
    expect(result.vatDeductibleCents).toBe(20_000);
    expect(result.expenseCount).toBe(2); // ambele sunt numărate, doar una dedusă
  });

  // toPayload convertește corect la snake_case
  it("toPayload produce câmpuri snake_case corecte", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      invoiceLines: [{ baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000 }],
      expenseLines: [],
      incomeTaxRateBp: 1200,
      totalRevenueCents: 100_000,
      totalExpenseCents: 0,
    };

    const result = calculateTax(input);
    const payload = toPayload(result);

    expect(payload).toHaveProperty("vat_collected_cents", 20_000);
    expect(payload).toHaveProperty("vat_deductible_cents", 0);
    expect(payload).toHaveProperty("vat_due_cents", 20_000);
    expect(payload).toHaveProperty("income_tax_base_cents", 100_000);
    expect(payload).toHaveProperty("income_tax_cents");
    expect(payload).toHaveProperty("income_tax_rate_pct", 12.0);
    expect(payload).toHaveProperty("invoice_count", 1);
    expect(payload).toHaveProperty("expense_count", 0);
    expect(payload).toHaveProperty("calculated_at");
    expect(typeof payload["calculated_at"]).toBe("string");
  });

  // T-FISC-002-4 [normal] idempotent (calcul de 2 ori → același rezultat)
  it("T-FISC-002-4: calcul idempotent (același input = același output)", () => {
    const input: TaxCalculationInput = {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      invoiceLines: [{ baseCents: 500_000, vatCents: 100_000, vatRateBp: 2000 }],
      expenseLines: [{ baseCents: 100_000, vatCents: 20_000, vatRateBp: 2000, deductible: true }],
      incomeTaxRateBp: 1200,
      totalRevenueCents: 500_000,
      totalExpenseCents: 100_000,
    };

    const result1 = calculateTax(input);
    const result2 = calculateTax(input);

    expect(result1.vatCollectedCents).toBe(result2.vatCollectedCents);
    expect(result1.vatDeductibleCents).toBe(result2.vatDeductibleCents);
    expect(result1.vatDueCents).toBe(result2.vatDueCents);
    expect(result1.incomeTaxCents).toBe(result2.incomeTaxCents);
  });

  // Default cote
  it("DEFAULT_VAT_RATES și DEFAULT_INCOME_TAX_RATES definite", () => {
    expect(DEFAULT_VAT_RATES["MD"]).toBe(2000); // 20%
    expect(DEFAULT_VAT_RATES["RO"]).toBe(1900); // 19%
    expect(DEFAULT_INCOME_TAX_RATES["MD"]).toBe(1200); // 12%
    expect(DEFAULT_INCOME_TAX_RATES["RO"]).toBe(1600); // 16%
  });
});
