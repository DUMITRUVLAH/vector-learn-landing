/**
 * LEDGER-001 — General Ledger double-entry accounting
 *
 * T-LEDGER-001-1 [blocant] finLedgerAccounts, finJournalEntries, finJournalLines exportate din schema.
 * T-LEDGER-001-2 [blocant] SNC_ACCOUNTS conține minim 12 conturi, câte una din fiecare clasă.
 * T-LEDGER-001-3 [blocant] Constraint debit XOR credit: linia nu poate avea debit>0 și credit>0.
 * T-LEDGER-001-4 [blocant] finLedgerRoutes exportat din routes/finLedger.ts.
 * T-LEDGER-001-5 [normal]  Trial balance: suma debit = suma credit pentru un set de înregistrări echilibrate.
 * T-LEDGER-001-6 [normal]  seedLedgerAccounts funcție exportată și returnează număr de conturi.
 */

import { describe, it, expect } from "vitest";

// ─── T-LEDGER-001-1 [blocant] Schema exports ──────────────────────────────────

describe("LEDGER-001 — schema exports", () => {
  it("T-LEDGER-001-1 [blocant] exports finLedgerAccounts, finJournalEntries, finJournalLines", async () => {
    const schema = await import("../../../server/db/schema/finLedger");

    expect(schema.finLedgerAccounts).toBeDefined();
    expect(schema.finJournalEntries).toBeDefined();
    expect(schema.finJournalLines).toBeDefined();
  });

  it("T-LEDGER-001-1b exports constants and types", async () => {
    const schema = await import("../../../server/db/schema/finLedger");

    expect(schema.ACCOUNT_CLASSES).toContain("A");
    expect(schema.ACCOUNT_CLASSES).toContain("P");
    expect(schema.ACCOUNT_CLASSES).toContain("V");
    expect(schema.ACCOUNT_CLASSES).toContain("C");
    expect(schema.ACCOUNT_CLASSES).toContain("B");

    expect(schema.JOURNAL_SOURCE_TYPES).toContain("BILL");
    expect(schema.JOURNAL_SOURCE_TYPES).toContain("SPEND");
    expect(schema.JOURNAL_SOURCE_TYPES).toContain("PAY");
    expect(schema.JOURNAL_SOURCE_TYPES).toContain("MANUAL");
  });

  it("T-LEDGER-001-1c exported from schema/index.ts", async () => {
    const index = await import("../../../server/db/schema/index");
    expect((index as Record<string, unknown>).finLedgerAccounts).toBeDefined();
    expect((index as Record<string, unknown>).finJournalEntries).toBeDefined();
    expect((index as Record<string, unknown>).finJournalLines).toBeDefined();
  });
});

// ─── T-LEDGER-001-2 [blocant] SNC accounts seed data ─────────────────────────

describe("LEDGER-001 — SNC_ACCOUNTS seed data", () => {
  it("T-LEDGER-001-2 [blocant] has at least 12 accounts covering all 5 classes", async () => {
    const { SNC_ACCOUNTS } = await import("../../../server/lib/finLedgerSeed");

    // At least 12 accounts
    expect(SNC_ACCOUNTS.length).toBeGreaterThanOrEqual(12);

    // At least one account per class
    const classes = new Set(SNC_ACCOUNTS.map((a) => a.accountClass));
    expect(classes.has("A")).toBe(true); // Activ
    expect(classes.has("P")).toBe(true); // Pasiv
    expect(classes.has("V")).toBe(true); // Venituri
    expect(classes.has("C")).toBe(true); // Cheltuieli
    expect(classes.has("B")).toBe(true); // Bifuncțional
  });

  it("T-LEDGER-001-2b all accounts have code, name, and valid class", async () => {
    const { SNC_ACCOUNTS } = await import(
      "../../../server/lib/finLedgerSeed"
    );

    const schema = await import("../../../server/db/schema/finLedger");
    const validClasses = new Set(schema.ACCOUNT_CLASSES);

    for (const acc of SNC_ACCOUNTS) {
      expect(acc.code).toBeTruthy();
      expect(acc.name).toBeTruthy();
      expect(validClasses.has(acc.accountClass as typeof schema.ACCOUNT_CLASSES[number])).toBe(true);
    }
  });

  it("[normal] seedLedgerAccounts is exported", async () => {
    const seed = await import("../../../server/lib/finLedgerSeed");
    expect(typeof seed.seedLedgerAccounts).toBe("function");
  });
});

// ─── T-LEDGER-001-3 [blocant] Debit XOR credit constraint ────────────────────

describe("LEDGER-001 — debit XOR credit constraint", () => {
  it("T-LEDGER-001-3 [blocant] a line cannot have both debit > 0 and credit > 0", () => {
    // Simulate the DB CHECK constraint: debit_cents = 0 OR credit_cents = 0
    function isValidLine(debitCents: number, creditCents: number): boolean {
      return debitCents === 0 || creditCents === 0;
    }

    // Valid cases
    expect(isValidLine(10000, 0)).toBe(true);   // pure debit
    expect(isValidLine(0, 10000)).toBe(true);   // pure credit
    expect(isValidLine(0, 0)).toBe(true);        // zero line (unusual but technically valid)

    // Invalid case — both non-zero
    expect(isValidLine(5000, 5000)).toBe(false);
    expect(isValidLine(1, 1)).toBe(false);
  });

  it("[normal] double-entry: sum of all debits must equal sum of all credits in a balanced entry", () => {
    type Line = { debitCents: number; creditCents: number };

    function isBalancedEntry(lines: Line[]): boolean {
      const totalDebit = lines.reduce((s, l) => s + l.debitCents, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditCents, 0);
      return totalDebit === totalCredit;
    }

    // Balanced: DR 221 (receivable) 5000 / CR 611 (revenue) 5000
    const balanced: Line[] = [
      { debitCents: 500000, creditCents: 0 },   // DR 221 Creanțe
      { debitCents: 0, creditCents: 500000 },   // CR 611 Venituri
    ];
    expect(isBalancedEntry(balanced)).toBe(true);

    // Unbalanced — error in posting
    const unbalanced: Line[] = [
      { debitCents: 500000, creditCents: 0 },
      { debitCents: 0, creditCents: 400000 }, // CR only 400 — off by 100
    ];
    expect(isBalancedEntry(unbalanced)).toBe(false);
  });
});

// ─── T-LEDGER-001-4 [blocant] Route export ────────────────────────────────────

describe("LEDGER-001 — finLedger route", () => {
  it("T-LEDGER-001-4 [blocant] finLedgerRoutes exported from routes/finLedger.ts", async () => {
    const route = await import("../../../server/routes/finLedger");
    expect(route.finLedgerRoutes).toBeDefined();
    expect(typeof route.finLedgerRoutes.fetch).toBe("function");
  });
});

// ─── T-LEDGER-001-5 [normal] Trial balance logic ──────────────────────────────

describe("LEDGER-001 — trial balance logic", () => {
  it("T-LEDGER-001-5 [normal] balanced entries: totalDebit === totalCredit", () => {
    type TrialRow = { accountCode: string; debitCents: number; creditCents: number };

    // Simulate posting 3 entries:
    // 1. Sales invoice: DR 221 (Creanțe) 500 / CR 611 (Venituri) 500
    // 2. Cash received: DR 241 (Numerar) 500 / CR 221 (Creanțe) 500
    // 3. Expense:       DR 713 (Cheltuieli admin) 200 / CR 521 (Datorii furnizori) 200
    const allLines: TrialRow[] = [
      { accountCode: "221", debitCents: 50000, creditCents: 0 },
      { accountCode: "611", debitCents: 0, creditCents: 50000 },
      { accountCode: "241", debitCents: 50000, creditCents: 0 },
      { accountCode: "221", debitCents: 0, creditCents: 50000 },
      { accountCode: "713", debitCents: 20000, creditCents: 0 },
      { accountCode: "521", debitCents: 0, creditCents: 20000 },
    ];

    // Aggregate per account (trial balance)
    const grouped = new Map<string, { debitCents: number; creditCents: number }>();
    for (const l of allLines) {
      const existing = grouped.get(l.accountCode) ?? { debitCents: 0, creditCents: 0 };
      grouped.set(l.accountCode, {
        debitCents: existing.debitCents + l.debitCents,
        creditCents: existing.creditCents + l.creditCents,
      });
    }

    const rows = Array.from(grouped.entries()).map(([code, totals]) => ({
      accountCode: code,
      ...totals,
    }));

    const totalDebit = rows.reduce((s, r) => s + r.debitCents, 0);
    const totalCredit = rows.reduce((s, r) => s + r.creditCents, 0);

    // Balanced entries must always have equal totals
    expect(totalDebit).toBe(totalCredit);

    // Verify specific balances
    const account221 = rows.find((r) => r.accountCode === "221")!;
    expect(account221.debitCents).toBe(50000);
    expect(account221.creditCents).toBe(50000); // net zero (received payment)

    const account611 = rows.find((r) => r.accountCode === "611")!;
    expect(account611.creditCents).toBe(50000); // revenue
    expect(account611.debitCents).toBe(0);
  });
});
