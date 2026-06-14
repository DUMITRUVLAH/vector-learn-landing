/**
 * FISC-004 — Teste motor termene fiscale (taxDeadlines.ts)
 *
 * T-FISC-004-2: Given perioadă TVA12-MD pentru luna 2025-01,
 *               When calcul termen, Then deadline = 2025-02-25.
 */

import { describe, it, expect } from "vitest";
import {
  monthlyDeadline25th,
  d301Deadline,
  incomeTaxMdDeadline,
  computeDeadlinesForPeriod,
} from "../../../server/lib/fin/taxDeadlines";

describe("monthlyDeadline25th — termene lunare (TVA12-MD, D394-RO)", () => {
  // T-FISC-004-2 [blocant]
  it("2025-01 → 2025-02-25", () => {
    expect(monthlyDeadline25th(2025, 1)).toBe("2025-02-25");
  });

  it("2025-12 → 2026-01-25 (roll-over an)", () => {
    expect(monthlyDeadline25th(2025, 12)).toBe("2026-01-25");
  });

  it("2024-02 → 2024-03-25", () => {
    expect(monthlyDeadline25th(2024, 2)).toBe("2024-03-25");
  });
});

describe("d301Deadline — 45 zile după sfârşitul perioadei", () => {
  it("2025-01-31 + 45 zile = 2025-03-17", () => {
    expect(d301Deadline("2025-01-31")).toBe("2025-03-17");
  });

  it("2025-12-31 + 45 zile = 2026-02-14", () => {
    expect(d301Deadline("2025-12-31")).toBe("2026-02-14");
  });
});

describe("incomeTaxMdDeadline — 25 Martie an următor", () => {
  it("2025 → 2026-03-25", () => {
    expect(incomeTaxMdDeadline(2025)).toBe("2026-03-25");
  });
});

describe("computeDeadlinesForPeriod", () => {
  const base = {
    periodId: "period-1",
    periodLabel: "2025-01",
    periodType: "monthly" as const,
    year: 2025,
    month: 1,
    quarter: null,
    endDate: "2025-01-31",
    declarations: [],
  };

  it("perioadă lunară fără declaraţii → 3 termene (tva12_md, d394_ro, d301_ro)", () => {
    const deadlines = computeDeadlinesForPeriod(base, "2025-01-15");
    const types = deadlines.map((d) => d.declarationType);
    expect(types).toContain("tva12_md");
    expect(types).toContain("d394_ro");
    expect(types).toContain("d301_ro");
    expect(deadlines).toHaveLength(3);
  });

  it("tva12_md → deadline 2025-02-25 (T-FISC-004-2)", () => {
    const deadlines = computeDeadlinesForPeriod(base, "2025-01-15");
    const tva = deadlines.find((d) => d.declarationType === "tva12_md");
    expect(tva?.deadline).toBe("2025-02-25");
  });

  it("declaraţie nefiled cu termen trecut → isOverdue=true (T-FISC-004-4)", () => {
    // today = 2025-03-01 (după termenul 2025-02-25)
    const deadlines = computeDeadlinesForPeriod(base, "2025-03-01");
    const tva = deadlines.find((d) => d.declarationType === "tva12_md");
    expect(tva?.isOverdue).toBe(true);
    expect(tva?.daysUntil).toBeLessThan(0);
  });

  it("declaraţie depusă → isOverdue=false chiar dacă termenul a trecut", () => {
    const periodWithFiled = {
      ...base,
      declarations: [
        {
          id: "decl-1",
          declarationType: "tva12_md" as const,
          status: "filed" as const,
          filedAt: "2025-02-20T10:00:00Z",
        },
      ],
    };
    const deadlines = computeDeadlinesForPeriod(periodWithFiled, "2025-03-01");
    const tva = deadlines.find((d) => d.declarationType === "tva12_md");
    expect(tva?.isOverdue).toBe(false);
    expect(tva?.declarationStatus).toBe("filed");
  });

  it("days_until = 5 → isUrgent=true (T-FISC-004-5)", () => {
    // termen tva12_md = 2025-02-25; today = 2025-02-20 → 5 zile
    const deadlines = computeDeadlinesForPeriod(base, "2025-02-20");
    const tva = deadlines.find((d) => d.declarationType === "tva12_md");
    expect(tva?.daysUntil).toBe(5);
    expect(tva?.isUrgent).toBe(true);
  });

  it("perioadă anuală → 1 termen (income_md)", () => {
    const annual = {
      ...base,
      periodType: "annual" as const,
      year: 2025,
      month: null,
      periodLabel: "2025",
    };
    const deadlines = computeDeadlinesForPeriod(annual, "2025-01-01");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].declarationType).toBe("income_md");
    expect(deadlines[0].deadline).toBe("2026-03-25");
  });
});
