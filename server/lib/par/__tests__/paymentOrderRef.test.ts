/**
 * Numărul ordinului de plată, citit din documentul de la bancă.
 *
 * Formele de aici sunt cele care ajung în „Dovezi de plată": confirmarea PDF a băncii (MAIB,
 * Victoriabank), formularul tipizat BNM, versiunea rusă și un extras cu mai multe operațiuni —
 * ultimul e testul care contează cel mai mult, fiindcă acolo parserul TREBUIE să tacă.
 */
import { describe, it, expect } from "vitest";

import { parsePaymentOrderRef } from "../documentRef";

describe("parsePaymentOrderRef", () => {
  it("titlul poartă numărul și data pe același rând", () => {
    expect(parsePaymentOrderRef("ORDIN DE PLATĂ Nr. 2065 din 18.09.2026")).toEqual({
      number: "2065",
      date: "2026-09-18",
    });
  });

  it("PDF cu rândurile rupte: numărul cade pe rândul de sub titlu", () => {
    const text = [
      "BC «MAIB» S.A.",
      "ORDIN DE PLATĂ",
      "nr. 2065 din 18.09.2026",
      "Plătitor: ASOCIAȚIA OBȘTEASCĂ ATIC",
    ].join("\n");
    expect(parsePaymentOrderRef(text)).toEqual({ number: "2065", date: "2026-09-18" });
  });

  it("confirmare fără titlu pe rând propriu: eticheta «Nr. documentului»", () => {
    const text = [
      "Confirmare de plată",
      "Nr. documentului: 2065",
      "Data executării: 18.09.2026",
      "Suma: 1 430,00 MDL",
    ].join("\n");
    expect(parsePaymentOrderRef(text)).toEqual({ number: "2065", date: "2026-09-18" });
  });

  it("formularul în rusă", () => {
    const text = ["ПЛАТЕЖНОЕ ПОРУЧЕНИЕ № 2065", "Дата документа: 18.09.2026"].join("\n");
    expect(parsePaymentOrderRef(text)).toEqual({ number: "2065", date: "2026-09-18" });
  });

  it("numărul cu literă (OP-47) își păstrează majusculele", () => {
    expect(parsePaymentOrderRef("Ordin de plată nr. OP-47 din 15.09.2026")?.number).toBe("OP-47");
  });

  it("extras de cont cu mai multe operațiuni: nu ghicește care rând e al cererii", () => {
    const text = [
      "EXTRAS DE CONT 18.09.2026",
      "Nr. documentului 2065 SMART VIT SERVICE SRL 1 430,00",
      "Nr. documentului 2064 ORANGE MOLDOVA SA 242,25",
      "Nr. documentului 2063 ORANGE MOLDOVA SA 213,00",
    ].join("\n");
    expect(parsePaymentOrderRef(text)?.number ?? null).toBeNull();
  });

  it("document fără număr și fără dată → null", () => {
    expect(parsePaymentOrderRef("Ordin de plată către furnizor")).toBeNull();
    expect(parsePaymentOrderRef("")).toBeNull();
    expect(parsePaymentOrderRef(null)).toBeNull();
  });

  it("nu ia data drept număr", () => {
    expect(parsePaymentOrderRef("ORDIN DE PLATĂ din 18.09.2026")).toEqual({
      number: null,
      date: "2026-09-18",
    });
  });
});
