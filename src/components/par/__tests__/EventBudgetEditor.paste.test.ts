/**
 * VM5-20 — lipirea bugetului din Excel.
 *
 * Bugetele de eveniment trăiesc în foi de calcul. Dacă singura cale de a le pune în aplicație e
 * retastarea linie cu linie, nu ajung acolo niciodată — de aceea tabelul acceptă `Ctrl+V`.
 *
 * Riscul pe care îl acoperă testele: scrierea numerelor. „12.500,50" (european) și „12,500.50"
 * (anglo-saxon) arată aproape la fel, iar o citire greșită face din 12.500 lei 12 lei și jumătate —
 * genul de eroare care trece neobservată tocmai fiindcă bugetul „pare" încărcat.
 */
import { describe, it, expect } from "vitest";
import { parsePastedBudget } from "../EventBudgetEditor";

describe("parsePastedBudget()", () => {
  it("citește rânduri lipite din Excel (TAB între coloane)", () => {
    const rows = parsePastedBudget("6.1\t12500\tMDL\n6.2\t4000\tEUR");
    expect(rows).toEqual([
      { code: "6.1", amountCents: 1_250_000, currency: "MDL" },
      { code: "6.2", amountCents: 400_000, currency: "EUR" },
    ]);
  });

  it("acceptă și punct-și-virgulă, cum exportă unele foi", () => {
    expect(parsePastedBudget("Catering;3000;MDL")).toEqual([
      { code: "Catering", amountCents: 300_000, currency: "MDL" },
    ]);
  });

  it("citește corect scrierea europeană: 12.500,50 = douăsprezece mii cinci sute", () => {
    expect(parsePastedBudget("6.1\t12.500,50\tMDL")[0].amountCents).toBe(1_250_050);
  });

  it("citește corect și scrierea anglo-saxonă: 12,500.50", () => {
    expect(parsePastedBudget("6.1\t12,500.50\tMDL")[0].amountCents).toBe(1_250_050);
  });

  it("nu se încurcă în spațiile de mii", () => {
    expect(parsePastedBudget("6.1\t12 500\tMDL")[0].amountCents).toBe(1_250_000);
  });

  it("fără monedă, presupune lei", () => {
    expect(parsePastedBudget("6.1\t900")[0].currency).toBe("MDL");
  });

  it("o monedă necunoscută nu strică linia — rămâne în lei", () => {
    expect(parsePastedBudget("6.1\t900\tXYZ")[0].currency).toBe("MDL");
  });

  it("sare peste rândurile care nu sunt buget (antet, gol, o singură coloană)", () => {
    const rows = parsePastedBudget("Cod\tSuma\tMoneda\n\n6.1\t100\tMDL\nsimplu-text");
    // Antetul are „Suma" în loc de un număr, deci cade singur.
    expect(rows).toEqual([{ code: "6.1", amountCents: 10_000, currency: "MDL" }]);
  });

  it("un text lipit fără structură nu produce linii", () => {
    expect(parsePastedBudget("")).toEqual([]);
    expect(parsePastedBudget("doar niște cuvinte")).toEqual([]);
  });
});
