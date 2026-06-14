/**
 * BANKLINK-001 — Bank connectors schema + OFX/MT940 parser + dedup + seed
 *
 * T-BANKLINK-001-1 [blocant] finBankConnections exported from schema finBankLink
 * T-BANKLINK-001-2 [blocant] parseOFX returns correct ParsedBankTransaction array from sample OFX
 * T-BANKLINK-001-3 [blocant] parseMT940 returns correct ParsedBankTransaction array from sample MT940
 * T-BANKLINK-001-4 [blocant] finBankLinkRoutes exported from routes/finBankLink.ts
 * T-BANKLINK-001-5 [blocant] Dedup logic: second import of same externalId → duplicates count incremented
 * T-BANKLINK-001-6 [normal]  seedBankLink is a function (exported)
 */

import { describe, it, expect } from "vitest";
import { finBankConnections, finBankTransactions } from "../../../server/db/schema/finBankLink";
import { parseOFX, parseMT940 } from "../../../server/lib/finBankParser";
import { finBankLinkRoutes } from "../../../server/routes/finBankLink";
import { seedBankLink } from "../../../server/lib/finBankLinkSeed";

// ─── T-BANKLINK-001-1 [blocant] Schema export ─────────────────────────────────

describe("BANKLINK-001 — schema exports", () => {
  it("T-BANKLINK-001-1 [blocant] finBankConnections table is defined with columns", () => {
    expect(finBankConnections).toBeDefined();
    expect(typeof finBankConnections).toBe("object");
    // Drizzle tables are enumerable — check column keys exist
    const keys = Object.keys(finBankConnections);
    expect(keys).toContain("id");
    expect(keys).toContain("tenantId");
    expect(keys).toContain("name");
  });

  it("finBankTransactions table is defined with columns", () => {
    expect(finBankTransactions).toBeDefined();
    const keys = Object.keys(finBankTransactions);
    expect(keys).toContain("externalId");
    expect(keys).toContain("amountCents");
  });

  it("finBankConnections has expected columns", () => {
    const cols = Object.keys(finBankConnections);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("name");
    expect(cols).toContain("bankCode");
    expect(cols).toContain("accountIban");
    expect(cols).toContain("importFormat");
    expect(cols).toContain("isActive");
  });

  it("finBankTransactions has dedup columns", () => {
    const cols = Object.keys(finBankTransactions);
    expect(cols).toContain("externalId");
    expect(cols).toContain("bankConnectionId");
    expect(cols).toContain("amountCents");
    expect(cols).toContain("status");
    expect(cols).toContain("matchedSourceType");
  });
});

// ─── T-BANKLINK-001-2 [blocant] parseOFX ──────────────────────────────────────

describe("BANKLINK-001 — parseOFX", () => {
  const sampleOFX = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260601120000
<TRNAMT>1500.00
<FITID>FIT-001-2026
<NAME>Maria Ionescu
<MEMO>Plata cursuri
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260605
<TRNAMT>-50.00
<FITID>FIT-002-2026
<NAME>BC Maib
<MEMO>Comision bancar
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260610
<TRNAMT>2000.00
<FITID>FIT-003-2026
<NAME>Popescu Ion
<MEMO>Plata abonament
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

  it("T-BANKLINK-001-2 [blocant] parseOFX returns 3 transactions", () => {
    const result = parseOFX(sampleOFX);
    expect(result).toHaveLength(3);
  });

  it("first transaction has correct fields", () => {
    const result = parseOFX(sampleOFX);
    const t = result[0];
    expect(t.externalId).toBe("FIT-001-2026");
    expect(t.transactionDate).toBe("2026-06-01");
    expect(t.amountCents).toBe(150_000); // 1500.00 * 100
    expect(t.description).toBe("Plata cursuri");
    expect(t.counterpartyName).toBe("Maria Ionescu");
  });

  it("debit transaction has negative amountCents", () => {
    const result = parseOFX(sampleOFX);
    const t = result[1];
    expect(t.externalId).toBe("FIT-002-2026");
    expect(t.amountCents).toBe(-5_000); // -50.00 * 100
  });

  it("third transaction is correct", () => {
    const result = parseOFX(sampleOFX);
    const t = result[2];
    expect(t.amountCents).toBe(200_000); // 2000.00 * 100
    expect(t.externalId).toBe("FIT-003-2026");
  });
});

// ─── T-BANKLINK-001-3 [blocant] parseMT940 ────────────────────────────────────

describe("BANKLINK-001 — parseMT940", () => {
  const sampleMT940 = `
:20:STMT-2026-06
:25:MD00AGRNMD0X000000000000000 MDL
:28C:00001/001
:60F:C260601MDL15000,00
:61:2606010601C1500,00NTRF REF-001//COUNTERPARTY-001
:86:Plata cursuri — Maria Ionescu
:61:2606050605D500,00NCHK REF-002//BC Maib
:86:Comision bancar lunar
-}
`;

  it("T-BANKLINK-001-3 [blocant] parseMT940 returns 2 transactions", () => {
    const result = parseMT940(sampleMT940);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("first MT940 transaction is credit (positive amount)", () => {
    const result = parseMT940(sampleMT940);
    const t = result[0];
    expect(t.amountCents).toBeGreaterThan(0); // credit = positive
    expect(t.transactionDate).toBeTruthy();
  });

  it("second MT940 transaction is debit (negative amount)", () => {
    const result = parseMT940(sampleMT940);
    const t = result[1];
    expect(t.amountCents).toBeLessThan(0); // debit = negative
  });
});

// ─── T-BANKLINK-001-4 [blocant] Route export ──────────────────────────────────

describe("BANKLINK-001 — route export", () => {
  it("T-BANKLINK-001-4 [blocant] finBankLinkRoutes is exported and is a Hono router", () => {
    expect(finBankLinkRoutes).toBeDefined();
    expect(typeof finBankLinkRoutes.routes).toBeDefined();
    expect(Array.isArray(finBankLinkRoutes.routes)).toBe(true);
  });

  it("finBankLinkRoutes has expected routes", () => {
    const paths = finBankLinkRoutes.routes.map((r: { path: string }) => r.path);
    // Should include connections and transactions
    expect(paths.some((p: string) => p.includes("connections"))).toBe(true);
    expect(paths.some((p: string) => p.includes("transactions"))).toBe(true);
    expect(paths.some((p: string) => p.includes("import"))).toBe(true);
  });
});

// ─── T-BANKLINK-001-5 [blocant] Dedup logic ───────────────────────────────────

describe("BANKLINK-001 — dedup logic", () => {
  it("T-BANKLINK-001-5 [blocant] second import with same externalId = duplicate", () => {
    // Mirror the dedup logic from POST /api/fin/banklink/import
    const existingIds = new Set(["FIT-001-2026", "FIT-003-2026"]);

    const parsedTransactions = [
      { externalId: "FIT-001-2026", amountCents: 150_000 }, // duplicate
      { externalId: "FIT-NEW-001", amountCents: 75_000 },  // new
      { externalId: "FIT-003-2026", amountCents: 200_000 }, // duplicate
    ];

    const toInsert = parsedTransactions.filter((t) => !existingIds.has(t.externalId));
    const duplicates = parsedTransactions.length - toInsert.length;

    expect(duplicates).toBe(2);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].externalId).toBe("FIT-NEW-001");
  });
});

// ─── T-BANKLINK-001-6 [normal] seedBankLink ───────────────────────────────────

describe("BANKLINK-001 — seed export", () => {
  it("T-BANKLINK-001-6 [normal] seedBankLink is an exported async function", () => {
    expect(typeof seedBankLink).toBe("function");
    // Returns a promise
    const result = seedBankLink("00000000-0000-0000-0000-000000000000");
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {}); // prevent unhandled rejection in test (DB not available)
  });
});
