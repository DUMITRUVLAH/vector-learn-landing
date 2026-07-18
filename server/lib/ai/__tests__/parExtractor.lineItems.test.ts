// @vitest-environment node
/**
 * Line items: the AI returns a `line_items` array (description / quantity / unit / unit_price in MAJOR
 * units). normalizeParExtraction must convert unit_price → CENTS (×100, same as the total amount),
 * default a missing quantity to 1, drop empty-description rows, and tolerate string prices ("4 000",
 * "10500,50"). Owner asked to pre-fill the "Articole" section, not just the total.
 *
 * Runs in the `node` env (directive above): importing parExtractor transitively constructs the PGlite
 * client; under the default jsdom env pglite's wasm/fsBundle loader rejects with ERR_INVALID_URL_SCHEME
 * (readFile on a non-file URL) after the test, making the run exit non-zero. node uses pglite's file
 * loader (matches production) and is the correct env for server-side code anyway.
 */
import { describe, it, expect } from "vitest";
import { normalizeParExtraction } from "../parExtractor";

describe("normalizeParExtraction — line_items", () => {
  it("maps a multi-item deviz to cents and keeps qty/unit", () => {
    const ext = normalizeParExtraction({
      parties: [{ name: "LAURTOP CAPITAL SRL", role: "provider" }],
      line_items: [
        { description: "Ziua 1 de training", quantity: 1, unit: "zi", unit_price: 4000 },
        { description: "Pregatire materiale", quantity: 2, unit: "buc", unit_price: 10500 },
      ],
    });
    expect(ext.lineItems).toHaveLength(2);
    expect(ext.lineItems?.[0]).toEqual({ description: "Ziua 1 de training", quantity: 1, unit: "zi", unitPriceCents: 400000 });
    expect(ext.lineItems?.[1].unitPriceCents).toBe(1050000); // 10500 MDL → cents
    expect(ext.lineItems?.[1].quantity).toBe(2);
  });

  it("defaults quantity to 1, parses string/spaced prices, drops empty rows", () => {
    const ext = normalizeParExtraction({
      parties: [],
      line_items: [
        { description: "Serviciu A", unit_price: "4 000" }, // no quantity, spaced string
        { description: "Serviciu B", quantity: 0, unit: null, unit_price: "10500,50" }, // qty 0 → 1, decimal comma
        { description: "", unit_price: 999 }, // empty description → dropped
      ],
    });
    expect(ext.lineItems).toHaveLength(2);
    expect(ext.lineItems?.[0]).toEqual({ description: "Serviciu A", quantity: 1, unit: null, unitPriceCents: 400000 });
    expect(ext.lineItems?.[1]).toEqual({ description: "Serviciu B", quantity: 1, unit: null, unitPriceCents: 1050050 });
  });

  it("returns [] when the model omits line_items", () => {
    const ext = normalizeParExtraction({ parties: [] });
    expect(ext.lineItems).toEqual([]);
  });
});
