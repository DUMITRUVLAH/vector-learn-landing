/**
 * zi.lună.an — owner (2026-09-23): „formatul la dată nu e comod, acum e luna, ziua, anul".
 * Cauza: `<input type="date">` urmează limba browserului, deci pe un Chrome în engleză (SUA)
 * data se citea 01/13/2027. Testele fixează citirea și afișarea în ordinea românească.
 */
import { describe, it, expect } from "vitest";
import { formatDayDate, parseDayDate, shapeDayDate } from "../dayDate";

describe("parseDayDate", () => {
  it("[blocant] citește ziua ÎNAINTEA lunii: 13.01.2027 e 13 ianuarie, nu luna 13", () => {
    expect(parseDayDate("13.01.2027")).toBe("2027-01-13");
    expect(parseDayDate("01.02.2027")).toBe("2027-02-01");
  });

  it("acceptă slash, cratimă, cifre simple și ISO lipit", () => {
    expect(parseDayDate("13/01/2027")).toBe("2027-01-13");
    expect(parseDayDate("13-01-2027")).toBe("2027-01-13");
    expect(parseDayDate("1.2.2027")).toBe("2027-02-01");
    expect(parseDayDate(" 2027-01-13 ")).toBe("2027-01-13");
  });

  it("[blocant] refuză datele care nu există, nu le mută în luna următoare", () => {
    expect(parseDayDate("31.02.2027")).toBeNull();
    expect(parseDayDate("29.02.2027")).toBeNull();
    expect(parseDayDate("29.02.2028")).toBe("2028-02-29");
    expect(parseDayDate("01.13.2027")).toBeNull();
  });

  it("un an neterminat nu e încă o dată (altfel „13.01.20” ar fi anul 20)", () => {
    expect(parseDayDate("13.01.20")).toBeNull();
    expect(parseDayDate("13.01.202")).toBeNull();
    expect(parseDayDate("13.0")).toBeNull();
    expect(parseDayDate("")).toBeNull();
  });
});

describe("formatDayDate", () => {
  it("ISO → zi.lună.an, și din timestamp întreg", () => {
    expect(formatDayDate("2027-01-13")).toBe("13.01.2027");
    expect(formatDayDate("2027-01-13T00:00:00.000Z")).toBe("13.01.2027");
  });

  it("gol sau nerecunoscut → text gol, nu „undefined”", () => {
    expect(formatDayDate("")).toBe("");
    expect(formatDayDate(null)).toBe("");
    expect(formatDayDate("mâine")).toBe("");
  });
});

describe("shapeDayDate", () => {
  it("pune punctele singur pe măsură ce tastezi cifre", () => {
    expect(shapeDayDate("1")).toBe("1");
    expect(shapeDayDate("13")).toBe("13");
    expect(shapeDayDate("130")).toBe("13.0");
    expect(shapeDayDate("13.012")).toBe("13.01.2");
    expect(shapeDayDate("13012027")).toBe("13.01.2027");
  });

  it("păstrează punctul tastat de om după zi și lună, și normalizează slash-ul", () => {
    expect(shapeDayDate("13.")).toBe("13.");
    expect(shapeDayDate("13/01/")).toBe("13.01.");
    expect(shapeDayDate("13/01/2027")).toBe("13.01.2027");
  });

  it("nu strică ce nu seamănă cu tiparul lui: 1.2.2027 și ISO rămân cum sunt", () => {
    expect(shapeDayDate("1.2.2027")).toBe("1.2.2027");
    expect(shapeDayDate("2027-01-13")).toBe("2027-01-13");
  });

  it("taie cifrele în plus după an", () => {
    expect(shapeDayDate("13.01.20271")).toBe("13.01.2027");
  });
});
