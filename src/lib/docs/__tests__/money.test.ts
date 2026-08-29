/**
 * Bugul prins de sweep-ul UX: „2.000,00" era citit ca 2 lei.
 *
 * Consecința nu era cosmetică — deschideai un act salvat, îl salvai din nou și prețul se împărțea
 * la o mie. Testul cel mai important e round-trip-ul: ce afișăm trebuie să putem citi înapoi.
 */
import { describe, it, expect } from "vitest";
import { parseMoneyRo, formatMoneyRo } from "../money";

describe("citirea sumelor scrise de om", () => {
  it("[blocant] formatul românesc complet: punct la mii, virgulă la zecimale", () => {
    expect(parseMoneyRo("2.000,00")).toBe(200000);
    expect(parseMoneyRo("24.500,50")).toBe(2450050);
    expect(parseMoneyRo("1.234.567,89")).toBe(123456789);
  });

  it("[blocant] doar virgulă = zecimală", () => {
    expect(parseMoneyRo("1234,56")).toBe(123456);
    expect(parseMoneyRo("12,5")).toBe(1250);
  });

  it("[blocant] doar puncte, în tipar de mii = separatori de mii", () => {
    expect(parseMoneyRo("2.000")).toBe(200000);
    expect(parseMoneyRo("1.234.567")).toBe(123456700);
  });

  it("[blocant] punct zecimal (stil englez) rămâne zecimal", () => {
    expect(parseMoneyRo("1234.56")).toBe(123456);
    expect(parseMoneyRo("12.5")).toBe(1250);
  });

  it("[blocant] round-trip: ce afișăm putem citi înapoi", () => {
    for (const cents of [1, 250, 200000, 2450050, 123456789]) {
      expect(parseMoneyRo(formatMoneyRo(cents)), `round-trip pentru ${cents}`).toBe(cents);
    }
  });

  it("[normal] gunoiul devine zero, nu NaN", () => {
    expect(parseMoneyRo("")).toBe(0);
    expect(parseMoneyRo("abc")).toBe(0);
    expect(parseMoneyRo("  ")).toBe(0);
  });

  it("[normal] numerele simple și spațiile ca separator de mii", () => {
    expect(parseMoneyRo("2000")).toBe(200000);
    expect(parseMoneyRo("24 500,00")).toBe(2450000);
  });
});
