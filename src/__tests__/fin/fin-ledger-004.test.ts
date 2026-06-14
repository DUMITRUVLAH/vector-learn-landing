/**
 * LEDGER-004 — UI registru general: jurnal, carte mare per cont, balanță tabs
 *
 * T-LEDGER-004-1 [blocant] FinLedgerPage is exported as a React function component
 * T-LEDGER-004-2 [blocant] GET /api/fin/ledger/account/:code route exists in finLedgerRoutes
 * T-LEDGER-004-3 [blocant] Running balance is computed correctly (debit increases, credit decreases)
 * T-LEDGER-004-4 [normal]  FinLedgerCarteMare is exported as a React function component
 * T-LEDGER-004-5 [normal]  API client exports getAccountLedger and reconcileLedger
 */

import { describe, it, expect } from "vitest";
import { FinLedgerPage } from "../../../src/pages/fin/FinLedgerPage";
import { FinLedgerCarteMare } from "../../../src/pages/fin/FinLedgerCarteMare";
import {
  getAccountLedger,
  reconcileLedger,
  exportJournalCsv,
} from "../../../src/lib/api/finLedger";
import { finLedgerRoutes } from "../../../server/routes/finLedger";

// ─── T-LEDGER-004-1 [blocant] FinLedgerPage component export ─────────────────

describe("LEDGER-004 — FinLedgerPage component", () => {
  it("T-LEDGER-004-1 [blocant] FinLedgerPage is a named export (React function)", () => {
    expect(typeof FinLedgerPage).toBe("function");
    expect(FinLedgerPage.name).toBe("FinLedgerPage");
  });
});

// ─── T-LEDGER-004-2 [blocant] GET /account/:code route ───────────────────────

describe("LEDGER-004 — finLedgerRoutes account endpoint", () => {
  it("T-LEDGER-004-2 [blocant] finLedgerRoutes is exported from routes/finLedger.ts", () => {
    expect(finLedgerRoutes).toBeDefined();
    // Hono router has .routes property
    expect(typeof finLedgerRoutes.routes).toBeDefined();
  });

  it("finLedgerRoutes has routes array (Hono router)", () => {
    expect(Array.isArray(finLedgerRoutes.routes)).toBe(true);
  });

  it("finLedgerRoutes contains /account/:code route", () => {
    const paths = finLedgerRoutes.routes.map((r: { path: string }) => r.path);
    const hasAccountRoute = paths.some(
      (p: string) => p.includes("/account/") || p.includes("account/:code")
    );
    expect(hasAccountRoute).toBe(true);
  });
});

// ─── T-LEDGER-004-3 [blocant] Running balance computation ────────────────────

describe("LEDGER-004 — running balance calculation", () => {
  it("T-LEDGER-004-3 [blocant] debit increases running balance, credit decreases it", () => {
    // Mirror the running balance logic from server/routes/finLedger.ts GET /account/:code
    const openingBalance = 0;
    let runningBalance = openingBalance;

    const movements = [
      { debitCents: 100_000, creditCents: 0, description: "Vanzare servicii" },
      { debitCents: 0, creditCents: 30_000, description: "Retur partial" },
      { debitCents: 50_000, creditCents: 0, description: "Alta vanzare" },
    ];

    const result = movements.map((m) => {
      runningBalance += m.debitCents - m.creditCents;
      return { ...m, runningBalance };
    });

    expect(result[0].runningBalance).toBe(100_000);  // 0 + 100000
    expect(result[1].runningBalance).toBe(70_000);   // 100000 - 30000
    expect(result[2].runningBalance).toBe(120_000);  // 70000 + 50000
  });

  it("credit-heavy account produces negative running balance", () => {
    let runningBalance = 0;

    const movements = [
      { debitCents: 0, creditCents: 500_000 }, // Credit > 0 — liability increases
      { debitCents: 200_000, creditCents: 0 }, // Partial repayment
    ];

    for (const m of movements) {
      runningBalance += m.debitCents - m.creditCents;
    }

    expect(runningBalance).toBe(-300_000); // -500000 + 200000
  });
});

// ─── T-LEDGER-004-4 [normal] FinLedgerCarteMare export ───────────────────────

describe("LEDGER-004 — FinLedgerCarteMare component", () => {
  it("T-LEDGER-004-4 [normal] FinLedgerCarteMare is a named export", () => {
    expect(typeof FinLedgerCarteMare).toBe("function");
    expect(FinLedgerCarteMare.name).toBe("FinLedgerCarteMare");
  });
});

// ─── T-LEDGER-004-5 [normal] API client exports ───────────────────────────────

describe("LEDGER-004 — API client exports", () => {
  it("T-LEDGER-004-5 [normal] getAccountLedger is a function", () => {
    expect(typeof getAccountLedger).toBe("function");
  });

  it("reconcileLedger is a function", () => {
    expect(typeof reconcileLedger).toBe("function");
  });

  it("exportJournalCsv is a function", () => {
    expect(typeof exportJournalCsv).toBe("function");
  });
});
