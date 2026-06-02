/**
 * AI-A01 — Tests for GDPR pseudonymization layer (T-AI-A01-3)
 */
import { describe, it, expect } from "vitest";
import {
  pseudonymize,
  depseudonymize,
  extractNames,
} from "../../../server/lib/ai/pseudonymize";

describe("pseudonymize", () => {
  it("replaces a single name with a token", () => {
    const { text, tokenMap } = pseudonymize(
      "Maria Popescu a venit la lecție.",
      ["Maria Popescu"]
    );
    expect(text).toContain("[PERSON_1]");
    expect(text).not.toContain("Maria Popescu");
    expect(tokenMap["[PERSON_1]"]).toBe("Maria Popescu");
  });

  it("replaces multiple names with different tokens", () => {
    const { text, tokenMap } = pseudonymize(
      "Profesorul Ion Ionescu a predat Maria Popescu.",
      ["Ion Ionescu", "Maria Popescu"]
    );
    // Both names should be replaced
    expect(text).not.toContain("Ion Ionescu");
    expect(text).not.toContain("Maria Popescu");
    expect(Object.keys(tokenMap).length).toBe(2);
  });

  it("handles case-insensitive matching", () => {
    const { text } = pseudonymize(
      "maria a venit. MARIA a plecat.",
      ["Maria"]
    );
    expect(text).not.toContain("maria");
    expect(text).not.toContain("MARIA");
    expect(text).toContain("[PERSON_1]");
  });

  it("returns empty tokenMap for empty names array", () => {
    const { text, tokenMap } = pseudonymize("Lecția a mers bine.", []);
    expect(text).toBe("Lecția a mers bine.");
    expect(Object.keys(tokenMap)).toHaveLength(0);
  });

  it("handles longer names before shorter substrings (compound names)", () => {
    const { text } = pseudonymize(
      "Maria Popescu și Maria sunt prietene.",
      ["Maria Popescu", "Maria"]
    );
    // Maria Popescu should be replaced first, then remaining "Maria"
    expect(text).not.toContain("Maria");
  });

  it("ignores empty/blank names", () => {
    const { text, tokenMap } = pseudonymize("Test text.", ["", "  "]);
    expect(text).toBe("Test text.");
    expect(Object.keys(tokenMap)).toHaveLength(0);
  });
});

describe("depseudonymize", () => {
  it("restores original names from tokens", () => {
    const { text, tokenMap } = pseudonymize(
      "Maria Popescu a venit la lecție.",
      ["Maria Popescu"]
    );
    const restored = depseudonymize(text, tokenMap);
    expect(restored).toBe("Maria Popescu a venit la lecție.");
  });

  it("is a no-op for empty tokenMap", () => {
    const result = depseudonymize("Lecția a mers bine.", {});
    expect(result).toBe("Lecția a mers bine.");
  });

  it("round-trip preserves text (pseudonymize then depseudonymize)", () => {
    const original =
      "Ion Ionescu a predat vocabularul lui Maria Popescu. Ion Ionescu a plecat la 18:00.";
    const names = ["Ion Ionescu", "Maria Popescu"];
    const { text: pseudoText, tokenMap } = pseudonymize(original, names);
    const restored = depseudonymize(pseudoText, tokenMap);
    expect(restored).toBe(original);
  });
});

describe("extractNames", () => {
  it("filters out null/undefined/empty values", () => {
    const names = extractNames("Maria", null, undefined, "", "Ion");
    expect(names).toEqual(["Maria", "Ion"]);
  });

  it("returns empty array when all args are falsy", () => {
    const names = extractNames(null, undefined, "");
    expect(names).toEqual([]);
  });
});
