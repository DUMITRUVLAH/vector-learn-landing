/**
 * VM5-05 (server): numărul de nepotriviri care ajunge pe rândul din inbox.
 *
 * Regula pe care o apără testele: se numără doar diferențele CONFIRMATE. Un câmp pe care
 * extractorul nu l-a putut citi (`matches: null`) nu e vina nimănui — dacă l-am număra, aproape
 * fiecare rând ar purta un semn de alarmă și oamenii ar înceta să-l mai vadă.
 */
import { describe, it, expect } from "vitest";
import { countAnalysisMismatches, countMismatchesByPar } from "../documentWarnings";

const analysis = (matches: (boolean | null)[], version: number | null = 2) =>
  JSON.stringify({
    ...(version === null ? {} : { version }),
    status: matches.includes(false) ? "warning" : "match",
    warnings: matches.filter((m) => m === false).length,
    checks: matches.map((m, i) => ({ field: `câmp-${i}`, expected: "x", found: "y", matches: m })),
  });

describe("countAnalysisMismatches()", () => {
  it("numără doar diferențele confirmate", () => {
    expect(countAnalysisMismatches(analysis([false, null, true, false]))).toBe(2);
  });

  it("un document concordant nu produce niciun semn", () => {
    expect(countAnalysisMismatches(analysis([true, true, null]))).toBe(0);
  });

  it("verdictele făcute cu reguli vechi nu se numără", () => {
    expect(countAnalysisMismatches(analysis([false, false], null))).toBe(0);
    expect(countAnalysisMismatches(analysis([false, false], 1))).toBe(0);
  });

  it("text lipsă sau stricat înseamnă zero, nu excepție", () => {
    expect(countAnalysisMismatches(null)).toBe(0);
    expect(countAnalysisMismatches("")).toBe(0);
    expect(countAnalysisMismatches("{nu e json")).toBe(0);
    expect(countAnalysisMismatches(JSON.stringify({ status: "warning" }))).toBe(0);
  });
});

describe("countMismatchesByPar()", () => {
  it("adună nepotrivirile tuturor documentelor unei cereri", () => {
    const map = countMismatchesByPar([
      { parId: "par-1", analysis: analysis([false]) },
      { parId: "par-1", analysis: analysis([false, false]) },
      { parId: "par-2", analysis: analysis([true]) },
    ]);
    expect(map.get("par-1")).toBe(3);
    expect(map.has("par-2")).toBe(false);
  });

  it("o listă goală nu produce nimic", () => {
    expect(countMismatchesByPar([]).size).toBe(0);
  });
});
