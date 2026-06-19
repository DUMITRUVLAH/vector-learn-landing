/**
 * PAR-SEC-001: tests for redactPii — the pattern-based PII redactor that masks
 * IBAN/IDNP in OCR text before it's sent to an external LLM (security-audit #1).
 */
import { describe, it, expect } from "vitest";
import { redactPii } from "../lib/ai/redactPii";

describe("redactPii", () => {
  it("masks a Moldova IBAN", () => {
    const { text, redactedCount } = redactPii("Plată către MD87AG000000022516065719 urgent.");
    expect(text).toContain("[IBAN_REDACTED]");
    expect(text).not.toContain("MD87AG000000022516065719");
    expect(redactedCount).toBe(1);
  });

  it("masks a 13-digit IDNP/IDNO", () => {
    const { text, redactedCount } = redactPii("IDNP 1016600016713 al beneficiarului.");
    expect(text).toContain("[ID_REDACTED]");
    expect(text).not.toContain("1016600016713");
    expect(redactedCount).toBe(1);
  });

  it("masks both IBAN and IDNP in the same text", () => {
    const { text, redactedCount } = redactPii(
      "Beneficiar: ATIC, IDNP 1016600016713, IBAN MD87AG000000022516065719."
    );
    expect(text).toContain("[IBAN_REDACTED]");
    expect(text).toContain("[ID_REDACTED]");
    expect(redactedCount).toBe(2);
  });

  it("keeps non-PII text (vendor name, amount, date) intact for extraction", () => {
    const { text } = redactPii("Furnizor: Demo SRL  Total: 5 040,00 MDL  Data: 2026-06-18");
    expect(text).toContain("Demo SRL");
    expect(text).toContain("5 040,00 MDL");
    expect(text).toContain("2026-06-18");
  });

  it("does not over-redact a normal amount (not 13 contiguous digits)", () => {
    const { text, redactedCount } = redactPii("Total 504000 bani");
    expect(text).toContain("504000");
    expect(redactedCount).toBe(0);
  });
});
