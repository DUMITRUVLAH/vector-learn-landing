/**
 * Numele fișierului salvat vine de la server, nu din browser.
 *
 * Regresia pe care o apără: dosarul își primește numele pe server (beneficiar, proiect, ordin de
 * plată, data plății), iar clientul îl rescria `Dosar_PAR_<nr>.pdf` — același PDF ajungea pe disc
 * cu alt nume decât în Google Drive.
 */
import { describe, it, expect } from "vitest";

import { fileNameFromDisposition } from "../downloadName";

const FALLBACK = "Dosar_PAR-2026-0045.pdf";

describe("fileNameFromDisposition", () => {
  it("[blocant] ia numele complet din filename*, cu diacritice cu tot", () => {
    const header =
      "attachment; filename=\"Dosar_PAR-2026-0045_ASOCIATIA.pdf\"; filename*=UTF-8''Dosar_PAR-2026-0045_ASOCIA%C8%9AIA.pdf";
    expect(fileNameFromDisposition(header, FALLBACK)).toBe("Dosar_PAR-2026-0045_ASOCIAȚIA.pdf");
  });

  it("cade pe varianta ASCII când filename* lipsește", () => {
    expect(fileNameFromDisposition('attachment; filename="Dosare_PAR_2026-09-18.zip"', FALLBACK)).toBe(
      "Dosare_PAR_2026-09-18.zip",
    );
  });

  it("acceptă și forma fără ghilimele", () => {
    expect(fileNameFromDisposition("attachment; filename=dosar.pdf", FALLBACK)).toBe("dosar.pdf");
  });

  it("antet lipsă, gol sau stricat → numele de rezervă, niciodată gol", () => {
    expect(fileNameFromDisposition(null, FALLBACK)).toBe(FALLBACK);
    expect(fileNameFromDisposition("", FALLBACK)).toBe(FALLBACK);
    expect(fileNameFromDisposition("attachment", FALLBACK)).toBe(FALLBACK);
    // `%E0%A4%A` e o secvență incompletă — `decodeURIComponent` aruncă.
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A", FALLBACK)).toBe(FALLBACK);
  });
});
