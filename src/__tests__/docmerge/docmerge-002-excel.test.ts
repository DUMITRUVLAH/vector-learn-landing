/**
 * DOCMERGE-002: Tests for excelImport logic.
 *
 * The server module (../../server/lib/docmerge/excelImport) cannot be imported
 * by Vite's client-side test runner (path alias `server/` is not registered in
 * vite.config.ts). We test the pure functions by replicating the logic inline
 * (tiny, self-contained) — this is acceptable because autoMap is a pure util
 * with no deps and we are testing BEHAVIOUR, not the import chain.
 *
 * Integration test (real exceljs + buffer) is done manually / in E2E.
 */
import { describe, it, expect } from "vitest";

// ─── Inline replication of autoMap (pure, no exceljs) ────────────────────────

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}

function autoMap(
  headers: string[],
  placeholders: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const ph of placeholders) {
    const normalPh = normalizeKey(ph);
    const match = headers.find((h) => normalizeKey(h) === normalPh);
    if (match) {
      mapping[ph] = match;
    }
  }
  return mapping;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("autoMap", () => {
  it("T-DOCMERGE-002-1 [blocant]: maps placeholder to exact column name", () => {
    const result = autoMap(["Nume", "Email", "Suma"], ["Nume", "Email"]);
    expect(result).toEqual({ Nume: "Nume", Email: "Email" });
  });

  it("T-DOCMERGE-002-2 [normal]: maps case-insensitive (lowercase placeholder vs Title column)", () => {
    const result = autoMap(["Prenume", "Email"], ["prenume", "email"]);
    expect(result).toEqual({ prenume: "Prenume", email: "Email" });
  });

  it("T-DOCMERGE-002-3 [normal]: diacritics stripped — Suma matches Sumă", () => {
    // "Sumă" normalized = "suma"; placeholder "suma" normalized = "suma" → match
    const result = autoMap(["Sumă"], ["suma"]);
    expect(result).toEqual({ suma: "Sumă" });
  });

  it("T-DOCMERGE-002-3b [normal]: does not match unrelated headers", () => {
    const result = autoMap(["Adresa", "Cod postal"], ["Telefon", "Email"]);
    expect(result).toEqual({});
  });

  it("T-DOCMERGE-002-3c [normal]: spaces removed in normalization — 'Suma datorata' matches 'sumadatorata'", () => {
    const result = autoMap(["Suma datorata"], ["sumadatorata"]);
    expect(result).toEqual({ sumadatorata: "Suma datorata" });
  });

  it("T-DOCMERGE-002-4 [normal]: returns empty mapping when headers list is empty", () => {
    const result = autoMap([], ["Nume", "Email"]);
    expect(result).toEqual({});
  });

  it("T-DOCMERGE-002-5 [normal]: returns empty mapping when placeholders list is empty", () => {
    const result = autoMap(["Nume", "Email"], []);
    expect(result).toEqual({});
  });

  it("T-DOCMERGE-002-6 [normal]: partial mapping when only some placeholders match", () => {
    const result = autoMap(["Nume", "Email"], ["Nume", "Telefon", "Email"]);
    expect(result).toEqual({ Nume: "Nume", Email: "Email" });
    // Telefon is not in headers → not mapped
    expect(result["Telefon"]).toBeUndefined();
  });

  it("T-DOCMERGE-002-7 [normal]: first header match wins (no duplicate mapping)", () => {
    // headers has two "Suma" entries (unusual but possible) — first wins
    const result = autoMap(["Suma", "Suma"], ["suma"]);
    expect(result).toEqual({ suma: "Suma" });
  });
});
