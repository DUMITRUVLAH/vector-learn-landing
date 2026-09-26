/**
 * @vitest-environment node
 * CP-02 — numerotarea automată a contului de plată, cu suprascriere manuală.
 */
import { describe, it, expect } from "vitest";
import {
  firstFreeNumber,
  formatDocumentNumber,
  nextSequenceNumber,
  normalizePattern,
  parseManualNumber,
  type NumberingSettings,
} from "../numbering";

const S: NumberingSettings = { series: "CP", pattern: "{serie}-{an}-{nr}", pad: 4, start: 1 };

describe("numerotarea contului de plată", () => {
  it("[blocant] primul cont e CP-2026-0001, al doilea …0002", () => {
    expect(formatDocumentNumber(S, nextSequenceNumber([], 1), 2026)).toBe("CP-2026-0001");
    expect(formatDocumentNumber(S, nextSequenceNumber([1], 1), 2026)).toBe("CP-2026-0002");
  });

  it("[blocant] numărul de start (vii din alt program, erai la 278) → 279", () => {
    expect(nextSequenceNumber([], 279)).toBe(279);
    // Secvența deja trecută de start nu se dă înapoi.
    expect(nextSequenceNumber([300, null, 12], 279)).toBe(301);
  });

  it("[blocant] un număr luat de mână e sărit de secvența automată", () => {
    const taken = new Set(["CP-2026-0005"]);
    expect(firstFreeNumber(S, 5, 2026, taken)).toEqual({ number: 6, documentNumber: "CP-2026-0006" });
  });

  it("[blocant] numărul manual în forma șablonului intră în secvență; unul liber nu", () => {
    expect(parseManualNumber(S, "CP-2026-0300", 2026)).toBe(300);
    expect(parseManualNumber(S, "Avans-mai", 2026)).toBeNull();
    expect(parseManualNumber(S, "CP-2025-0300", 2026)).toBeNull();
  });

  it("[normal] șablon fără {nr} primește numărul la coadă; șablon gol = implicit", () => {
    expect(normalizePattern("FACT")).toBe("FACT-{nr}");
    expect(normalizePattern("")).toBe("{serie}-{an}-{nr}");
    expect(formatDocumentNumber({ ...S, pattern: "{nr}/{an}", pad: 3 }, 7, 2026)).toBe("007/2026");
  });

  it("[normal] seria cu caractere speciale nu strică recunoașterea numărului manual", () => {
    const s = { ...S, series: "V.L+" };
    expect(parseManualNumber(s, "V.L+-2026-0042", 2026)).toBe(42);
    expect(parseManualNumber(s, "VxL+-2026-0042", 2026)).toBeNull();
  });
});
