import { describe, expect, it } from "vitest";
import {
  amountLooksLikeIdentifier,
  isValidMdFiscalCode,
  moneyTokensWithDecimals,
  restoreDroppedDecimals,
} from "../amountSanity";

// Fragmente din actele reale ATIC rejucate prin extractor pe 24.09.2026 (vezi amountSanity.ts).
const NEWS_MAKER = `FACTURĂ FISCALĂ Seria, Nr.
НАЛОГОВАЯ НАКЛАДНАЯ Серия, № EBK000758854
Data eliberării /data livrării 31.07.2026 / 31.07.2026
1. Furnizor: S.R.L. "NEWS MAKER" c.f./ nr.TVA 1014600022332 /
2. Cumpărător/beneficiar: Asociatia Nationala a Companiilor din Domeniul Tehnologiilor c.f./ nr.TVA 1006600034927 /
12. TOTAL (pe factura fiscală) / Всего (по налоговой накладной) 1257,09 X 251,42 1508,51 X X X 0,00`;

const AGEPI = `modificari marca 29598 lei 1 602.84 602,84 - 0,00 602,84
Reinnoire marca 29598 lei 1 9042.57 9042,57 - 0,00 9042,57
12. TOTAL (pe factura fiscală) / Всего (по налоговой накладной) 9645,41 X 0,00 9645,41`;

const MOLDCELL = `Extras din cont
ASOCIATIA OBSTEASCA ASOCIATIA NATIONALA A COMPANIILOR DIN DOMENIUL TEHNOLOGIILOR INFORMATIONALE SI AL COMUNICATIILOR
Plata de abonament bold 2687.51
TOTAL 2729.18 4977.48
Cod fiscal 1006600034927`;

const FIRST_AUDIT = `12. TOTAL (pe factura fiscală) / Всего (по налоговой накладной) 70000,00 X 0,00 70000,00`;

describe("moneyTokensWithDecimals", () => {
  it("citește formele de pe actele din RM, inclusiv separatorul de mii", () => {
    expect(moneyTokensWithDecimals("1 508,51 și 9,645.41 și 1.136,36")).toEqual([150851, 964541, 113636]);
  });
});

describe("restoreDroppedDecimals — banii tăiați de model", () => {
  it("1508 → 1508,51 (factura NEWS MAKER)", () => {
    expect(restoreDroppedDecimals(150800, NEWS_MAKER)).toBe(150851);
  });
  it("rândurile AGEPI: 602 → 602,84 și 9042 → 9042,57; totalul 9645 → 9645,41", () => {
    expect(restoreDroppedDecimals(60200, AGEPI)).toBe(60284);
    expect(restoreDroppedDecimals(904200, AGEPI)).toBe(904257);
    expect(restoreDroppedDecimals(964500, AGEPI)).toBe(964541);
  });
  it("nu atinge o sumă scrisă chiar „,00” pe document", () => {
    expect(restoreDroppedDecimals(7000000, FIRST_AUDIT)).toBe(7000000);
  });
  it("nu ghicește când documentul are două variante cu bani diferiți", () => {
    expect(restoreDroppedDecimals(50000, "Avans 500,25 · Rest 500,75")).toBe(50000);
  });
  it("lasă neatinse sumele care au deja bani, null-ul și textul gol", () => {
    expect(restoreDroppedDecimals(150851, NEWS_MAKER)).toBe(150851);
    expect(restoreDroppedDecimals(null, NEWS_MAKER)).toBeNull();
    expect(restoreDroppedDecimals(150800, "")).toBe(150800);
  });
});

describe("amountLooksLikeIdentifier — un număr de pe act citit ca sumă", () => {
  it("codul fiscal ATIC întors ca total pe extrasul Moldcell", () => {
    expect(amountLooksLikeIdentifier(100660003492700, MOLDCELL)).toBe(true);
  });
  it("numărul facturii EBK000758854 întors ca 758 854,00 lei", () => {
    expect(amountLooksLikeIdentifier(75885400, NEWS_MAKER)).toBe(true);
  });
  it("codul sau contul unei părți", () => {
    expect(amountLooksLikeIdentifier(2251309137500, "cont 22513091375", ["22513091375"])).toBe(true);
  });
  it("o sumă rotundă scrisă pe document rămâne sumă", () => {
    expect(amountLooksLikeIdentifier(7000000, FIRST_AUDIT)).toBe(false);
    expect(amountLooksLikeIdentifier(2304200, "TOTAL 23042\nTotal factura în litere: douazeci si trei de mii patruzeci si doi lei 00 bani")).toBe(false);
  });
  it("fără text nu acuză nimic (act scanat)", () => {
    expect(amountLooksLikeIdentifier(75885400, "")).toBe(false);
  });
});

describe("isValidMdFiscalCode — cifra de control IDNO/IDNP", () => {
  it("acceptă codurile reale valide", () => {
    for (const code of ["1006600034927", "1014600006741", "2002500149379", "1014600022332"]) {
      expect(isValidMdFiscalCode(code)).toBe(true);
    }
  });
  it("respinge greșelile de o cifră găsite în dosarele ATIC", () => {
    // Deea House: cererea avea 1014600000674, factura 1014600006741.
    expect(isValidMdFiscalCode("1014600000674")).toBe(false);
    // Actul Bulbaș: rubrica de semnături avea 2002500149479, corpul actului 2002500149379.
    expect(isValidMdFiscalCode("2002500149479")).toBe(false);
  });
  it("respinge ce nu are 13 cifre", () => {
    expect(isValidMdFiscalCode("48410210022")).toBe(false);
    expect(isValidMdFiscalCode(null)).toBe(false);
  });
});
