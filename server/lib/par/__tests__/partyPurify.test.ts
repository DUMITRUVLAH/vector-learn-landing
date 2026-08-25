/**
 * Field-purity invariants — the 2026-08-25 fiscal-invoice regression.
 *
 * The owner uploaded a typized MD fiscal invoice (Anexa 1, Ordin MF 118/2017) and got:
 * "Denumire companie" = «Поставщик DAIKIRI STUDIO S.R.L., SEC.CENTRU Grenoble nr.159
 * bl.6 of.12 Cont MD05ML022510000000001296,» — role label + name + address + IBAN in
 * ONE field, while "Adresă juridică" and "BIC" stayed empty, amount was null and scope
 * was a table column header.
 *
 * These tests assert INVARIANTS (what a field may NEVER contain / must be relocated),
 * not per-document golden values — so they hold for any of the ~50 document shapes,
 * on both extraction paths. They FAIL on the pre-purify code.
 */
import { describe, it, expect, vi } from "vitest";

// parExtractor imports the AI client, which imports the DB — mock it away so this
// stays a pure unit suite (same pattern as parExtractorIntegration.test.ts).
vi.mock("../../ai/client", () => ({
  callAi: vi.fn(async () => ({ isStub: true, text: "", model: "stub" })),
}));

import { purifyParty } from "../partyPurify";
import { normalizeParExtraction } from "../../ai/parExtractor";
import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";
import type { ParExtractedParty } from "../parPartyTypes";

// ─── Invariant helpers (field purity, any document) ───────────────────────────

const IBAN_RE = /\bMD\d{2}[A-Z0-9]{20}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const FISCAL13_RE = /\b\d{13}\b/;
const ADDRESS_TOKEN_RE = /\b(?:mun|or|sat|str|bd|sec|SEC|nr|bl|of|ap)\.\s*\S/;
const ROLE_LABEL_RE =
  /^(?:Furnizor|Поставщик|Prestator|Исполнитель|Executor|Cump[ăa]r[ăa]tor|Покупатель|Получатель|Beneficiar|Pl[ăa]titor|Плательщик|Заказчик|Supplier|Seller|Buyer|Bill\s)/i;

/** THE invariant: a party name holds only the legal name. */
function expectPureName(name: string) {
  expect(name).not.toMatch(IBAN_RE);
  expect(name).not.toMatch(FISCAL13_RE);
  expect(name).not.toMatch(ADDRESS_TOKEN_RE);
  expect(name).not.toMatch(ROLE_LABEL_RE);
  expect(name).not.toMatch(/\bCont\b/i);
  expect(name).not.toMatch(/nr\.?\s*TVA|c\.?f\./i);
}

// ─── purifyParty: decomposition of a mixed blob (source-agnostic) ─────────────

describe("purifyParty — each field gets only the info destined for it", () => {
  it("decomposes the exact production blob: label + name + address + Cont + IBAN", () => {
    const p = purifyParty({
      name: "Поставщик DAIKIRI STUDIO S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML022510000000001296,",
      role: "provider",
      idno: null,
      iban: null,
      bank: null,
      bic: null,
      legalAddress: null,
    });
    expect(p.name).toBe("DAIKIRI STUDIO S.R.L.");
    expect(p.iban).toBe("MD05ML022510000000001296");
    expect(p.legalAddress).toContain("Grenoble nr.159");
    expectPureName(p.name);
    // Relocations are honest: repaired flags drive "⚠ de verificat".
    expect(p.repaired?.name).toBe(true);
    expect(p.repaired?.iban).toBe(true);
    expect(p.repaired?.legalAddress).toBe(true);
  });

  it("decomposes the buyer blob: name + address + c.f./nr.TVA + 13 digits", () => {
    const p = purifyParty({
      name: "VECTOR ACADEMY S.R.L., SEC.CENTRU 31 August 1989 nr.78 c.f./ nr.TVA 1024600035737 /",
      role: "client",
      idno: null,
      iban: null,
      bank: null,
      bic: null,
      legalAddress: null,
    });
    expect(p.name).toBe("VECTOR ACADEMY S.R.L.");
    expect(p.idno).toBe("1024600035737");
    expect(p.legalAddress).toContain("31 August 1989 nr.78");
    expectPureName(p.name);
  });

  it("moves a full requisites train (bank + BIC) out of the name", () => {
    const p = purifyParty({
      name: "\"DAIKIRI STUDIO\" S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML022510000000001296, BC'Moldindconbank'S.A., MOLDMD2X",
      role: "provider",
    });
    expect(p.iban).toBe("MD05ML022510000000001296");
    expect(p.bic).toBe("MOLDMD2X");
    expect(p.bank).toContain("Moldindconbank");
    expect(p.legalAddress).toContain("Grenoble");
    expectPureName(p.name);
  });

  it("cleans a junk bank slot ('S.A., MOLDMD2X): BIC → bic, junk dropped", () => {
    const p = purifyParty({
      name: "DAIKIRI STUDIO S.R.L.",
      role: "provider",
      bank: "'S.A., MOLDMD2X",
      bic: null,
    });
    expect(p.bic).toBe("MOLDMD2X");
    expect(p.bank).toBeNull();
    expect(p.repaired?.bank).toBe(true);
  });

  it("never overwrites an already-populated field with a relocated value", () => {
    const p = purifyParty({
      name: "Firma X S.R.L. MD24AG000000000123456789",
      role: "provider",
      iban: "MD05ML022510000000001296", // already set → the name's IBAN must NOT clobber it
    });
    expect(p.iban).toBe("MD05ML022510000000001296");
    expect(p.name).not.toMatch(IBAN_RE);
  });

  it("leaves a clean person name untouched (persoană fizică, no false repairs)", () => {
    const p = purifyParty({ name: "Daria Roitman", role: "provider" });
    expect(p.name).toBe("Daria Roitman");
    expect(p.repaired).toBeUndefined();
  });

  it("does not blank a name that is entirely address-like (keeps something visible)", () => {
    const p = purifyParty({ name: "Liceul Teoretic Nr. 5", role: "provider" });
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.name).toContain("Liceul");
  });
});

// ─── Corpus: the typized MD fiscal invoice, end-to-end through the stub path ──

const FISCAL_INVOICE_TEXT = `FACTURĂ FISCALĂ
НАЛОГОВАЯ НАКЛАДНАЯ
Seria, Nr.
Серия, № EBC000579678
 Data eliberării /data livrării 04.11.2025 / 04.11.2025
1. Furnizor:
 Поставщик
"DAIKIRI STUDIO" S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML022510000000001296, BC'Moldindconbank'S.A., MOLDMD2X
c.f./ nr.TVA 1024600006236 /
2. Cumpărător/beneficiar:
 Покупатель/получатель
VECTOR ACADEMY S.R.L., SEC.CENTRU 31 August 1989 nr.78 c.f./ nr.TVA 1024600035737 /
4. Documente anexate
 Прилагаемые документы
Act de indeplinirea lucrarilor nr.2/11 din 04.11.2025
10.1
Denumirea mărfurilor/activelor, serviciilor şi codul poziţiei tarifare al mărfii/activului
Servicii predare curs "Productie si editare video" serv 1 17000.00 17000,00 - 0,00 17000,00
12. TOTAL (pe factura fiscală) / Всего (по налоговой накладной) 17000,00 X 0,00 17000,00 X X X 0,00
13. Permis eliberarea: director CHIRILL CARPALIUC`;

describe("stub path on the typized MD fiscal invoice (owner's 2026-08-25 document)", () => {
  const ext = parsePartiesFromText(FISCAL_INVOICE_TEXT);

  it("every extracted party has a pure name", () => {
    expect(ext.parties.length).toBeGreaterThanOrEqual(2);
    for (const party of ext.parties) expectPureName(party.name);
  });

  it("does not mint a phantom party out of the quoted course title on the service row", () => {
    expect(ext.parties.map((p) => p.name)).not.toContain("Productie si editare video");
  });

  it("extracts the TOTAL despite the fiscal form's X-column tail", () => {
    expect(ext.amountCents).toBe(1700000);
    expect(ext.currency).toBe("MDL");
  });

  it("scope is the delivered service, never the table column header", () => {
    expect(ext.scope).toBeTruthy();
    expect(ext.scope).not.toMatch(/codul\s*pozi|tarifare|activelor/i);
    expect(ext.scope).toMatch(/Servicii predare curs/i);
  });

  it("choosePayee resolves the supplier with routed requisites (self-org excluded)", () => {
    const choice = choosePayee({ ...ext, isStub: true }, "VECTOR ACADEMY S.R.L.");
    expect(choice.needsClarification).toBe(false);
    expect(choice.payee).not.toBeNull();
    expect(choice.payee!.name).toBe("DAIKIRI STUDIO S.R.L.");
    expect(choice.payee!.iban).toBe("MD05ML022510000000001296");
    expect(choice.payee!.idno).toBe("1024600006236");
    expectPureName(choice.payee!.name);
  });
});

// ─── LLM-path invariant: purify runs on model output too ──────────────────────

describe("LLM path is purified identically (normalizeParExtraction)", () => {
  it("a model answer that glued label+address+IBAN into name is decomposed", () => {
    const ext = normalizeParExtraction({
      parties: [
        {
          name: "Furnizor: Alfa Beta S.R.L., mun. Chișinău, str. Ștefan cel Mare nr. 1, MD24AG000000000123456789",
          role: "provider",
          idno: null,
          iban: null,
          bank: null,
        },
      ],
      amount: { value: 100, confidence: 0.9 },
      currency: "MDL",
      scope: { value: "test", confidence: 0.9 },
      document_class: { value: "invoice", confidence: 0.9 },
    });
    const p = ext.parties[0];
    expect(p.name).toBe("Alfa Beta S.R.L.");
    expect(p.iban).toBe("MD24AG000000000123456789");
    expect(p.legalAddress).toContain("Ștefan cel Mare");
    expectPureName(p.name);
  });
});
