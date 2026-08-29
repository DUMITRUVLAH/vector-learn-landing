/**
 * Poarta de paritate a dicționarelor.
 *
 * `Translated<typeof ro>` prinde deja cheia lipsă la compilare. Ce nu prinde tipul,
 * și ce chiar s-a întâmplat în alte proiecte, e mai subtil:
 *  - o valoare EN lăsată goală (tipul zice `string`, iar `""` e un string valid);
 *  - `{name}` prezent în RO și scris `{nume}` în EN — interpolarea tace și afișează
 *    acoladele pe ecran, în fața clientului;
 *  - o familie de plural cu `_one` dar fără `_other`, care cade pe cheia brută;
 *  - o cheie fără prefix de modul, care mai târziu se ciocnește tăcut la fuziune.
 */
import { describe, expect, it } from "vitest";
import { EN, NAMESPACES, RO } from "../dictionaries";
import { LANGS } from "../types";

const NAMESPACE_PREFIXES = ["common.", "landing.", "par."] as const;

/** Numele variabilelor `{x}` dintr-un șablon, sortate — ca să se poată compara ca mulțimi. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("dicționarele i18n", () => {
  it("au exact aceleași chei în RO și EN", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(RO).sort());
  });

  it("nu au valori goale sau doar spații", () => {
    for (const dict of [RO, EN] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `cheia „${key}" are valoare goală`).not.toBe("");
      }
    }
  });

  it("folosesc aceleași variabile de interpolare în ambele limbi", () => {
    for (const key of Object.keys(RO) as (keyof typeof RO)[]) {
      expect(placeholders(EN[key]), `variabile diferite la „${key}"`).toEqual(
        placeholders(RO[key]),
      );
    }
  });

  it("prefixează fiecare cheie cu un modul cunoscut", () => {
    for (const key of Object.keys(RO)) {
      expect(
        NAMESPACE_PREFIXES.some((prefix) => key.startsWith(prefix)),
        `cheia „${key}" nu are prefix de modul`,
      ).toBe(true);
    }
  });

  it("nu au chei duplicate între namespace-uri", () => {
    const seen = new Map<string, string>();
    for (const [name, namespace] of Object.entries(NAMESPACES)) {
      for (const key of Object.keys(namespace.ro)) {
        const previous = seen.get(key);
        expect(previous, `cheia „${key}" apare în „${previous}" și în „${name}"`).toBeUndefined();
        seen.set(key, name);
      }
    }
  });

  it("dau fiecărei familii de plural o formă `_other`", () => {
    const bases = new Set(
      Object.keys(RO)
        .filter((key) => /_(one|few|other)$/.test(key))
        .map((key) => key.replace(/_(one|few|other)$/, "")),
    );
    for (const base of bases) {
      for (const lang of LANGS) {
        const dict = lang === "ro" ? RO : EN;
        expect(
          `${base}_other` in dict,
          `familia „${base}" nu are formă _other în „${lang}"`,
        ).toBe(true);
      }
    }
  });
});
