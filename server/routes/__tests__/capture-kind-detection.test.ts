/**
 * INVOICE-REPORTING: capture kind auto-detection vs forced kind
 *
 * Bug: a real invoice whose extracted text happens to contain ≥3 "DD.MM.YYYY DD.MM.YYYY"
 * date-pairs (or the words "extras de cont") was auto-promoted to kind="statement", so it
 * never entered the invoice pool for matching and — on a scanned PDF / AI timeout — showed
 * "Eroare". The bulk-invoice dropzone now sends forceKind, which must skip auto-detection.
 *
 * This mirrors the decision in server/routes/finCaptures.ts (POST /captures) as a pure
 * predicate so it's unit-testable without booting the app / PGlite.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

/** Mirror of the auto-detect rule in POST /api/fin/captures. */
function resolveKind(
  initialKind: "document" | "statement",
  rawText: string,
  forceKind: boolean,
): "document" | "statement" {
  let kind = initialKind;
  if (kind !== "statement" && !forceKind) {
    const dateLinePairs = (rawText.match(/\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}/g) ?? []).length;
    if (/extras de cont/i.test(rawText) || dateLinePairs >= 3) kind = "statement";
  }
  return kind;
}

const invoiceWithDatePairs = `Invoice Tilda Publishing
01.10.2025 05.10.2025
02.10.2025 06.10.2025
03.10.2025 07.10.2025
Total: 25703 MDL`;

describe("capture kind detection", () => {
  it("auto-promotes to statement when text has ≥3 date-pairs and kind not forced (legacy behaviour)", () => {
    expect(resolveKind("document", invoiceWithDatePairs, false)).toBe("statement");
  });

  it("auto-promotes to statement on the words 'extras de cont'", () => {
    expect(resolveKind("document", "EXTRAS DE CONT octombrie 2025", false)).toBe("statement");
  });

  it("KEEPS document when forceKind is set, even with date-pairs (the bulk-invoice fix)", () => {
    expect(resolveKind("document", invoiceWithDatePairs, true)).toBe("document");
  });

  it("KEEPS document when forceKind is set, even with 'extras de cont'", () => {
    expect(resolveKind("document", "extras de cont", true)).toBe("document");
  });

  it("a plain invoice with no date-pairs stays a document regardless of forceKind", () => {
    const plain = "Invoice Acme · Total 1500 MDL · data 2025-10-01";
    expect(resolveKind("document", plain, false)).toBe("document");
    expect(resolveKind("document", plain, true)).toBe("document");
  });

  it("an explicit statement upload stays a statement", () => {
    expect(resolveKind("statement", "anything", false)).toBe("statement");
  });
});
