/**
 * Regression for the 2026-08-25 live check of the freshly-shipped "stub extractor also fills
 * legal address + administrator name" (PR #291): on a perfectly ordinary contract both new
 * fields swallowed the line that FOLLOWED them.
 *
 *   Adresa juridică: mun. Chișinău, bd. Ștefan cel Mare 132, of. 12
 *   Administrator: Vasile Popescu
 *   Cont bancar (IBAN): MD24AG000225100013104168
 *
 * produced
 *   legalAddress      = "…, of. 12 Administrator: Vasile Popescu Cont bancar ("
 *   administratorName = "Vasile Popescu\nCont"
 *
 * Root cause (one mechanism, two symptoms): both extractors take a fixed-size CHARACTER window
 * after their label and rely on a stop-word list to end the value. `\s` in the name regex — and
 * the character window itself — happily cross a newline, so whatever is on the next line gets
 * appended whenever no stop word happens to sit in between.
 *
 * PR #293 restored the real line structure of PDF text (pdfText no longer collapses newlines),
 * which makes the correct boundary available: a LABELLED requisite value ends at the end of its
 * own line. The stop-word list stays as the within-line guard for one-line/collapsed sources.
 */
import { describe, it, expect } from "vitest";
import { parsePartiesFromText } from "../stubPartyParser";

const CONTRACT = [
  "CONTRACT DE PRESTĂRI SERVICII nr. 42",
  "",
  'BENEFICIAR: A.O. "ATIC" , IDNO 1010620008173,',
  "adresa juridică: mun. Chișinău, str. Studenților 9/11,",
  "reprezentată de administrator Ion Rusu",
  "",
  'PRESTATOR: S.R.L. "TEHNO SERVICE PLUS", cod fiscal 1003600045678',
  "Adresa juridică: mun. Chișinău, bd. Ștefan cel Mare 132, of. 12",
  "Administrator: Vasile Popescu",
  "Cont bancar (IBAN): MD24AG000225100013104168",
  'Banca: BC "MOLDOVA-AGROINDBANK" S.A.',
  "Codul bancar: AGRNMD2X",
  "",
  "Suma totală a contractului: 24 500,00 MDL.",
].join("\n");

describe("labelled requisites stop at the end of their own line", () => {
  const parties = parsePartiesFromText(CONTRACT).parties;
  const provider = parties.find((p) => /TEHNO/i.test(p.name ?? ""));
  const client = parties.find((p) => /ATIC/i.test(p.name ?? ""));

  it("finds both parties", () => {
    expect(provider).toBeDefined();
    expect(client).toBeDefined();
  });

  it("the legal address stops at its own line end", () => {
    expect(provider?.legalAddress).toBe("mun. Chișinău, bd. Ștefan cel Mare 132, of. 12");
  });

  it("the legal address never absorbs the following requisite lines", () => {
    expect(provider?.legalAddress ?? "").not.toMatch(/Administrator|Cont bancar|IBAN|Banca/i);
    expect(client?.legalAddress ?? "").not.toMatch(/reprezentat|Administrator/i);
  });

  it("the administrator name is the name alone — no word borrowed from the next line", () => {
    expect(provider?.administratorName).toBe("Vasile Popescu");
    expect(client?.administratorName).toBe("Ion Rusu");
  });

  it("no requisite value contains a newline", () => {
    for (const p of parties) {
      expect(p.legalAddress ?? "").not.toContain("\n");
      expect(p.administratorName ?? "").not.toContain("\n");
    }
  });

  it("each party keeps its OWN address and administrator (no cross-contamination)", () => {
    expect(provider?.legalAddress).toMatch(/Ștefan cel Mare/);
    expect(client?.legalAddress).toMatch(/Studenților/);
    expect(provider?.administratorName).not.toMatch(/Rusu/);
    expect(client?.administratorName).not.toMatch(/Popescu/);
  });

  it("still reads a one-line (collapsed) source, where the stop words are the only boundary", () => {
    // A source with no line structure at all must not regress: the stop-word guard still applies.
    const collapsed = CONTRACT.replace(/\n/g, " ");
    const p = parsePartiesFromText(collapsed).parties.find((x) => /TEHNO/i.test(x.name ?? ""));
    expect(p?.legalAddress ?? "").not.toMatch(/Cont bancar|IBAN|Banca:/i);
    expect(p?.administratorName ?? "").not.toMatch(/Cont/i);
  });
});
