/**
 * @vitest-environment node
 *
 * DG-108 — suma în litere e partea din act pe care contabila o citește cel mai atent, iar în caz de
 * litigiu ea are prioritate față de cifre. Testele acoperă exact regulile pe care le greșește omul
 * grăbit: „de" înaintea substantivului, genul feminin la sute/mii, singularul la 1 leu.
 */
import { describe, it, expect } from "vitest";
import { amountToWordsRo, numberToWordsRo, needsDe } from "../amountToWords";

describe("DG-108 — numărul în litere", () => {
  it("[blocant] regula particulei de: 0 sau 20-99 la ultimele două cifre", () => {
    expect(needsDe(15)).toBe(false);
    expect(needsDe(19)).toBe(false);
    expect(needsDe(20)).toBe(true);
    expect(needsDe(100)).toBe(true);
    expect(needsDe(101)).toBe(false);
    expect(needsDe(24500)).toBe(true);
  });

  it("[blocant] genul feminin la sute și mii, nu doi mii", () => {
    expect(numberToWordsRo(2000)).toBe("două mii");
    expect(numberToWordsRo(200)).toBe("două sute");
    expect(numberToWordsRo(2)).toBe("doi");
    expect(numberToWordsRo(1000)).toBe("o mie");
    expect(numberToWordsRo(100)).toBe("o sută");
    expect(numberToWordsRo(12)).toBe("doisprezece");
    expect(numberToWordsRo(12000)).toBe("douăsprezece mii");
  });

  it("[blocant] compuneri reale de pe acte", () => {
    expect(numberToWordsRo(24500)).toBe("douăzeci și patru de mii cinci sute");
    expect(numberToWordsRo(1234)).toBe("o mie două sute treizeci și patru");
    expect(numberToWordsRo(101)).toBe("o sută unu");
    expect(numberToWordsRo(21000)).toBe("douăzeci și una de mii");
    expect(numberToWordsRo(1000000)).toBe("un milion");
    expect(numberToWordsRo(2000000)).toBe("două milioane");
    expect(numberToWordsRo(0)).toBe("zero");
  });
});

describe("DG-108 — suma cu valută", () => {
  it("[blocant] forma folosită pe actele din Moldova", () => {
    expect(amountToWordsRo(2450000)).toBe(
      "douăzeci și patru de mii cinci sute de lei 00 bani"
    );
    expect(amountToWordsRo(150050)).toBe("o mie cinci sute de lei 50 bani");
  });

  it("[blocant] singularul la un leu", () => {
    expect(amountToWordsRo(100)).toBe("un leu 00 bani");
    // …dar compusul își păstrează forma corectă:
    expect(amountToWordsRo(2100)).toBe("douăzeci și unu de lei 00 bani");
    expect(amountToWordsRo(200)).toBe("doi lei 00 bani");
    expect(amountToWordsRo(1500)).toBe("cincisprezece lei 00 bani");
  });

  it("[blocant] alte valute își păstrează substantivul", () => {
    expect(amountToWordsRo(2450000, { currency: "EUR" })).toContain("euro");
    expect(amountToWordsRo(2450000, { currency: "USD" })).toContain("dolari");
  });

  it("[normal] banii se scriu cu două cifre, chiar și zero", () => {
    expect(amountToWordsRo(500)).toContain("00 bani");
    expect(amountToWordsRo(505)).toContain("05 bani");
  });
});
