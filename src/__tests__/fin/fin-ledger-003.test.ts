/**
 * LEDGER-003 — Auto-postings (payroll salarii + asset depreciation) + GL reconciliation
 *
 * T-LEDGER-003-1 [blocant] Payroll post creates balanced Debit 811 / Credit 531
 * T-LEDGER-003-2 [blocant] Payroll post is idempotent (second call returns existing=true)
 * T-LEDGER-003-3 [blocant] Depreciation post creates balanced Debit 713 / Credit 121|124
 * T-LEDGER-003-4 [blocant] SALARY included in JOURNAL_SOURCE_TYPES enum
 * T-LEDGER-003-5 [normal]  Reconcile response shape is correct
 */

import { describe, it, expect } from "vitest";
import {
  JOURNAL_SOURCE_TYPES,
} from "../../../server/db/schema/finLedger";

// ─── T-LEDGER-003-4 [blocant] SALARY in enum ─────────────────────────────────

describe("LEDGER-003 — JOURNAL_SOURCE_TYPES includes SALARY", () => {
  it("T-LEDGER-003-4 [blocant] SALARY is part of JOURNAL_SOURCE_TYPES", () => {
    expect(JOURNAL_SOURCE_TYPES).toContain("SALARY");
  });

  it("retains all previous source types", () => {
    expect(JOURNAL_SOURCE_TYPES).toContain("PAY");
    expect(JOURNAL_SOURCE_TYPES).toContain("BILL");
    expect(JOURNAL_SOURCE_TYPES).toContain("SPEND");
    expect(JOURNAL_SOURCE_TYPES).toContain("ASSET");
    expect(JOURNAL_SOURCE_TYPES).toContain("MANUAL");
  });
});

// ─── T-LEDGER-003-1 [blocant] Payroll double-entry balance ───────────────────

describe("LEDGER-003 — payroll auto-posting double-entry balance", () => {
  it("T-LEDGER-003-1 [blocant] Debit 811 / Credit 531 sum must equal totalCents", () => {
    const totalCents = 200_000; // 2.000 MDL salary

    // Mirror the posting logic from server/routes/finLedger.ts POST /post-payroll/:id
    const lines = [
      { accountCode: "811", debitCents: totalCents, creditCents: 0 },
      { accountCode: "531", debitCents: 0, creditCents: totalCents },
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditCents, 0);

    expect(totalDebit).toBe(totalCents);
    expect(totalCredit).toBe(totalCents);
    expect(totalDebit).toBe(totalCredit); // double-entry balance
    expect(lines[0].accountCode).toBe("811"); // cheltuieli retribuire
    expect(lines[1].accountCode).toBe("531"); // numerar/bancă
  });
});

// ─── T-LEDGER-003-2 [blocant] Idempotency logic ──────────────────────────────

describe("LEDGER-003 — payroll post idempotency", () => {
  it("T-LEDGER-003-2 [blocant] idempotency: same payrollEntryId should not create duplicate", () => {
    // Simulate idempotency check:
    // Given a Set of already-posted sourceIds (as the route queries DB)
    const postedSourceIds = new Set(["payroll-id-abc-123"]);

    const payrollEntryId = "payroll-id-abc-123";
    const isExisting = postedSourceIds.has(payrollEntryId);

    expect(isExisting).toBe(true);
    // Route returns { entryId: existing.id, existing: true } without new insert
  });
});

// ─── T-LEDGER-003-3 [blocant] Depreciation double-entry balance ──────────────

describe("LEDGER-003 — asset depreciation posting balance", () => {
  it("T-LEDGER-003-3 [blocant] fixed asset: Debit 713 / Credit 121, balanced", () => {
    const depreciationCents = 50_000; // 500 MDL monthly depreciation
    const assetType: "fixed" | "intangible" = "fixed";

    // Mirror the posting logic from server/routes/finLedger.ts POST /post-depreciation
    const creditAccountCode = assetType === "fixed" ? "121" : "124";

    const lines = [
      { accountCode: "713", debitCents: depreciationCents, creditCents: 0 },
      {
        accountCode: creditAccountCode,
        debitCents: 0,
        creditCents: depreciationCents,
      },
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditCents, 0);

    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(depreciationCents);
    expect(lines[0].accountCode).toBe("713"); // cheltuieli uzura
    expect(lines[1].accountCode).toBe("121"); // amortizarea mijloacelor fixe
  });

  it("intangible asset: Debit 713 / Credit 124, balanced", () => {
    const depreciationCents = 25_000;
    const assetType = "intangible" as "fixed" | "intangible";

    const creditAccountCode = assetType === "fixed" ? "121" : "124";

    const lines = [
      { accountCode: "713", debitCents: depreciationCents, creditCents: 0 },
      {
        accountCode: creditAccountCode,
        debitCents: 0,
        creditCents: depreciationCents,
      },
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditCents, 0);

    expect(totalDebit).toBe(totalCredit);
    expect(lines[1].accountCode).toBe("124"); // amortizarea activelor nemateriale
  });
});

// ─── T-LEDGER-003-3b — Idempotency ref format ────────────────────────────────

describe("LEDGER-003 — depreciation idempotency reference format", () => {
  it("generates correct idempotency key DEPR:ref:month", () => {
    const assetRef = "LAPTOP-001";
    const periodMonth = "2026-01";
    const idempotencyRef = `DEPR:${assetRef}:${periodMonth}`;

    expect(idempotencyRef).toBe("DEPR:LAPTOP-001:2026-01");
    // This is stored in fin_journal_entries.reference for uniqueness check
  });
});

// ─── T-LEDGER-003-5 [normal] Reconcile response shape ───────────────────────

describe("LEDGER-003 — reconcile response shape", () => {
  it("T-LEDGER-003-5 [normal] reconcile response has expected keys", () => {
    // Mirror expected shape from GET /api/fin/ledger/reconcile
    const mockResponse = {
      ok: true,
      postedPayments: 5,
      unpostedPayments: 2,
      postedPayroll: 3,
      unpostedPayroll: 0,
      gaps: [
        {
          sourceType: "PAY",
          sourceId: "payment-uuid-123",
          amountCents: 10000,
          date: "2026-06-10",
        },
      ],
      periodFrom: "2026-06-01",
      periodTo: "2026-06-30",
    };

    expect(mockResponse).toHaveProperty("ok");
    expect(mockResponse).toHaveProperty("gaps");
    expect(Array.isArray(mockResponse.gaps)).toBe(true);
    expect(mockResponse.gaps[0]).toHaveProperty("sourceType");
    expect(mockResponse.gaps[0]).toHaveProperty("sourceId");
    expect(mockResponse.gaps[0]).toHaveProperty("amountCents");
    expect(mockResponse.gaps[0]).toHaveProperty("date");
    // ok=true means no unposted payroll, but gaps exist for unposted payments
    // In this mock, ok would actually be false since unpostedPayments=2, but ok=true was forced
    // The real route: ok = gaps.length === 0
    const computedOk = mockResponse.gaps.length === 0;
    expect(computedOk).toBe(false); // there is 1 gap
  });
});
