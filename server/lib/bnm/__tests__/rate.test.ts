/**
 * VM1-03: BNM rate service tests — covers the FX service via the bnm/rate.ts re-export.
 *
 * T-VM1-03-1 [blocant] Given EUR 100 at BNM rate 19.5, When toMdlCents, Then ≈195000 MDL cents.
 * T-VM1-03-4 [normal] Given BNM unavailable, When getMdlRate, Then falls back to last known rate.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getMdlRate, toMdlCents, parseBnmRate, bnmDate, __resetFxCache } from "../rate";

// Minimal BNM XML fixture for EUR at 19.5 (1 unit → 19.5 MDL).
function bnmXml(charCode: string, nominal: number, value: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ValCurs>
  <Valute>
    <CharCode>${charCode}</CharCode>
    <Nominal>${nominal}</Nominal>
    <Value>${value}</Value>
  </Valute>
</ValCurs>`;
}

const mockFetch = (xml: string, ok = true) =>
  (_url: string) =>
    Promise.resolve({
      ok,
      text: () => Promise.resolve(xml),
    });

afterEach(() => {
  __resetFxCache();
});

describe("parseBnmRate", () => {
  it("parses EUR at 19.5 correctly", () => {
    const xml = bnmXml("EUR", 1, 19.5);
    expect(parseBnmRate(xml, "EUR")).toBeCloseTo(19.5, 4);
  });

  it("returns null for missing currency", () => {
    const xml = bnmXml("USD", 1, 17.8);
    expect(parseBnmRate(xml, "EUR")).toBeNull();
  });

  it("handles nominal > 1 correctly (e.g. JPY: Nominal=100, Value=12.5 → 0.125)", () => {
    const xml = bnmXml("JPY", 100, 12.5);
    expect(parseBnmRate(xml, "JPY")).toBeCloseTo(0.125, 6);
  });
});

describe("getMdlRate", () => {
  it("T-VM1-03-1: returns 1 for MDL without fetching", async () => {
    const rate = await getMdlRate("MDL");
    expect(rate).toBe(1);
  });

  it("T-VM1-03-1: fetches and returns EUR rate from BNM XML", async () => {
    const xml = bnmXml("EUR", 1, 19.5);
    const rate = await getMdlRate("EUR", { fetchImpl: mockFetch(xml) });
    expect(rate).toBeCloseTo(19.5, 4);
  });

  it("T-VM1-03-4: falls back to last known rate when BNM returns non-OK", async () => {
    // First fetch succeeds — seeds the fallback.
    const xml = bnmXml("EUR", 1, 19.5);
    await getMdlRate("EUR", { fetchImpl: mockFetch(xml) });
    // Second fetch fails — should use fallback.
    const rate = await getMdlRate("EUR", { fetchImpl: mockFetch("", false) });
    expect(rate).toBeCloseTo(19.5, 4);
  });

  it("T-VM1-03-4: throws when no fallback available", async () => {
    await expect(
      getMdlRate("EUR", { fetchImpl: mockFetch("", false) })
    ).rejects.toThrow();
  });
});

describe("toMdlCents", () => {
  it("T-VM1-03-1: converts 10000 EUR cents at rate 19.5 → 195000 MDL cents", async () => {
    const xml = bnmXml("EUR", 1, 19.5);
    const { mdlCents, rate } = await toMdlCents(10000, "EUR", { fetchImpl: mockFetch(xml) });
    expect(rate).toBeCloseTo(19.5, 4);
    expect(mdlCents).toBe(195000);
  });

  it("MDL cents are identity (1:1)", async () => {
    const { mdlCents, rate } = await toMdlCents(50000, "MDL");
    expect(rate).toBe(1);
    expect(mdlCents).toBe(50000);
  });
});
