/**
 * VM5-04 — „plătitorul e altul".
 *
 * Cazul care a cerut funcția: workspace cu două entități (ATIC și ATIC — Digital Safeguard). Omul
 * atașează factura emisă pe firma-soră, iar reconcilierea o declara „Concordant", pentru că
 * verifica doar beneficiarul. Testele apără și reversul: alarmele false sunt mai scumpe decât
 * lipsa verificării, fiindcă învață oamenii să apese „aprob" fără să citească.
 */
import { describe, it, expect } from "vitest";
import { checkPayerOnDocument } from "../payerOnDocument";

const ATIC = { name: "ATIC", legalName: "Asociația Națională ATIC", idno: "1234567890123", iban: "MD24AG000225100013104168" };
const beneficiar = { name: "Prestator Bun SRL", idno: "9876543210987" };

describe("checkPayerOnDocument()", () => {
  it("confirmă când documentul numește chiar entitatea plătitoare", () => {
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: 'A.N. "ATIC"', idno: "1234567890123" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBe(true);
  });

  it("semnalează factura emisă pe altă entitate", () => {
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: "Digital Safeguard SRL", idno: "5555555555555" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBe(false);
    expect(r.found).toBe("Digital Safeguard SRL");
  });

  it("recunoaște entitatea după denumire, chiar dacă IDNO nu e pe document", () => {
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: "Asociatia Nationala ATIC" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBe(true);
  });

  it("recunoaște entitatea după IBAN-ul propriu", () => {
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: "Plătitor necunoscut", iban: "MD24 AG00 0225 1000 1310 4168" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBe(true);
  });

  it("nu se pronunță pe un document cu o singură parte", () => {
    const r = checkPayerOnDocument([{ name: "Prestator Bun SRL", idno: "9876543210987" }], ATIC, beneficiar);
    expect(r.matches).toBeNull();
  });

  it("nu se pronunță când cererea n-are entitate plătitoare configurată", () => {
    const r = checkPayerOnDocument(
      [{ name: "A" }, { name: "B" }],
      { name: null, legalName: null, idno: null, iban: null },
      beneficiar
    );
    expect(r.matches).toBeNull();
  });

  it("nu confirmă plătitorul folosind chiar beneficiarul cererii", () => {
    // Ambele părți sunt beneficiarul (document care se repetă): nu există latură plătitoare.
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: "Prestator Bun SRL", idno: "9876543210987" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBeNull();
  });

  it("ignoră diferențele de formă juridică și punctuație din denumire", () => {
    const r = checkPayerOnDocument(
      [{ name: "Prestator Bun SRL", idno: "9876543210987" }, { name: "A.N. ATIC" }],
      ATIC,
      beneficiar
    );
    expect(r.matches).toBe(true);
  });
});
