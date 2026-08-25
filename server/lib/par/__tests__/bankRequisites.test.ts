/**
 * Regresia pentru „tot e intro linie la tine" (Violeta, 2026-08-25).
 *
 * Rândul din registrul de beneficiari arăta așa în coloana „Bancă":
 *   BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.
 * adică banca + codul bancar + codul fiscal, toate într-un singur câmp. Testele de mai jos
 * pică pe codul vechi (care nu separa nimic) și trec pe cel nou.
 */
import { describe, it, expect } from "vitest";
import { splitBankRequisites, hasMergedBankRequisites } from "../bankRequisites";

describe("splitBankRequisites", () => {
  it("separă rândul real raportat de contabilă", () => {
    const raw = "BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.";
    expect(splitBankRequisites(raw)).toEqual({
      bank: "BC'MAIB'S.A. sucursala Stefan cel Mare",
      bankCode: "AGRNMD2X885",
      // 13 cifre = IDNO moldovenesc → cod fiscal, chiar dacă eticheta zice „c.f./ nr.TVA".
      fiscalCode: "1014600022332",
      vatCode: null,
      iban: null,
    });
  });

  it("separă eticheta explicită de cod bancar, cod fiscal și TVA", () => {
    const raw = 'BC "Moldindconbank" S.A., cod bancar MOLDMD2X322, c/f 1002600020555, nr. TVA 0301234';
    expect(splitBankRequisites(raw)).toEqual({
      bank: 'BC "Moldindconbank" S.A.',
      bankCode: "MOLDMD2X322",
      fiscalCode: "1002600020555",
      vatCode: "0301234",
      iban: null,
    });
  });

  it("taie eticheta „Banca:” și citește BIC-ul de 8 caractere", () => {
    const raw = 'Banca: BC "Energbank" S.A. fil. Chișinău; BIC: ENEGMD22';
    const parts = splitBankRequisites(raw);
    expect(parts.bank).toBe('BC "Energbank" S.A. fil. Chișinău');
    expect(parts.bankCode).toBe("ENEGMD22");
  });

  it("scoate IBAN-ul înghesuit în același câmp", () => {
    const parts = splitBankRequisites('BC "MAIB" S.A., IBAN MD24AG000000022512345678');
    expect(parts.bank).toBe('BC "MAIB" S.A.');
    expect(parts.iban).toBe("MD24AG000000022512345678");
  });

  it("nu strică un nume de bancă deja curat", () => {
    for (const clean of ['BC "Victoriabank" S.A.', "BC EXIMBANK S.A.", "Mobiasbanca — OTP Group"]) {
      expect(splitBankRequisites(clean)).toEqual({
        bank: clean,
        bankCode: null,
        fiscalCode: null,
        vatCode: null,
        iban: null,
      });
    }
  });

  it("nu confundă un cuvânt de 8 majuscule cu un BIC (fără cifre = nu e cod)", () => {
    // „EXIMBANK" are exact forma unui BIC de 8 caractere; cerința de cifră îl exclude.
    expect(splitBankRequisites("BC EXIMBANK S.A.").bankCode).toBeNull();
  });

  it("păstrează punctul formei juridice la tăiere", () => {
    expect(splitBankRequisites("BCR Chișinău S.A., cod bancar BCRLMD2X").bank).toBe(
      "BCR Chișinău S.A."
    );
  });

  it("e idempotentă — a doua rulare peste rezultat nu mai schimbă nimic", () => {
    const once = splitBankRequisites(
      "BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф."
    );
    expect(splitBankRequisites(once.bank)).toEqual({
      bank: once.bank,
      bankCode: null,
      fiscalCode: null,
      vatCode: null,
      iban: null,
    });
  });

  it("întoarce totul null pentru gol", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(splitBankRequisites(empty)).toEqual({
        bank: null,
        bankCode: null,
        fiscalCode: null,
        vatCode: null,
        iban: null,
      });
    }
  });

  it("citește IDNO etichetat cu OCR spațiat", () => {
    expect(splitBankRequisites("BC MAIB S.A., IDNO 1014 6000 22332").fiscalCode).toBe(
      "1014600022332"
    );
  });
});

describe("hasMergedBankRequisites", () => {
  it("recunoaște rândul care trebuie reparat", () => {
    expect(
      hasMergedBankRequisites(
        "BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф."
      )
    ).toBe(true);
  });

  it("lasă în pace un nume curat", () => {
    expect(hasMergedBankRequisites('BC "Victoriabank" S.A.')).toBe(false);
    expect(hasMergedBankRequisites(null)).toBe(false);
  });
});
