/**
 * DIPLOMA-802 — T-DIPLOMA-802-1, T-DIPLOMA-802-2
 * Tests for normalizeCertificateText and wrapText
 */
import { describe, it, expect } from "vitest";
import { normalizeCertificateText, wrapText, type TextMeasurer } from "@/lib/certificateText";

describe("normalizeCertificateText", () => {
  // T-DIPLOMA-802-1 [blocant]
  it("trims, collapses whitespace, and NFC-normalizes", () => {
    expect(normalizeCertificateText("Ion   Popescu ")).toBe("Ion Popescu");
  });

  it("normalizes leading/trailing whitespace", () => {
    expect(normalizeCertificateText("  Ana  ")).toBe("Ana");
  });

  it("collapses tabs and newlines to spaces", () => {
    expect(normalizeCertificateText("Ion\t\nPopescu")).toBe("Ion Popescu");
  });

  it("applies NFC normalization for diacritics", () => {
    // NFD decomposed 'a' + combining acute → NFC gives single 'á' codepoint
    const nfd = "á"; // 'a' + combining acute accent (U+0301) = á in NFD
    const nfc = "á";   // á precomposed (U+00E1) = NFC form
    expect(normalizeCertificateText(nfd)).toBe(nfc);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeCertificateText("   ")).toBe("");
  });
});

describe("wrapText", () => {
  // T-DIPLOMA-802-2 [blocant]
  it("wraps text at maxWidth using mock measureText", () => {
    // Each character is 10px wide in mock
    const mockCtx: TextMeasurer = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    };

    const lines = wrapText(mockCtx, "Hello World Foo Bar", 60);
    // "Hello" = 50px ≤ 60px
    // "Hello World" = 110px > 60px → line break
    // Each word is: Hello(50), World(50), Foo(30), Bar(30)
    // So: "Hello World" > 60 → ["Hello", "World", "Foo Bar"] or ["Hello", "World Foo", "Bar"]?
    // Let's trace:
    // current="", word="Hello" → test="Hello"(50) ≤ 60 → current="Hello"
    // word="World" → test="Hello World"(110) > 60 → push "Hello", current="World"
    // word="Foo" → test="World Foo"(90) > 60 → push "World", current="Foo"
    // word="Bar" → test="Foo Bar"(70) > 60 → push "Foo", current="Bar"
    // end → push "Bar"
    expect(lines).toEqual(["Hello", "World", "Foo", "Bar"]);
  });

  it("returns single line when text fits", () => {
    const mockCtx = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const lines = wrapText(mockCtx, "Hi", 200);
    expect(lines).toEqual(["Hi"]);
  });

  it("handles empty string", () => {
    const mockCtx = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const lines = wrapText(mockCtx, "", 100);
    expect(lines).toEqual([""]);
  });

  it("handles single long word that exceeds maxWidth", () => {
    const mockCtx = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    // "Supercalifragilistic" = 200px > 100px — no space to break, gets its own line
    const lines = wrapText(mockCtx, "Supercalifragilistic", 100);
    expect(lines).toEqual(["Supercalifragilistic"]);
  });
});
