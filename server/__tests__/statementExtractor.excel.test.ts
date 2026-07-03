/**
 * @vitest-environment node
 * STMT-006: MAIB Excel statement parser — regression tests.
 *
 * ROOT CAUSE this locks: the upload route did `String(cell.value)` on exceljs rich-text
 * cells → every cell became "[object Object]" → 0 transactions → on prod the empty heuristic
 * fell through to a 4000-token AI call over ~100KB of garbage → Vercel 30s timeout →
 * "Eroare la upload". These tests FAIL on the old code (0 txns) and PASS on the fix.
 *
 * Fixtures are SYNTHETIC data in the REAL tab-delimited structure the route now produces;
 * the parser was additionally verified against real exports (totals equal the bank's
 * reported Total Intrări/Ieșiri to the cent).
 */
import { describe, it, expect, vi } from "vitest";

// Track whether the AI slow-path is ever reached. If the guard works, callAi is NEVER called
// for tab-delimited (Excel) input, so the prod 30s-timeout can't happen.
const callAiMock = vi.fn(async () => ({ text: "{}", auditId: "ai-was-called", isStub: false }));
vi.mock("../lib/ai/client", () => ({ callAi: (...args: unknown[]) => callAiMock(...args) }));

import {
  parseMaibExcelStatement,
  parseStatementHeuristic,
  cellTextForStatement,
  extractStatementTransactions,
} from "../lib/ai/statementExtractor";
import {
  MAIB_EXCEL_TSV_FORMAT_A,
  MAIB_EXCEL_TSV_FORMAT_B,
  MAIB_CARD_TSV_UNPARSEABLE,
} from "./fixtures/maibExcelStatement";

describe("STMT-006: cellTextForStatement (exceljs value → plain text)", () => {
  it("[blocant] extracts rich-text (the bug: String(v) gave '[object Object]')", () => {
    expect(cellTextForStatement({ richText: [{ text: "(R) BETA " }, { text: "CLIENT SRL" }] })).toBe("(R) BETA CLIENT SRL");
    expect(cellTextForStatement({ richText: [{ font: { size: 7 }, text: "1009600020033" }] })).toBe("1009600020033");
  });
  it("handles hyperlink, formula, number, date, null", () => {
    expect(cellTextForStatement({ text: "MD94AG", hyperlink: "x" })).toBe("MD94AG");
    expect(cellTextForStatement({ formula: "A1+B1", result: 7866 })).toBe("7866");
    expect(cellTextForStatement(20000)).toBe("20000");
    expect(cellTextForStatement(null)).toBe("");
    expect(cellTextForStatement(undefined)).toBe("");
  });
});

describe("STMT-006: parseMaibExcelStatement — FORMAT A (3 rows/txn, merged dup columns)", () => {
  const txns = parseMaibExcelStatement(MAIB_EXCEL_TSV_FORMAT_A);

  it("[blocant] groups the 3 sibling rows into ONE transaction each (not 9)", () => {
    expect(txns).toHaveLength(3);
  });

  it("[blocant] debit/credit survive the merged-cell duplication (no 0/0 collapse)", () => {
    const t1 = txns[0]; // 20000 debit → out
    expect(t1.direction).toBe("out");
    expect(t1.amount_cents).toBe(2_000_000);
    const t2 = txns[1]; // 7866 credit → in
    expect(t2.direction).toBe("in");
    expect(t2.amount_cents).toBe(786_600);
  });

  it("[blocant] cycles Date-partener column → name + IDNO + IBAN onto the incoming payment", () => {
    const beta = txns.find((t) => t.counterparty?.includes("BETA"))!;
    expect(beta.counterparty_idno).toBe("1009600020033");
    expect(beta.counterparty_iban).toBe("MD94AG000000022512036601");
    expect(beta.tx_date).toBe("2025-05-05");
    expect(beta.reportable).toBe("yes"); // incoming third-party payment
  });

  it("auto-triage: own transfer + bank commission are NOT reportable", () => {
    const alim = txns.find((t) => t.description.includes("Alimentare"))!;
    expect(alim.reportable).toBe("no"); // partner IDNO == holder IDNO
    const comision = txns.find((t) => t.description.includes("Comision"))!;
    expect(comision.reportable).toBe("no");
  });
});

describe("STMT-006: parseMaibExcelStatement — FORMAT B (2 rows/txn, space+comma amounts)", () => {
  const txns = parseMaibExcelStatement(MAIB_EXCEL_TSV_FORMAT_B);

  it("[blocant] parses both transactions with correct amounts (space thousands sep)", () => {
    expect(txns).toHaveLength(2);
    expect(txns[0].amount_cents).toBe(200_000_00); // 200000
    expect(txns[1].amount_cents).toBe(786_600); // "7 866,00"
  });

  it("[blocant] extracts IDNO from the 2nd sibling row", () => {
    expect(txns[1].counterparty_idno).toBe("1009600020033");
    expect(txns[1].counterparty).toContain("BETA");
    expect(txns[1].reportable).toBe("yes");
  });
});

describe("STMT-006: parseStatementHeuristic routing + AI-fallback guard", () => {
  it("routes tab-delimited Excel text to the Excel parser", () => {
    expect(parseStatementHeuristic(MAIB_EXCEL_TSV_FORMAT_A)).toHaveLength(3);
  });

  it("PDF/CSV (no tabs) is NOT hijacked by the Excel parser", () => {
    expect(parseMaibExcelStatement("1 (R) FOO 01.01.2025 100.00 0.00 details")).toEqual([]);
  });

  it("[blocant] card statement (tab text, no txns) → [] and NEVER calls the AI (prod timeout fix)", async () => {
    callAiMock.mockClear();
    const res = await extractStatementTransactions(MAIB_CARD_TSV_UNPARSEABLE, "t", "u", "c");
    expect(res.transactions).toEqual([]);
    expect(callAiMock).not.toHaveBeenCalled(); // the guard skipped the slow path
  });

  it("non-Excel unparsed text (no tabs) DOES still reach the AI fallback", async () => {
    callAiMock.mockClear();
    callAiMock.mockResolvedValueOnce({ text: '{"transactions":[]}', auditId: "ai", isStub: false });
    await extractStatementTransactions("some non-maib bank statement prose without tabs", "t", "u", "c");
    expect(callAiMock).toHaveBeenCalledTimes(1); // proves the guard is tab-specific, not blanket
  });
});
