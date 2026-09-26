import { describe, expect, it } from "vitest";
import {
  DIACRITICS_FROM,
  DIACRITICS_TO,
  escapeLike,
  foldDiacritics,
  neutralizeCsvFormula,
  phoneSearchDigits,
} from "../leadSearch";

describe("leadSearch — partea pură a căutării", () => {
  it("tabelele de pliere au aceeași lungime (translate() le potrivește caracter cu caracter)", () => {
    expect([...DIACRITICS_FROM].length).toBe([...DIACRITICS_TO].length);
  });

  it("escapează %, _ și \\ ca să fie căutate literal", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\x")).toBe("c:\\\\x");
    expect(escapeLike("Ion Popescu")).toBe("Ion Popescu");
  });

  it("pliază diacriticele românești, cu virgulă și cu sedilă, mari și mici", () => {
    expect(foldDiacritics("Ștefan Țurcanu")).toBe("stefan turcanu");
    expect(foldDiacritics("ŞTEFAN ŢURCANU")).toBe("stefan turcanu");
    expect(foldDiacritics("Mădălina Îngerul Âmbră")).toBe("madalina ingerul ambra");
    expect(foldDiacritics("Stefan Turcanu")).toBe("stefan turcanu");
  });

  it("recunoaște un telefon în orice format și îl reduce la forma normalizată", () => {
    expect(phoneSearchDigits("069123456")).toBe("69123456");
    expect(phoneSearchDigits("+373 69 123 456")).toBe("69123456");
    expect(phoneSearchDigits("(069) 12-34")).toBe("0691234");
  });

  it("textul care nu arată a telefon nu e tratat ca telefon", () => {
    expect(phoneSearchDigits("Elev 12")).toBeNull();
    expect(phoneSearchDigits("123")).toBeNull();
    expect(phoneSearchDigits("ion@x.md")).toBeNull();
  });

  it("neutralizează formulele la export (CSV injection)", () => {
    for (const evil of ["=HYPERLINK(\"x\")", "+1+2", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      expect(neutralizeCsvFormula(evil).startsWith("'")).toBe(true);
    }
    expect(neutralizeCsvFormula("Ion Popescu")).toBe("Ion Popescu");
    expect(neutralizeCsvFormula("1234,56")).toBe("1234,56");
  });
});
