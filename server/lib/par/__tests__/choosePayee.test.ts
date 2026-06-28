/**
 * PAR AI multi-party autocomplete — the 20-scenario deterministic gate.
 *
 * Runs the stub regex parser (the no-API-key path) + choosePayee against every
 * scenario and asserts the resolved payee / candidates / validation. No LLM.
 */

import { describe, it, expect } from "vitest";
import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";
import { SCENARIOS } from "./scenarios.fixture";

/** Strip quotes / honorifics / legal-form word order so names compare by distinctive tokens. */
function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/["“”„«».]/g, "")
    .replace(/[^a-z0-9а-яёăâîșțöü ]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t &&
        !["srl", "sa", "ao", "ii", "îi", "îs", "is", "ооо", "оао", "зао", "sc", "î", "i", "s", "a"].includes(t),
    )
    .sort()
    .join(" ");
}

describe("PAR choosePayee — 20 scenarios", () => {
  it.each(SCENARIOS)("$id — $title", (s) => {
    const ext = parsePartiesFromText(s.docText);
    const choice = choosePayee(ext, s.tenantOrgName || null);

    expect(choice.needsClarification).toBe(s.expected.needsClarification);

    if (s.expected.needsClarification) {
      const got = choice.candidates.map((c) => normName(c.name)).sort();
      const want = s.expected.candidateNames.map(normName).sort();
      expect(got).toEqual(want);
      expect(choice.payee).toBeNull();
    } else {
      expect(normName(choice.payee?.name)).toBe(normName(s.expected.payeeName));
      expect(choice.payee?.idno ?? "").toBe(s.expected.payeeIdno);
      expect(choice.payee?.iban ?? "").toBe(s.expected.payeeIban);
      if (s.expected.payeeType) {
        expect(choice.payee?.payeeType).toBe(s.expected.payeeType);
      }
    }

    expect(choice.amountCents).toBe(s.expected.amountCents);
    expect(choice.currency).toBe(s.expected.currency);
  });
});
