/**
 * @vitest-environment node
 * STMT-005: MAIB merged-PDF statement parser — unit tests on REAL statement text.
 *
 * The fixture is verbatim text produced by unpdf from an actual MAIB "Extras de Cont"
 * PDF (one merged line, no newlines). Edge cases covered:
 *   - doc-no GLUED to the credit amount ("786.00974" = 786.00 + doc 974)
 *   - doc-no split into separate tokens after amounts ("12458 19", "00003 036")
 *   - IBAN glued to a "/" in treasury rows ("… Moldova /MD04TRGAAA… 1006601000037")
 *   - own-account transfers and bank fees auto-marked NOT reportable
 *   - incoming client payments auto-marked reportable=yes with buyer IDNO+IBAN
 *
 * When the full real statement (96 rows) is parsed, per-direction totals match the
 * bank's own RULAJ DEBIT/CREDIT to the cent — verified manually; the fixture keeps a
 * 12-row subset with the same invariants.
 */
import { describe, it, expect } from "vitest";
import { parseMaibMergedStatement, parseStatementHeuristic } from "../lib/ai/statementExtractor";
import { MAIB_MERGED_FIXTURE } from "./fixtures/maibMergedStatement";

describe("STMT-005: parseMaibMergedStatement (real MAIB PDF text)", () => {
  const txns = parseMaibMergedStatement(MAIB_MERGED_FIXTURE);

  it("[blocant] parses ALL 12 rows — none silently dropped", () => {
    expect(txns).toHaveLength(12);
  });

  it("[blocant] per-direction totals match the statement to the cent", () => {
    const out = txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount_cents, 0);
    const inn = txns.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount_cents, 0);
    expect(out).toBe(6_297_890); // 62978.90 MDL
    expect(inn).toBe(2_883_667); // 28836.67 MDL
  });

  it("[blocant] extracts buyer IDNO + IBAN for an incoming client payment (AMDARIS)", () => {
    const amdaris = txns.find((t) => t.counterparty?.includes("AMDARIS"));
    expect(amdaris).toBeDefined();
    expect(amdaris?.direction).toBe("in");
    expect(amdaris?.amount_cents).toBe(786_600);
    expect(amdaris?.counterparty_idno).toBe("1009600020033");
    expect(amdaris?.counterparty_iban).toBe("MD94AG000000022512036601");
    expect(amdaris?.tx_date).toBe("2026-05-07");
    expect(amdaris?.reportable).toBe("yes");
  });

  it("[blocant] doc-no glued to the credit amount does not corrupt the amount (786.00974)", () => {
    const euro = txns.find((t) => t.counterparty?.includes("EUROCREDITBANK"));
    expect(euro?.amount_cents).toBe(78_600); // NOT 78600974
    expect(euro?.counterparty_idno).toBe("1002600020056");
  });

  it("[blocant] '/'-glued IBAN row parses with its own IDNO (no neighbor swallowing)", () => {
    // Treasury row: "… pe teritoriul Repub licii Moldova /MD04TRGAAA… 1006601000037"
    const tva = txns.find((t) => t.description.includes("Taxa pe valoarea"));
    expect(tva).toBeDefined();
    expect(tva?.amount_cents).toBe(742_931);
    expect(tva?.counterparty_idno).toBe("1006601000037");
    expect(tva?.counterparty_iban).toBe("MD04TRGAAA11411001000000");
    // …and the row AFTER it (the one that used to be swallowed) also parses:
    const mai = txns.find((t) => t.counterparty?.includes("Serviciul Tehnologii"));
    expect(mai).toBeDefined();
    expect(mai?.amount_cents).toBe(454_900);
    expect(mai?.counterparty_idno).toBe("1013601000521");
  });

  it("[blocant] own-account transfers and bank operations are auto-marked NOT reportable", () => {
    const alimentare = txns.find((t) => t.description.includes("Alimentare cont"));
    expect(alimentare?.reportable).toBe("no"); // partner IDNO == holder IDNO
    const comision = txns.find((t) => t.description.includes("Comision pentru acceptarea"));
    expect(comision?.reportable).toBe("no");
    const cardOps = txns.find((t) => t.description.includes("Transfer pentru operatiuni"));
    expect(cardOps?.reportable).toBe("no");
  });

  it("incoming third-party payments are e-Factura candidates (reportable=yes)", () => {
    const candidates = txns.filter((t) => t.direction === "in" && t.reportable === "yes");
    expect(candidates).toHaveLength(5); // EUROCREDITBANK, AMDARIS, NANU, MF-TR MAI, INTACT
    for (const c of candidates) {
      expect(c.counterparty_idno).toMatch(/^\d{13}$/);
    }
  });

  it("outgoing supplier payments stay 'review' (invoice comes FROM the supplier)", () => {
    const salary = txns.find((t) => t.counterparty?.includes("POPESCU"));
    expect(salary?.direction).toBe("out");
    expect(salary?.reportable).toBe("review");
  });

  it("parseStatementHeuristic routes this format to the merged parser", () => {
    const viaHeuristic = parseStatementHeuristic(MAIB_MERGED_FIXTURE);
    expect(viaHeuristic).toHaveLength(12);
    expect(viaHeuristic[0].counterparty_idno).toBeTruthy();
  });

  it("returns [] on non-statement text (no false positives)", () => {
    expect(parseMaibMergedStatement("Lorem ipsum dolor sit amet 123.45 67.89")).toEqual([]);
  });
});
