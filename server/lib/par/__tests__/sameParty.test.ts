/**
 * Cazurile din acest fișier sunt LUATE DIN PRODUCȚIE — cele 59 de „neconcordanțe" raportate pe
 * documentele încărcate între 06 și 16.09.2026. 78% dintre documente purtau un avertisment, iar
 * majoritatea avertismentelor erau false. Fiecare test de mai jos e o pereche reală.
 */
import { describe, it, expect } from "vitest";
import { foldName, identityTokens, isAcronymOf, partyAliases, sameParty } from "../sameParty";

describe("foldName", () => {
  it("pliază diacriticele românești, inclusiv virgula dedesubt", () => {
    expect(foldName("Barbaroş Oxana")).toBe("barbaros oxana");
    expect(foldName("Barbaroș Oxana")).toBe("barbaros oxana");
    expect(foldName("ASOCIAŢIA NAŢIONALĂ")).toBe("asociatia nationala");
  });

  it("scoate punctuația și ghilimelele de orice fel", () => {
    expect(foldName('FIRMA "BONS OFFICES" S.R.L.')).toBe("firma bons offices s r l");
    expect(foldName("BC „MAIB” S.A.")).toBe("bc maib s a");
  });
});

describe("identityTokens", () => {
  it("scoate formele juridice și păstrează ce identifică", () => {
    expect(identityTokens('Societatea cu Răspundere Limitată "VECTOR ACADEMY"')).toEqual([
      "vector",
      "academy",
    ]);
  });
});

describe("sameParty — perechile care au produs alarme false pe producție", () => {
  const cases: Array<[string, string, string]> = [
    ["BARBAROS OXANA", "Barbaroş Oxana", "diacritica ş/s pe actul de predare-primire"],
    ["BORDEI VIORICA", "Viorica Bordei", "ordinea nume/prenume"],
    ["Deea House SRL", "DEEA HOUSE S.R.L.", "forma juridică scrisă altfel"],
    ["Deea House SRL", "DEA HOUSE", "o literă pierdută la scanare"],
    ['BC "MOLDINDCONBANK" S.A', "MOLDINDCONBANK", "banca fără forma juridică"],
    ['BC "MOLDINDCONBANK" S.A', "Moldindconbank", "banca cu altă capitalizare"],
    [
      "ASOCIAŢIA NATIONALĂ A COMPANIILOR DIN DOMENIUL TIC (ATIC)",
      "ATIC",
      "acronimul scris chiar pe document, în paranteze",
    ],
    [
      "Asociatia Nationala a Companiilor din Domeniul Tehnologiilor",
      "ASOCIAȚIA NAȚIONALĂ A COMPANIILOR DIN DOMENIUL TEHNOLOGIILOR INFORMAȚIONALE",
      "denumirea trunchiată de extractor",
    ],
  ];
  it.each(cases)("%s ≡ %s (%s)", (a, b, _why) => {
    expect(sameParty(a, b)).toBe(true);
  });
});

describe("sameParty — nepotrivirile care TREBUIE să rămână", () => {
  const cases: Array<[string, string, string]> = [
    [
      'Societatea cu Răspundere Limitată "VECTOR ACADEMY"',
      "Societatea cu Răspundere Limitată NEW TRADE",
      "două firme diferite care împart doar forma juridică",
    ],
    ["Centrul de Resurse Juridice", "Societatea cu Răspundere Limitată NEW TRADE", "alt beneficiar"],
    ["VECTOR ACADEMY S.R.L.", "BARBAROS OXANA", "firmă vs persoană"],
    ["CHIRITA ANA", "Mailchimp", "comerciantul de pe chitanță nu e persoana rambursată"],
    ["ATIC", "Mariana Alexei", "un participant la workshop nu e organizația"],
  ];
  it.each(cases)("%s ≠ %s (%s)", (a, b, _why) => {
    expect(sameParty(a, b)).toBe(false);
  });
});

describe("sameParty — ce nu se poate ști rămâne neverificat", () => {
  it("un nume fără niciun cuvânt identificator întoarce null, nu false", () => {
    // „card ATIC" e o metodă de plată scrisă în câmpul de beneficiar; „SRL" singur nu spune nimic.
    expect(sameParty("SRL", "DEEA HOUSE S.R.L.")).toBeNull();
    expect(sameParty(null, "Oricine")).toBeNull();
    expect(sameParty("", "  ")).toBeNull();
  });
});

describe("sameParty cu aliasuri declarate pe organizație", () => {
  const atic = {
    name: "ATIC",
    legalName: "ATIC",
    aliases:
      "Asociația Obștească Asociația Națională a Companiilor din Domeniul Tehnologiilor Informaționale și al Comunicațiilor, Asociația Națională a Companiilor din Domeniul TIC",
  };

  it("recunoaște denumirea completă pe care inițialele NU o dau", () => {
    const aliases = partyAliases(atic);
    const peDocument =
      "Asociația Obștească Asociația Națională a Companiilor din Domeniul Tehnologiilor Informaționale și al Comunicațiilor";
    // Fără aliasuri, acronimul „ATIC" nu se deduce din această formă — de asta există câmpul.
    expect(sameParty("ATIC", peDocument)).toBe(false);
    expect(sameParty("ATIC", peDocument, { aliases })).toBe(true);
  });

  it("aliasurile nu fac din orice nume o potrivire", () => {
    const aliases = partyAliases(atic);
    expect(sameParty("ATIC", "Societatea cu Răspundere Limitată NEW TRADE", { aliases })).toBe(false);
    expect(sameParty("ATIC", "Mariana Alexei", { aliases })).toBe(false);
  });

  it("partyAliases adună denumirea scurtă, cea juridică și lista scrisă de admin", () => {
    expect(partyAliases({ name: "ATIC", legalName: null, aliases: "A.N.C.D.T.I.C.;  ANCTIC " })).toEqual([
      "ATIC",
      "A.N.C.D.T.I.C.",
      "ANCTIC",
    ]);
    expect(partyAliases(null)).toEqual([]);
  });
});

describe("isAcronymOf", () => {
  it("acceptă acronimul scris pe document și inițialele consecutive", () => {
    expect(isAcronymOf("ATIC", "ASOCIAȚIA NATIONALĂ A COMPANIILOR DIN DOMENIUL TIC (ATIC)")).toBe(true);
    expect(isAcronymOf("TIC", "Domeniul TIC")).toBe(true);
    expect(isAcronymOf("CRJ", "Centrul de Resurse Juridice")).toBe(true);
  });

  it("refuză un nume întreg drept acronim", () => {
    expect(isAcronymOf("Mariana Alexei", "Asociația Națională a Companiilor")).toBe(false);
    expect(isAcronymOf("ATIC", "ATIC")).toBe(false); // un singur cuvânt nu are inițiale
  });

  /**
   * Limita, scrisă ca test ca să nu fie redescoperită: „ATIC" vine din „…Tehnologiei Informației
   * și Comunicațiilor", nu din inițialele cuvintelor în ordine. Nicio euristică de șiruri nu-l
   * deduce fără să accepte și potriviri false — de asta organizația are câmp de aliasuri.
   */
  it("NU deduce un acronim care nu e din inițiale consecutive", () => {
    expect(isAcronymOf("ATIC", "Asociația Națională a Companiilor din Domeniul TIC")).toBe(false);
  });
});
