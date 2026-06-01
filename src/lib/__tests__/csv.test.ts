/**
 * CRM-150 — Tests for src/lib/csv.ts
 * T-CRM-150-1 [blocant] Quoted field with internal comma → single field.
 * T-CRM-150-2 [blocant] Quoted field with internal newline → not split across rows.
 * T-CRM-150-3 [blocant] "360,50" → valueCents = 36050.
 */
import { describe, it, expect } from "vitest";
import { parseCsv, parseCurrencyToCents, parseTags } from "@/lib/csv";

describe("parseCsv (CRM-150)", () => {
  // T-CRM-150-1 [blocant]
  it("parses a quoted field with internal comma as one field", () => {
    const result = parseCsv('"Acme, SRL",+40721000000');
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("Acme, SRL");
    expect(result[0][1]).toBe("+40721000000");
  });

  // T-CRM-150-2 [blocant]
  it("does not split a quoted field with embedded newline across rows", () => {
    const csv = '"First\nSecond",value';
    const result = parseCsv(csv);
    // Should produce exactly 1 row, 2 fields
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("First\nSecond");
    expect(result[0][1]).toBe("value");
  });

  it("handles escaped double-quotes inside quoted field", () => {
    const csv = '"Say ""hello"" world",ok';
    const result = parseCsv(csv);
    expect(result[0][0]).toBe('Say "hello" world');
  });

  it("handles CRLF line endings", () => {
    const csv = "a,b\r\nc,d\r\n";
    const result = parseCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(["a", "b"]);
    expect(result[1]).toEqual(["c", "d"]);
  });

  it("handles standard multi-row CSV", () => {
    const csv = "name,phone\nIon Pop,+40720000001\nMaria Ion,+40720000002";
    const result = parseCsv(csv);
    expect(result).toHaveLength(3);
    expect(result[1][0]).toBe("Ion Pop");
  });

  it("drops trailing empty row from EOF newline", () => {
    const csv = "a,b\nc,d\n";
    const result = parseCsv(csv);
    expect(result).toHaveLength(2);
  });
});

describe("parseCurrencyToCents (CRM-150)", () => {
  // T-CRM-150-3 [blocant]
  it('"360,50" → 36050 cents', () => {
    expect(parseCurrencyToCents("360,50")).toBe(36050);
  });

  it('"360" → 36000 cents', () => {
    expect(parseCurrencyToCents("360")).toBe(36000);
  });

  it('"1.360,50" (European thousand-sep) → 136050 cents', () => {
    expect(parseCurrencyToCents("1.360,50")).toBe(136050);
  });

  it('"360.50" (dot decimal) → 36050 cents', () => {
    expect(parseCurrencyToCents("360.50")).toBe(36050);
  });

  it("strips € symbol", () => {
    expect(parseCurrencyToCents("€150")).toBe(15000);
  });

  it("returns 0 for empty string", () => {
    expect(parseCurrencyToCents("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(parseCurrencyToCents("abc")).toBe(0);
  });
});

describe("parseTags (CRM-150)", () => {
  it("splits on semicolons", () => {
    expect(parseTags("vip;prospect;english")).toEqual(["vip", "prospect", "english"]);
  });

  it("splits on commas", () => {
    expect(parseTags("vip,prospect")).toEqual(["vip", "prospect"]);
  });

  it("trims whitespace", () => {
    expect(parseTags(" vip ; prospect ")).toEqual(["vip", "prospect"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });
});
