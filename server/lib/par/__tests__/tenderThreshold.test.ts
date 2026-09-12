/**
 * VM5-19 — pragul anual per prestator.
 *
 * Cerința owner-ului: „dacă un prestator într-un an trece de suma X, nu contează euro, usd, mdl, să
 * apară un semn al exclamării când faci PAR că trebuie de făcut tender. Și finance manager poate
 * după să bifeze că s-a făcut și după să nu apară pentru acel an."
 */
import { describe, it, expect } from "vitest";
import { evaluateTenderThreshold, tenderYear, vendorKey } from "../tenderThreshold";

const L = (lei: number) => lei * 100;
const base = { thresholdCents: L(100000), yearToDateCents: 0, currentParCents: 0, cleared: false, hasVendor: true };

describe("vendorKey()", () => {
  it("preferă prestatorul din registru", () => {
    expect(vendorKey({ vendorId: "abc", payeeIdnp: "1006600034927", payeeName: "Alfa" })).toBe("v:abc");
  });

  it("cade pe codul fiscal când prestatorul nu e salvat", () => {
    expect(vendorKey({ payeeIdnp: "1006600034927", payeeName: "Alfa SRL" })).toBe("i:1006600034927");
  });

  it("aceeași firmă scrisă diferit se numără o singură dată", () => {
    expect(vendorKey({ payeeName: "  SRL   ALFA " })).toBe(vendorKey({ payeeName: "srl alfa" }));
  });

  it("un cod fiscal prea scurt nu se ia drept identitate", () => {
    expect(vendorKey({ payeeIdnp: "123", payeeName: "Alfa" })).toBe("n:alfa");
  });

  it("fără niciun indiciu nu există prestator de numărat", () => {
    expect(vendorKey({})).toBeNull();
    expect(vendorKey({ payeeName: "   " })).toBeNull();
  });
});

describe("evaluateTenderThreshold()", () => {
  it("nu se pronunță când pragul nu e configurat", () => {
    const r = evaluateTenderThreshold({ ...base, thresholdCents: 0, currentParCents: L(500000) });
    expect(r.applies).toBe(false);
    expect(r.warn).toBe(false);
  });

  it("sub prag, tace", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(40000), currentParCents: L(30000) });
    expect(r.exceeds).toBe(false);
    expect(r.warn).toBe(false);
    expect(r.projectedCents).toBe(L(70000));
  });

  /** Miezul cerinței: avertismentul apare pe cererea care trece pragul, nu pe următoarea. */
  it("avertizează pe CHIAR cererea care trece pragul", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(95000), currentParCents: L(10000) });
    expect(r.exceeds).toBe(true);
    expect(r.warn).toBe(true);
    expect(r.overByCents).toBe(L(5000));
  });

  it("fracționarea nu scapă: multe plăți mici trec pragul la fel ca una mare", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(99000), currentParCents: L(1500) });
    expect(r.warn).toBe(true);
  });

  it("exact pe prag nu e depășire", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(90000), currentParCents: L(10000) });
    expect(r.exceeds).toBe(false);
  });

  /** „finance manager poate după să bifeze că s-a făcut și după să nu apară pentru acel an". */
  it("după bifa finanțelor, semnul dispare — dar suma rămâne numărată", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(120000), currentParCents: L(5000), cleared: true });
    expect(r.exceeds).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.warn).toBe(false);
    expect(r.projectedCents).toBe(L(125000));
  });

  it("fără prestator identificabil nu are ce număra", () => {
    const r = evaluateTenderThreshold({ ...base, yearToDateCents: L(200000), currentParCents: L(1), hasVendor: false });
    expect(r.applies).toBe(false);
    expect(r.warn).toBe(false);
  });

  it("nu se sperie de cifre lipsă sau negative", () => {
    const r = evaluateTenderThreshold({
      thresholdCents: Number.NaN as unknown as number,
      yearToDateCents: -5, currentParCents: Number.NaN as unknown as number, cleared: false, hasVendor: true,
    });
    expect(r.applies).toBe(false);
    expect(r.projectedCents).toBe(0);
  });
});

describe("tenderYear()", () => {
  it("citește anul în fusul organizației", () => {
    // 31 decembrie 23:30 UTC = 1 ianuarie 01:30 la Chișinău → anul următor.
    expect(tenderYear("2026-12-31T23:30:00Z")).toBe(2027);
    expect(tenderYear("2026-06-15T10:00:00Z")).toBe(2026);
  });

  it("o dată lipsă sau stricată înseamnă anul curent", () => {
    const acum = new Date().getFullYear();
    expect([acum, acum + 1]).toContain(tenderYear(null));
    expect([acum, acum + 1]).toContain(tenderYear("nu e o dată"));
  });
});
