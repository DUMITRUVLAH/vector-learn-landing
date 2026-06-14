/**
 * @vitest-environment node
 *
 * ASSET-002: Motor amortizare DETERMINIST — teste unitare
 *
 * T-ASSET-002-1 [blocant]: amortizare liniară luna 1 — calcul corect
 * T-ASSET-002-2 [blocant]: amortizare liniară ultima lună — book value = 0, nu negativ
 * T-ASSET-002-3 [blocant]: amortizare degresivă luna 1 — calcul corect DDB
 * T-ASSET-002-4 [normal]: activ fully_depreciated → depreciation=0
 * T-ASSET-002-5 [normal]: getDepreciationMonthNumber — calcul corect numărul lunii
 */

import { describe, it, expect } from "vitest";
import {
  calculateDepreciation,
  calculateAssetDepreciation,
  getDepreciationMonthNumber,
} from "../../../server/lib/fin/depreciationCalculator";

// ─── Mock asset base ──────────────────────────────────────────────────────────

const laptopAsset = {
  id: "asset-001",
  acquisitionDate: "2024-01-15",
  acquisitionCostCents: 1_200_000, // 12.000,00 MDL
  residualValueCents: 0,
  usefulLifeMonths: 36,
  depreciationMethod: "linear" as const,
  status: "active" as const,
};

const proiectorAsset = {
  id: "asset-002",
  acquisitionDate: "2023-09-01",
  acquisitionCostCents: 800_000, // 8.000,00 MDL
  residualValueCents: 0,
  usefulLifeMonths: 60,
  depreciationMethod: "linear" as const,
  status: "active" as const,
};

const autoturismAsset = {
  id: "asset-003",
  acquisitionDate: "2022-03-20",
  acquisitionCostCents: 18_000_000, // 180.000,00 MDL
  residualValueCents: 2_000_000, // 20.000,00 MDL
  usefulLifeMonths: 60,
  depreciationMethod: "declining_balance" as const,
  status: "active" as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ASSET-002 — motor amortizare liniar", () => {
  // T-ASSET-002-1 [blocant]
  it("T-ASSET-002-1 [blocant]: amortizare liniară luna 1 — depreciationCents=33_333, bookValue=1_166_667", () => {
    const result = calculateDepreciation({
      asset: laptopAsset,
      periodMonth: "2024-02",
      previousBookValueCents: null, // prima lună
      depreciationMonthNumber: 1,
    });

    // 1_200_000 / 36 = 33_333.33... → floor = 33_333
    expect(result.depreciationCents).toBe(33_333);
    // book value = 1_200_000 − 33_333 = 1_166_667
    expect(result.bookValueCents).toBe(1_166_667);
    expect(result.isFullyDepreciated).toBe(false);
  });

  // T-ASSET-002-2 [blocant]
  it("T-ASSET-002-2 [blocant]: amortizare liniară ultima lună (60) — bookValue = 0 (nu negativ)", () => {
    // Proiector: 800_000 / 60 = 13_333.33... → floor = 13_333
    // After 59 months: book = 800_000 - 59 × 13_333 = 800_000 - 786_647 = 13_353
    // Ultima lună (60): amortizăm tot restul = 13_353
    const prevBookValue = 800_000 - 59 * 13_333; // = 13_353 (cu rest acumulat)

    const result = calculateDepreciation({
      asset: proiectorAsset,
      periodMonth: "2028-08",
      previousBookValueCents: prevBookValue,
      depreciationMonthNumber: 60, // ultima lună
    });

    // Ultima lună: amortizăm tot restul până la residual (0)
    expect(result.depreciationCents).toBe(prevBookValue);
    expect(result.bookValueCents).toBe(0);
    expect(result.isFullyDepreciated).toBe(true);
  });

  it("cartea lunii 1 nu e niciodată negativă", () => {
    const result = calculateDepreciation({
      asset: proiectorAsset,
      periodMonth: "2023-10",
      previousBookValueCents: null,
      depreciationMonthNumber: 1,
    });
    expect(result.bookValueCents).toBeGreaterThanOrEqual(0);
    expect(result.depreciationCents).toBeGreaterThan(0);
  });
});

describe("ASSET-002 — motor amortizare degresivă (DDB)", () => {
  // T-ASSET-002-3 [blocant]
  it("T-ASSET-002-3 [blocant]: amortizare degresivă luna 1 — DDB corect", () => {
    // annualRate = min(2/60, 1.0) = 0.03333...
    // depreciationCents = floor(18_000_000 × 0.03333.../12) = floor(50_000) = 50_000
    // bookValue = 18_000_000 - 50_000 = 17_950_000

    const result = calculateDepreciation({
      asset: autoturismAsset,
      periodMonth: "2022-04",
      previousBookValueCents: null, // prima lună
      depreciationMonthNumber: 1,
    });

    const annualRate = 2 / 60;
    const expected = Math.floor(18_000_000 * annualRate / 12);
    expect(result.depreciationCents).toBe(expected); // 50_000
    expect(result.bookValueCents).toBe(18_000_000 - expected); // 17_950_000
    expect(result.isFullyDepreciated).toBe(false);
  });

  it("amortizarea degresivă nu coboară sub valoarea reziduală", () => {
    // Ultimele luni: book value se apropie de residual
    const nearResidualBookValue = 2_100_000; // puțin peste residual 2_000_000

    const result = calculateDepreciation({
      asset: autoturismAsset,
      periodMonth: "2027-03",
      previousBookValueCents: nearResidualBookValue,
      depreciationMonthNumber: 59,
    });

    expect(result.bookValueCents).toBeGreaterThanOrEqual(autoturismAsset.residualValueCents);
  });
});

describe("ASSET-002 — activ fully_depreciated", () => {
  // T-ASSET-002-4 [normal]
  it("T-ASSET-002-5 [normal]: activ fully_depreciated → depreciationCents=0", () => {
    const fullyDepreciatedAsset = { ...laptopAsset, status: "fully_depreciated" as const };

    const result = calculateDepreciation({
      asset: fullyDepreciatedAsset,
      periodMonth: "2027-02",
      previousBookValueCents: 0,
      depreciationMonthNumber: 37, // după durata de viață
    });

    expect(result.depreciationCents).toBe(0);
    expect(result.isFullyDepreciated).toBe(true);
  });
});

describe("ASSET-002 — getDepreciationMonthNumber", () => {
  it("T-ASSET-002-5a [normal]: calculează numărul lunii corect", () => {
    // acquisitionDate=2024-01-15, periodMonth=2024-01 → luna 1
    expect(getDepreciationMonthNumber("2024-01-15", "2024-01")).toBe(1);
    // acquisitionDate=2024-01-15, periodMonth=2024-02 → luna 2
    expect(getDepreciationMonthNumber("2024-01-15", "2024-02")).toBe(2);
    // acquisitionDate=2024-01-15, periodMonth=2026-01 → luna 25
    expect(getDepreciationMonthNumber("2024-01-15", "2026-01")).toBe(25);
  });

  it("periodMonth anterior acquisitionDate → 0", () => {
    expect(getDepreciationMonthNumber("2024-02-01", "2024-01")).toBe(0);
  });
});

describe("ASSET-002 — calculateAssetDepreciation (batch)", () => {
  it("calculează corect folosind acquisitionDate", () => {
    const result = calculateAssetDepreciation({
      asset: laptopAsset,
      periodMonth: "2024-01",
      lastBookValueCents: null,
    });

    // Luna 1 (Jan 2024 = acquisitionDate lună)
    expect(result.monthNumber).toBe(1);
    expect(result.depreciationCents).toBe(Math.floor(1_200_000 / 36));
    expect(result.bookValueCents).toBeGreaterThan(0);
  });

  it("perioada anterioară acquisitionDate → depreciation=0", () => {
    const result = calculateAssetDepreciation({
      asset: laptopAsset,
      periodMonth: "2023-12", // înainte de jan 2024
      lastBookValueCents: null,
    });

    expect(result.monthNumber).toBe(0);
    expect(result.depreciationCents).toBe(0);
  });
});
