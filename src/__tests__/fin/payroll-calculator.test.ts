/**
 * PAY-002 — Teste motor calcul salarii DETERMINIST
 *
 * T-PAY-002-1 [blocant]: Given angajat cu brut=1_000_000 cenți MD (10_000 MDL),
 *   When calcul, Then:
 *     CAS_angajat = 240_000 (24%)
 *     CASS_angajat = 90_000 (9%)
 *     baza_impozabila = 1_000_000 - 240_000 - 90_000 = 670_000
 *     impozit_venit = round(670_000 * 12%) = 80_400
 *     net = 1_000_000 - 240_000 - 90_000 - 80_400 = 589_600
 */

import { describe, it, expect } from "vitest";
import {
  calculatePayroll,
  toDeductionsJsonb,
  DEFAULT_PAYROLL_RATES,
} from "../../../server/lib/fin/payrollCalculator";

describe("calculatePayroll — MD (default rates)", () => {
  const rates = DEFAULT_PAYROLL_RATES.MD;

  // T-PAY-002-1 [blocant] — calcul exact 10_000 MDL brut
  it("brut=1_000_000 cenți (10_000 MDL) → net correct", () => {
    const result = calculatePayroll({ grossCents: 1_000_000, rates });

    // CAS angajat 24%
    expect(result.casEmployeeCents).toBe(240_000);
    // CASS angajat 9%
    expect(result.cassEmployeeCents).toBe(90_000);
    // Baza impozabilă = 1_000_000 - 240_000 - 90_000
    expect(result.taxableBaseCents).toBe(670_000);
    // Impozit venit 12% din baza impozabilă
    expect(result.incomeTaxCents).toBe(80_400);
    // Net = brut - CAS - CASS - impozit
    expect(result.netCents).toBe(589_600);
    // Total rețineri
    expect(result.totalDeductionsCents).toBe(410_400);
  });

  it("brut=0 → net=0, nicio reținere", () => {
    const result = calculatePayroll({ grossCents: 0, rates });
    expect(result.netCents).toBe(0);
    expect(result.totalDeductionsCents).toBe(0);
    expect(result.employerCostCents).toBe(0);
  });

  it("employer_cost = brut + CAS_angajator(24%) + CASS_angajator(4%)", () => {
    const result = calculatePayroll({ grossCents: 1_000_000, rates });
    expect(result.casEmployerCents).toBe(240_000);
    expect(result.cassEmployerCents).toBe(40_000);
    expect(result.employerCostCents).toBe(1_000_000 + 240_000 + 40_000);
  });

  it("round-trip: toDeductionsJsonb conține câmpurile așteptate", () => {
    const result = calculatePayroll({ grossCents: 500_000, rates });
    const jsonb = toDeductionsJsonb(result);
    expect(jsonb).toHaveProperty("cas_employee_cents");
    expect(jsonb).toHaveProperty("cass_employee_cents");
    expect(jsonb).toHaveProperty("income_tax_cents");
    expect(jsonb).toHaveProperty("total_deductions_cents");
    expect(jsonb).toHaveProperty("cas_employer_cents");
    expect(jsonb).toHaveProperty("cass_employer_cents");
    expect(jsonb["total_deductions_cents"]).toBe(result.totalDeductionsCents);
  });
});

describe("calculatePayroll — RO rates", () => {
  const rates = DEFAULT_PAYROLL_RATES.RO;

  it("CAS angajat=10%, CASS angajat=10%, employer cost = brut (angajator nu plătește CAS/CASS din 2018)", () => {
    const result = calculatePayroll({ grossCents: 1_000_000, rates });
    expect(result.casEmployeeCents).toBe(100_000); // 10%
    expect(result.cassEmployeeCents).toBe(100_000); // 10%
    expect(result.casEmployerCents).toBe(0); // 0%
    expect(result.cassEmployerCents).toBe(0); // 0%
    expect(result.employerCostCents).toBe(1_000_000); // exact brut
  });

  it("baza impozabilă RO = brut - 10% - 10% = 80%", () => {
    const result = calculatePayroll({ grossCents: 1_000_000, rates });
    expect(result.taxableBaseCents).toBe(800_000);
    // impozit 10% din 800_000
    expect(result.incomeTaxCents).toBe(80_000);
    // net = 1_000_000 - 100_000 - 100_000 - 80_000
    expect(result.netCents).toBe(720_000);
  });
});

// T-PAY-002-5 [normal] — cotă custom din REGISTRY
describe("calculatePayroll — cotă custom (override)", () => {
  it("CAS 28% → casEmployeeCents mai mare", () => {
    const customRates = {
      ...DEFAULT_PAYROLL_RATES.MD,
      casEmployeeBp: 2800, // 28%
    };
    const result = calculatePayroll({ grossCents: 1_000_000, rates: customRates });
    expect(result.casEmployeeCents).toBe(280_000);
    // Net mai mic cu diferența
    expect(result.netCents).toBeLessThan(589_600);
  });
});
