import { describe, it, expect } from "vitest";
import { blankUnresolved, unresolvedFields, BLANK_LINE } from "../blanks";

describe("DC-103 — câmpurile necompletate", () => {
  it("[blocant] niciun tag nu supraviețuiește în document", () => {
    const out = blankUnresolved("<p>IBAN: {{contraparte.iban}}, cod {{ contraparte.idno }}</p>");
    expect(out).not.toContain("{{");
    expect(out).toBe(`<p>IBAN: ${BLANK_LINE}, cod ${BLANK_LINE}</p>`);
  });

  it("le enumeră o singură dată, în ordinea din act", () => {
    expect(
      unresolvedFields("<p>{{contraparte.denumire}} {{contraparte.iban}} {{contraparte.denumire}}</p>")
    ).toEqual(["contraparte.denumire", "contraparte.iban"]);
  });

  it("nu atinge textul obișnuit cu acolade simple", () => {
    const text = "<p>Suma { 100 } lei</p>";
    expect(blankUnresolved(text)).toBe(text);
    expect(unresolvedFields(text)).toEqual([]);
  });

  it("acceptă diacriticele din numele câmpurilor proprii", () => {
    expect(unresolvedFields("<p>{{acord.durată}}</p>")).toEqual(["acord.durată"]);
  });
});
