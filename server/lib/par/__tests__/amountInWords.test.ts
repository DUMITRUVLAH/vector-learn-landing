/**
 * „Total factura în litere: …" — sursa legală de adevăr pentru sumă.
 *
 * Regresia pe care o încuie: contul de plată ZBOR.MD nr. 68339 (2026-08-28) avea totalul 23 042 lei
 * pe un rând, iar eticheta „TOTAL" pe altul (ordinea rândurilor dintr-un PDF se amestecă). Parserul
 * determinist nu găsea nicio sumă, iar modelul a citit 23 442 lei — 400 de lei în plus pe o cerere
 * de plată reală. Litera nu se poate rupe de valoare, deci o citim din ea.
 */
import { describe, it, expect } from "vitest";

import { parseAmountInWords, wordsToNumber } from "../amountInWords";

describe("parseAmountInWords", () => {
  it("[blocant] documentul owner-ului: „douazeci si trei de mii patruzeci si doi lei 00 bani” → 23 042,00", () => {
    const r = parseAmountInWords(
      "Total factura în litere: douazeci si trei de mii patruzeci si doi lei 00 bani",
    );
    expect(r?.cents).toBe(2_304_200);
    expect(r?.currency).toBe("MDL");
  });

  it.each([
    ["Suma în litere: cinci mii lei 00 bani", 500_000, "MDL"],
    ["Total în litere: patruzeci și cinci de mii lei 50 bani", 4_500_050, "MDL"],
    ["în litere: una mie două sute treizeci și patru lei 25 bani", 123_425, "MDL"],
    ["Total in litere: un milion două sute de mii lei", 120_000_000, "MDL"],
    ["Total în litere: nouă sute nouăzeci și nouă lei 99 bani", 99_999, "MDL"],
    ["Suma în litere: două mii patru sute euro 00 bani", 240_000, "EUR"],
    ["Total în litere: o mie de dolari", 100_000, "USD"],
    ["Total în litere: șaptesprezece mii lei", 1_700_000, "MDL"],
  ])("citește %s", (text, cents, currency) => {
    const r = parseAmountInWords(text as string);
    expect(r?.cents).toBe(cents);
    expect(r?.currency).toBe(currency);
  });

  it("diacriticele cu sedilă (PDF-uri vechi) nu schimbă rezultatul", () => {
    const cuSedila = parseAmountInWords("Total factura în litere: şaizeci şi cinci de mii lei 00 bani");
    expect(cuSedila?.cents).toBe(6_500_000);
  });

  it("întoarce null când documentul nu conține suma în litere", () => {
    expect(parseAmountInWords("Total de plată: 23042,00 lei")).toBeNull();
    expect(parseAmountInWords("")).toBeNull();
  });

  it("întoarce null când fraza „în litere” nu conține cuvinte-număr (nu inventăm o sumă)", () => {
    expect(parseAmountInWords("Total în litere: conform anexei nr. 2")).toBeNull();
  });

  it("banii peste 99 sunt ignorați (nu pot fi bani) în loc să umfle suma", () => {
    const r = parseAmountInWords("Total în litere: o mie lei 250 bani");
    expect(r?.cents).toBe(100_000);
  });

  it("wordsToNumber compune corect zeci/sute/mii/milioane", () => {
    expect(wordsToNumber(["douazeci", "si", "trei", "de", "mii", "patruzeci", "si", "doi"])).toBe(23_042);
    expect(wordsToNumber(["trei", "sute", "cincizeci"])).toBe(350);
    expect(wordsToNumber(["cuvant", "necunoscut"])).toBeNull();
  });
});
