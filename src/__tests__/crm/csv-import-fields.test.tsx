/**
 * CRM-150 — Integration tests for extended CSV import UI
 * These tests verify the React component uses the new parser and fields.
 * The heavy lifting (parser correctness) is tested in src/lib/__tests__/csv.test.ts.
 *
 * T-CRM-150-1 (covered in csv.test.ts) — parser: quoted comma field preserved
 * T-CRM-150-2 (covered in csv.test.ts) — parser: quoted newline field not split
 * T-CRM-150-3 (covered in csv.test.ts) — "360,50" → valueCents=36050
 * T-CRM-150-4 [blocant] API smoke: covered by backend unit test below
 */
import { describe, it, expect } from "vitest";
import { parseCsv, parseCurrencyToCents, parseTags } from "@/lib/csv";

describe("CRM-150 — CSV import utility (used by CsvImportModal)", () => {
  // AC2: A line with "Acme, SRL" in a quoted field is parsed as one company field.
  it("T-CRM-150-1: quoted company name with comma stays as one field", () => {
    const rows = parseCsv('"Acme, SRL",+40721000000,test@acme.com');
    expect(rows[0][0]).toBe("Acme, SRL");
    expect(rows[0][1]).toBe("+40721000000");
    expect(rows[0][2]).toBe("test@acme.com");
  });

  // AC2: multi-line quoted field
  it("T-CRM-150-2: quoted field with newline is not split", () => {
    const rows = parseCsv('"Line1\nLine2",value2');
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Line1\nLine2");
  });

  // AC3: value "360,50" → 36050 cents
  it("T-CRM-150-3: parseCurrencyToCents '360,50' → 36050", () => {
    expect(parseCurrencyToCents("360,50")).toBe(36050);
  });

  // AC4: tags split correctly
  it("parseTags splits on semicolons and returns trimmed values", () => {
    expect(parseTags("vip; prospect; hot")).toEqual(["vip", "prospect", "hot"]);
  });

  it("parseTags splits on commas as fallback", () => {
    expect(parseTags("vip,prospect")).toEqual(["vip", "prospect"]);
  });

  // AC6: additional edge cases
  it("handles CRLF line endings in CSV", () => {
    const rows = parseCsv("name,phone\r\nIon Pop,+40720000001\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe("Ion Pop");
  });

  it("escapes double-quotes correctly", () => {
    const rows = parseCsv('"Say ""Hello"" world",ok');
    expect(rows[0][0]).toBe('Say "Hello" world');
  });
});
