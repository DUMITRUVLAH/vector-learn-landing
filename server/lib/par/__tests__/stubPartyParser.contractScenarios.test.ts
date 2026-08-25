/**
 * 26 extraction scenarios derived from ONE real document — the signed services contract
 * CRJM ↔ Vector Academy that the owner reported on 2026-08-25 (amount read as 2 224 217 675 lei,
 * "Bancă" = `iciară: …`, administrator = `Președintelui Ilie`, 5 parties instead of 2).
 *
 * Each scenario mutates the contract in ONE realistic way — the wordings, orderings and label
 * variants that genuinely occur across Moldovan contracts — so that a future edit to the
 * heuristics cannot fix one document by breaking another. This is the deterministic (no-API-key)
 * path, which is what every user gets while the model has no credit.
 */

import { describe, it, expect } from "vitest";
import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";
import type { ParExtractedParty } from "../parPartyTypes";

// ─── The document, as reusable blocks ─────────────────────────────────────────

const INTRO = [
  "CONTRACT DE PRESTARE A SERVICIILOR nr. 27-26/ NDF DKK",
  "mun. Chișinău 13 iulie 2026",
  "Părțile contractante",
  "Asociația Obștească „Centrul de Resurse Juridice” (în continuare CRJM), în persoana Președintelui Ilie CHIRTOACĂ,",
  "care acționează în baza Statutului, cod fiscal 1010620008129, denumită în continuare „Beneficiar”,",
  "și",
  "„Vector Academy” S.R.L în persoana Administratorului, Dumitru VLAH, cod fiscal 1024600035737,",
  "numit în continuare „Prestator”, au convenit asupra încheierii prezentului Contract.",
];

const SIGNATURES = [
  "Semnăturile părților:",
  "BENEFICIAR PRESTATOR",
  "Asociaţia Obştească „Centrul de Resurse Juridice”",
  "Adresa: str. A.Şciusev 33, MD-2001, mun. Chişinău",
  "Cod fiscal: 1010620008129",
  "Banca Beneficiară: VictoriaBank S.A. fil. Nr. 17",
  "Codul Băncii: VICBMD2X457",
  "Codul IBAN: MD80VI000002224217675MDL",
  "Preşedinte, Ilie CHIRTOACĂ",
  "S.C. „Vector Academy” S.R.L.",
  "Adresa juridică: mun. Chișinău, str. 31 August 1989, 78",
  "Cod fiscal nr. 1024600035737",
  "Banca Beneficiară: BC „Moldova-Agroindbank” S.A.",
  "Codul Băncii: AGRNMD2X",
  "Codul IBAN: MD87AG000000022516065719",
  "Administrator, Dumitru VLAH",
];

const AMOUNT_LINE = "5.3 Remunerarea totală a serviciilor prestate constituie MDL 8,000.00 (opt mii lei, 00 bani), TVA inclus.";

/** Build the document, optionally replacing the amount line and/or patching any line. */
function doc(opts: { amount?: string; patch?: (lines: string[]) => string[] } = {}): string {
  let lines = [...INTRO, opts.amount ?? AMOUNT_LINE, ...SIGNATURES];
  if (opts.patch) lines = opts.patch(lines);
  return lines.join("\n");
}

const parse = (text: string) => parsePartiesFromText(text);
const crjm = (parties: ParExtractedParty[]) => parties.find((p) => /Resurse Juridice/i.test(p.name));
const vector = (parties: ParExtractedParty[]) => parties.find((p) => /Vector Academy/i.test(p.name));

// ─── 1–8: the amount ──────────────────────────────────────────────────────────

describe("suma de plată", () => {
  it("S01 — currency printed BEFORE the number, bracket after: MDL 8,000.00 (opt mii lei)", () => {
    expect(parse(doc()).amountCents).toBe(800_000);
  });

  it("S02 — never reads the digits inside an IBAN that ends in a currency code", () => {
    // MD80VI000002224217675MDL → 2 224 217 675,00 was the reported failure.
    expect(parse(doc()).amountCents).not.toBe(222_421_767_500);
  });

  it("S03 — RO grouping after the number: 8 000,00 lei", () => {
    expect(parse(doc({ amount: "5.3 Remunerarea totală constituie 8 000,00 lei, TVA inclus." })).amountCents).toBe(800_000);
  });

  it("S04 — EN grouping after the number: 8,000.00 MDL", () => {
    expect(parse(doc({ amount: "5.3 Remunerarea totală constituie 8,000.00 MDL, TVA inclus." })).amountCents).toBe(800_000);
  });

  it("S05 — the Anexa price table: 'Preț total (inclusiv TVA) 8,000.00'", () => {
    const ext = parse(doc({ amount: "Preț total (inclusiv TVA) 8,000.00" }));
    expect(ext.amountCents).toBe(800_000);
  });

  it("S06 — an EUR contract keeps EUR, not the default MDL", () => {
    const ext = parse(doc({ amount: "5.3 Remunerarea totală constituie EUR 1,250.00 (o mie două sute cincizeci euro)." }));
    expect(ext.amountCents).toBe(125_000);
    expect(ext.currency).toBe("EUR");
  });

  it("S07 — a 13-digit fiscal code is never mistaken for the amount", () => {
    const ext = parse(doc({ amount: "5.3 Remunerarea totală constituie 8 000,00 lei." }));
    expect(ext.amountCents).toBe(800_000);
    expect(ext.amountCents).not.toBe(101_062_000_812_900);
  });

  it("S08 — no amount stated anywhere → null, never a guess", () => {
    const lines = [...INTRO, ...SIGNATURES];
    expect(parse(lines.join("\n")).amountCents).toBeNull();
  });
});

// ─── 9–14: the bank name ──────────────────────────────────────────────────────

describe("câmpul Bancă", () => {
  it("S09 — 'Banca Beneficiară:' is stripped, not sliced into 'iciară:'", () => {
    const ext = parse(doc());
    expect(crjm(ext.parties)?.bank).toBe("VictoriaBank S.A. fil. Nr. 17");
    expect(crjm(ext.parties)?.bank).not.toMatch(/^iciar/);
  });

  it("S10 — plain 'Banca:' label", () => {
    const ext = parse(doc({ patch: (l) => l.map((x) => x.replace("Banca Beneficiară: VictoriaBank", "Banca: VictoriaBank")) }));
    expect(crjm(ext.parties)?.bank).toBe("VictoriaBank S.A. fil. Nr. 17");
  });

  it("S11 — English 'Beneficiary bank:' label", () => {
    const ext = parse(doc({ patch: (l) => l.map((x) => x.replace("Banca Beneficiară: VictoriaBank", "Beneficiary bank: VictoriaBank")) }));
    expect(crjm(ext.parties)?.bank).toBe("VictoriaBank S.A. fil. Nr. 17");
  });

  it("S12 — the bank name never swallows the following 'Codul Băncii' / 'Codul IBAN' lines", () => {
    const bank = crjm(parse(doc()).parties)?.bank ?? "";
    expect(bank).not.toMatch(/Codul/i);
    expect(bank).not.toMatch(/VICBMD2X457|MD80VI/);
  });

  it("S13 — a quoted bank name survives intact", () => {
    expect(vector(parse(doc()).parties)?.bank).toBe("BC „Moldova-Agroindbank” S.A.");
  });

  it("S14 — a party with no bank line gets null, not a neighbour's bank", () => {
    const ext = parse(doc({ patch: (l) => l.filter((x) => !x.startsWith("Banca Beneficiară: VictoriaBank")) }));
    expect(crjm(ext.parties)?.bank ?? null).toBeNull();
    expect(vector(ext.parties)?.bank).toBe("BC „Moldova-Agroindbank” S.A.");
  });
});

// ─── 15–17: BIC / SWIFT ───────────────────────────────────────────────────────

describe("câmpul BIC / SWIFT", () => {
  it("S15 — 'Codul Băncii: VICBMD2X457' (11 chars)", () => {
    expect(crjm(parse(doc()).parties)?.bic).toBe("VICBMD2X457");
  });

  it("S16 — 'Codul Băncii: AGRNMD2X' (8 chars)", () => {
    expect(vector(parse(doc()).parties)?.bic).toBe("AGRNMD2X");
  });

  it("S17 — a value that is not BIC-shaped is dropped, not stored", () => {
    const ext = parse(doc({ patch: (l) => l.map((x) => x.replace("Codul Băncii: VICBMD2X457", "Codul Băncii: 226541")) }));
    expect(crjm(ext.parties)?.bic ?? null).toBeNull();
  });
});

// ─── 18–21: the administrator / representative ───────────────────────────────

describe("câmpul Administrator", () => {
  it("S18 — 'Preşedinte, Ilie CHIRTOACĂ' → the name, ALL-CAPS surname included", () => {
    expect(crjm(parse(doc()).parties)?.administratorName).toBe("Ilie CHIRTOACĂ");
  });

  it("S19 — 'Administrator, Dumitru VLAH'", () => {
    expect(vector(parse(doc()).parties)?.administratorName).toBe("Dumitru VLAH");
  });

  it("S20 — 'în persoana Directorului, Elena Roșca' (role noun not part of the name)", () => {
    const ext = parse(
      doc({ patch: (l) => l.map((x) => x.replace("în persoana Administratorului, Dumitru VLAH", "în persoana Directorului, Elena Roșca")).filter((x) => x !== "Administrator, Dumitru VLAH") }),
    );
    expect(vector(ext.parties)?.administratorName).toBe("Elena Roșca");
  });

  it("S21 — no representative stated → null, never the company name", () => {
    const ext = parse(
      doc({
        patch: (l) =>
          l
            .map((x) => x.replace("în persoana Administratorului, Dumitru VLAH, ", ""))
            .filter((x) => x !== "Administrator, Dumitru VLAH"),
      }),
    );
    expect(vector(ext.parties)?.administratorName ?? "").not.toMatch(/Vector Academy|S\.R\.L/);
  });
});

// ─── 22–26: parties, roles and the payee decision ────────────────────────────

describe("părțile și rolurile", () => {
  it("S22 — exactly two parties: the contract's defined terms are not companies", () => {
    const names = parse(doc()).parties.map((p) => p.name);
    expect(names).toHaveLength(2);
    expect(names).not.toContain("Beneficiar");
    expect(names).not.toContain("Prestator");
  });

  it("S23 — one company mentioned two ways is ONE party with the requisites merged", () => {
    const v = vector(parse(doc()).parties);
    expect(v?.idno).toBe("1024600035737"); // from the intro
    expect(v?.iban).toBe("MD87AG000000022516065719"); // from the signature block
  });

  it("S24 — 'denumită în continuare „Beneficiar”' makes that party the payer", () => {
    const ext = parse(doc());
    expect(crjm(ext.parties)?.role).toBe("client");
    expect(vector(ext.parties)?.role).toBe("provider");
  });

  it("S25 — a reversed signature header assigns roles in its own order", () => {
    // Same document, but the columns are printed PRESTATOR | BENEFICIAR and the intro phrases
    // are gone — the header is then the only role signal there is.
    const lines = [
      "Semnăturile părților:",
      "PRESTATOR BENEFICIAR",
      "S.C. „Vector Academy” S.R.L.",
      "Cod fiscal nr. 1024600035737",
      "Codul IBAN: MD87AG000000022516065719",
      "Asociaţia Obştească „Centrul de Resurse Juridice”",
      "Cod fiscal: 1010620008129",
      "Codul IBAN: MD80VI000002224217675MDL",
    ];
    const ext = parse(lines.join("\n"));
    expect(vector(ext.parties)?.role).toBe("provider");
    expect(crjm(ext.parties)?.role).toBe("client");
  });

  it("S26 — the payee is the counterparty, whichever side of the contract the tenant is on", () => {
    const ext = { ...parse(doc()), isStub: true as const };

    const asProvider = choosePayee(ext, "Vector Academy SRL");
    expect(asProvider.needsClarification).toBe(false);
    expect(asProvider.payee?.name).toBe("Centrul de Resurse Juridice");
    expect(asProvider.payee?.iban).toBe("MD80VI000002224217675MDL");
    expect(asProvider.payee?.bic).toBe("VICBMD2X457");

    const asClient = choosePayee(ext, "Asociația Obștească Centrul de Resurse Juridice");
    expect(asClient.needsClarification).toBe(false);
    expect(asClient.payee?.name).toBe("Vector Academy S.R.L");
    expect(asClient.payee?.iban).toBe("MD87AG000000022516065719");
    expect(asClient.payee?.administratorName).toBe("Dumitru VLAH");
  });
});
