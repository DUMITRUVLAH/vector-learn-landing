/**
 * Un workspace poate avea MAI MULTE organizații plătitoare (par_payers), nu una singură.
 *
 * Bug-ul pe care îl blochează: excluderea „propriei organizații" din candidații de beneficiar
 * se făcea după O SINGURĂ denumire (par_settings.orgLegalName). La un client cu două entități
 * care plătesc, un document emis între ele avea a doua entitate propusă drept beneficiar — se
 * completa o plată către sine. Acum ruta trimite TOATE denumirile proprii (setări + plătitori).
 */
import { describe, it, expect } from "vitest";
import { choosePayee, fuzzyOrgMatchAny } from "../choosePayee";
import type { ParPartiesExtraction, ParExtractedParty } from "../parPartyTypes";

function ext(parties: ParExtractedParty[], over: Partial<ParPartiesExtraction> = {}): ParPartiesExtraction {
  return {
    parties,
    amountCents: 120000,
    amountConfidence: 0.9,
    currency: "MDL",
    scope: "Servicii de instruire",
    documentClass: "invoice",
    isStub: false,
    ...over,
  };
}

const ATIC: ParExtractedParty = {
  name: "Asociatia Nationala a Companiilor din Domeniul TIC",
  role: "client",
  idno: "1006600034927",
};
/** A doua entitate a ACELUIAȘI client — plătitor separat în workspace. */
const FUNDATIA: ParExtractedParty = {
  name: 'A.O. "Fundația Vector"',
  role: "provider",
  idno: "1015600001234",
  iban: "MD03AG000000022512323419",
  bank: 'BC "Victoriabank" S.A.',
};
const FURNIZOR_EXTERN: ParExtractedParty = {
  name: "NEWS MAKER SRL",
  role: "provider",
  idno: "1014600022332",
  iban: "MD24AG000225100013104168",
  bank: 'BC "MAIB" S.A.',
};

describe("fuzzyOrgMatchAny", () => {
  it("recunoaște oricare dintre denumirile proprii", () => {
    const own = ["Asociatia Nationala a Companiilor din Domeniul TIC", 'A.O. "Fundația Vector"'];
    expect(fuzzyOrgMatchAny('Fundația Vector A.O.', own)).toBe(true);
    expect(fuzzyOrgMatchAny("NEWS MAKER SRL", own)).toBe(false);
  });

  it("acceptă și o singură denumire (compatibil cu apelul vechi)", () => {
    expect(fuzzyOrgMatchAny("ATIC", "ATIC")).toBe(true);
    expect(fuzzyOrgMatchAny("ATIC", null)).toBe(false);
  });
});

describe("choosePayee cu mai multe organizații proprii", () => {
  const OWN = ["Asociatia Nationala a Companiilor din Domeniul TIC", 'A.O. "Fundația Vector"'];

  it("[blocant] nu propune drept beneficiar a doua entitate proprie", () => {
    const r = choosePayee(ext([ATIC, FUNDATIA]), OWN);
    expect(r.payee).toBeNull();
    expect(r.options.map((o) => o.name)).not.toContain(FUNDATIA.name);
  });

  it("aceeași extragere, cu excludere pe o singură denumire, ar fi ales entitatea proprie", () => {
    // Comportamentul VECHI, păstrat aici ca dovadă că testul de mai sus chiar prinde regresia.
    const r = choosePayee(ext([ATIC, FUNDATIA]), OWN[0]);
    expect(r.payee?.name).toBe(FUNDATIA.name);
  });

  it("furnizorul extern rămâne beneficiarul, chiar dacă ambele entități proprii apar în act", () => {
    const r = choosePayee(ext([ATIC, FUNDATIA, FURNIZOR_EXTERN]), OWN);
    expect(r.payee?.name).toBe("NEWS MAKER SRL");
    expect(r.payee?.iban).toBe("MD24AG000225100013104168");
  });
});
