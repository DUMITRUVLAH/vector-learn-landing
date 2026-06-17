/**
 * DOCMERGE-001 — Placeholder extraction + render tests
 * Tests T-DOCMERGE-001-1 and T-DOCMERGE-001-2.
 */
import { describe, it, expect } from "vitest";
import {
  extractPlaceholders,
  renderWithContext,
  sampleContext,
} from "../../../server/lib/docmerge/placeholders";

describe("DOCMERGE-001 — extractPlaceholders", () => {
  it("T-DOCMERGE-001-1 [blocant] deduplicates and preserves order", () => {
    const result = extractPlaceholders(
      "Salut {{name}}, ai {{amount}} lei. {{name}}"
    );
    expect(result).toEqual(["name", "amount"]);
  });

  it("returns empty array when no placeholders found", () => {
    expect(extractPlaceholders("Niciun placeholder")).toEqual([]);
  });

  it("handles multiple placeholders in order", () => {
    const result = extractPlaceholders("{{a}} {{b}} {{c}}");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("ignores whitespace inside braces (does not match {{ name }})", () => {
    // The regex \w+ doesn't match spaces, so {{name}} matches but {{ name }} doesn't.
    const result = extractPlaceholders("{{ name }} {{valid}}");
    expect(result).toEqual(["valid"]);
  });
});

describe("DOCMERGE-001 — renderWithContext", () => {
  it("T-DOCMERGE-001-2 [blocant] substitutes known, leaves unknown as {{tag}}", () => {
    const result = renderWithContext(
      "Bună {{name}}, lipsa este {{missing}}.",
      { name: "Ana" }
    );
    expect(result).toBe("Bună Ana, lipsa este {{missing}}.");
  });

  it("renders all known placeholders", () => {
    const result = renderWithContext("{{a}} {{b}}", { a: "unu", b: "doi" });
    expect(result).toBe("unu doi");
  });

  it("leaves template unchanged when context is empty", () => {
    const result = renderWithContext("{{x}} {{y}}", {});
    expect(result).toBe("{{x}} {{y}}");
  });
});

describe("DOCMERGE-001 — sampleContext", () => {
  it("maps known Romanian fields to demo values", () => {
    const ctx = sampleContext(["name", "suma", "data"]);
    expect(ctx.name).toBeTruthy();
    expect(ctx.suma).toBeTruthy();
    expect(ctx.data).toBeTruthy();
  });

  it("falls back to {tag} for unknown placeholders", () => {
    const ctx = sampleContext(["numeCustomField"]);
    expect(ctx.numeCustomField).toBe("{numeCustomField}");
  });

  it("returns empty object for empty placeholders", () => {
    expect(sampleContext([])).toEqual({});
  });
});
