/**
 * INVOICE-REPORTING: bank-statement amount parsing (×100 regression)
 *
 * Bug: the MAIB heuristic parser blindly stripped every "." as a thousands separator,
 * so a dot-decimal account amount like "3128.32" became 312832 → a Meta payment of
 * ~3.128 L was shown as -312.832,00 L (×100). Fix: parseAmount picks the decimal
 * separator as whichever of "." / "," appears last, handling both EU and US/plain formats.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { parseAmount, parseStatementHeuristic } from "@/../server/lib/ai/statementExtractor";

describe("parseAmount — both number formats", () => {
  it("dot-decimal (the ×100 regression): 3128.32 → 3128.32, not 312832", () => {
    expect(parseAmount("3128.32")).toBeCloseTo(3128.32, 2);
    expect(parseAmount("488.57")).toBeCloseTo(488.57, 2);
  });

  it("european format 3.128,32 → 3128.32", () => {
    expect(parseAmount("3.128,32")).toBeCloseTo(3128.32, 2);
    expect(parseAmount("1.000.000,00")).toBeCloseTo(1000000, 2);
  });

  it("us format 1,000,000.00 → 1000000", () => {
    expect(parseAmount("1,000,000.00")).toBeCloseTo(1000000, 2);
    expect(parseAmount("3,128.50")).toBeCloseTo(3128.5, 2);
  });

  it("plain integers and decimals", () => {
    expect(parseAmount("48857")).toBe(48857);
    expect(parseAmount("156.42")).toBeCloseTo(156.42, 2);
  });
});

describe("parseStatementHeuristic — MAIB line amounts in cents", () => {
  it("parses a dot-decimal MAIB line to the correct cents (not ×100)", () => {
    // "<date> <date> <desc> card ***NNNN <orig> <CUR> <acctAmount> <balance>"
    const line =
      "01.10.2025 01.10.2025 DIGITALOCEAN.COM card ***2084 28.80 USD 488.57 721.92";
    const [txn] = parseStatementHeuristic(line);
    expect(txn).toBeDefined();
    // 488.57 MDL → 48857 cents (was 4885700 before the fix)
    expect(txn.amount_cents).toBe(48857);
    expect(txn.currency).toBe("MDL");
    expect(txn.orig_amount).toBe("28.80 USD");
    expect(txn.direction).toBe("out");
  });

  it("parses an inflow (Alimentare) as direction in", () => {
    const line =
      "02.10.2025 02.10.2025 Alimentare cont card ***2084 0.00 MDL 500000.00 1221592.00";
    const [txn] = parseStatementHeuristic(line);
    expect(txn).toBeDefined();
    expect(txn.direction).toBe("in");
    expect(txn.amount_cents).toBe(50000000); // 500000.00 MDL → 50,000,000 cents
  });
});
