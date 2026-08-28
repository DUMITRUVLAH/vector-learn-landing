/**
 * Rule C — „PLĂTITOR:" singur pe rând aparține rândului URMĂTOR, nu primei companii de dedesubt.
 *
 * Bug-ul raportat de owner (2026-08-28): pe contul de plată ZBOR.MD nr. 68339 vânzătorul e tipărit
 * doar în ANTET (fără cuvântul „Furnizor"), iar cumpărătorul apare ca „PLĂTITOR:" urmat de „ATIC"
 * pe rândul următor. Proximitatea lipea eticheta de firma din antet → singura parte plătibilă ieșea
 * `client` + `isPayerHint`, era scoasă din pool și formularul se completa cu NIMIC.
 */
import { describe, it, expect } from "vitest";

import { parsePartiesFromText } from "../stubPartyParser";
import { choosePayee } from "../choosePayee";

const CONT_DE_PLATA_ZBOR = `CONT DE PLATĂ
nr. 68339 din 25 Aug 2026
PLĂTITOR:
ATIC
S.C. "Explor Tur" S.R.L.
str. 31 August 1989, 64
Chişinău, MD-2001, R. Moldova
Cod fiscal: 1012600013482
Date Bancare:
B.C."VICTORIABANK"S.A. fil.nr.26 Chisinau,
Cod bancar: VICBMD2X469
Cont: IBAN MD61VI000000222432697MDL
Total factura în litere: douazeci si trei de mii patruzeci si doi lei 00 bani`;

describe("Rule C — eticheta de plătitor singură pe rând", () => {
  it("[blocant] nu marchează drept plătitor firma din antet, ci rândul de sub „PLĂTITOR:”", () => {
    const ext = parsePartiesFromText(CONT_DE_PLATA_ZBOR);
    const seller = ext.parties.find((p) => /Explor Tur/i.test(p.name));
    expect(seller).toBeDefined();
    expect(seller?.isPayerHint).toBeFalsy();
    expect(seller?.role).not.toBe("client");

    const payer = ext.parties.find((p) => p.name === "ATIC");
    expect(payer?.role).toBe("client");
    expect(payer?.isPayerHint).toBe(true);
  });

  it("[blocant] beneficiarul propus e vânzătorul, cu IDNO + IBAN + sumă din document", () => {
    const choice = choosePayee({ ...parsePartiesFromText(CONT_DE_PLATA_ZBOR), isStub: true }, null);
    expect(choice.payee?.name).toMatch(/Explor Tur/i);
    expect(choice.payee?.idno).toBe("1012600013482");
    expect(choice.payee?.iban).toBe("MD61VI000000222432697MDL");
    expect(choice.amountCents).toBe(2_304_200);
  });

  it("ambele părți ajung în lista de grupuri, cu plătitorul marcat `isPayer`", () => {
    const choice = choosePayee({ ...parsePartiesFromText(CONT_DE_PLATA_ZBOR), isStub: true }, null);
    const names = choice.options.map((o) => o.name);
    expect(names).toContain("ATIC");
    expect(choice.options.find((o) => o.name === "ATIC")?.isPayer).toBe(true);
    expect(choice.options.find((o) => /Explor Tur/i.test(o.name))?.recommended).toBe(true);
  });

  it("layout-ul clasic „Plătitor:” + companie pe rândul următor rămâne neschimbat (compania E plătitorul)", () => {
    const doc = `FACTURĂ nr. 5
Furnizor: S.R.L. "MIXBOOK", IDNO 1015600011223
c/d MD87MO2224ASV12345678901 în BC "Mobiasbanca" S.A.
Plătitor:
VECTOR ACADEMY S.R.L.
Total de plată: 3250,00 lei`;
    const ext = parsePartiesFromText(doc);
    const buyer = ext.parties.find((p) => /VECTOR ACADEMY/i.test(p.name));
    expect(buyer?.role).toBe("client");
    expect(buyer?.isPayerHint).toBe(true);

    const choice = choosePayee({ ...ext, isStub: true }, null);
    expect(choice.payee?.name).toMatch(/MIXBOOK/i);
  });

  it("un rând care nu e nume (adresă, cod, altă etichetă) nu devine parte", () => {
    const doc = `CONT DE PLATĂ
PLĂTITOR:
str. Mihai Eminescu 45, mun. Chişinău
S.R.L. "ALFA", IDNO 1015600011223
Cont: IBAN MD87MO2224ASV12345678901
Total de plată: 1000,00 lei`;
    const ext = parsePartiesFromText(doc);
    expect(ext.parties.some((p) => /Eminescu/i.test(p.name))).toBe(false);
  });
});
