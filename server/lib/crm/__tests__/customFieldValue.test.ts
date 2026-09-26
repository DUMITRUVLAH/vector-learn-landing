/**
 * @vitest-environment node
 *
 * Valoarea unui câmp personalizat se validează după tip: un „Buget" cu „mult" în el sau un select
 * cu o opțiune inexistentă nu se mai pot filtra, însuma sau grupa în rapoarte.
 */
import { describe, it, expect } from "vitest";
import { normalizeFieldValue } from "../customFieldValue";

const num = { type: "number", options: null };
const sel = { type: "select", options: ["Primăvară 2026", "Toamnă 2026"] };

describe("normalizeFieldValue", () => {
  it("number: acceptă întregi, negative și zecimale, și formatul local", () => {
    expect(normalizeFieldValue(num, "1500")).toEqual({ ok: true, value: "1500" });
    expect(normalizeFieldValue(num, "-3")).toEqual({ ok: true, value: "-3" });
    expect(normalizeFieldValue(num, "1500.5")).toEqual({ ok: true, value: "1500.5" });
    expect(normalizeFieldValue(num, "1 500,5")).toEqual({ ok: true, value: "1500.5" });
    expect(normalizeFieldValue(num, "+7")).toEqual({ ok: true, value: "7" });
  });

  it("number: refuză textul și formele ambigue", () => {
    for (const bad of ["mult", "12abc", "1e5", "1,500.5", "1.2.3", "-", "Infinity", "NaN"]) {
      expect(normalizeFieldValue(num, bad)).toEqual({ ok: false, error: "invalid_number" });
    }
  });

  it("select: doar opțiunile definite", () => {
    expect(normalizeFieldValue(sel, "Toamnă 2026")).toEqual({ ok: true, value: "Toamnă 2026" });
    expect(normalizeFieldValue(sel, "Vara 1999")).toEqual({ ok: false, error: "invalid_option" });
    expect(normalizeFieldValue({ type: "select", options: null }, "Orice")).toEqual({ ok: false, error: "invalid_option" });
  });

  it("text: orice valoare", () => {
    expect(normalizeFieldValue({ type: "text", options: null }, "mult")).toEqual({ ok: true, value: "mult" });
  });
});
