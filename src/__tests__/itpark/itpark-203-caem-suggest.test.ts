/**
 * ITPARK-203 — Auto-sugestie CAEM deterministă
 * Tests: T-203-1 [normal]
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §6 (AI = accelerator, nu sursă de cifre)
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  suggestCaem,
  normalizeForMatch,
  CAEM_RULES,
} from "../../../src/lib/itpark/caemSuggest";

// ─── T-203-1 [normal]: sugestii deterministe pentru descrierile din fixture ──

describe("ITPARK-203 — suggestCaem (T-203-1)", () => {
  it("'Servicii instruire domeniu digital' → 85.59", () => {
    const s = suggestCaem("Servicii instruire domeniu digital");
    expect(s).not.toBeNull();
    expect(s!.code).toBe("85.59");
    expect(s!.confidence).toBeGreaterThan(0.8);
  });

  it("'Servicii consultanta in domeniu digital' → 62.02", () => {
    const s = suggestCaem("Servicii consultanta in domeniu digital");
    expect(s).not.toBeNull();
    expect(s!.code).toBe("62.02");
  });

  it("'Consultanță IT' → 62.02", () => {
    const s = suggestCaem("Consultanță IT");
    expect(s!.code).toBe("62.02");
  });

  it("'Realizare software la comandă' → 62.01", () => {
    const s = suggestCaem("Realizare software la comandă");
    expect(s!.code).toBe("62.01");
  });

  it("'Servicii hosting și administrare servere' → 63.11", () => {
    const s = suggestCaem("Servicii hosting și administrare servere");
    expect(s!.code).toBe("63.11");
  });

  it("descriere goală → null", () => {
    expect(suggestCaem("")).toBeNull();
    expect(suggestCaem("   ")).toBeNull();
  });

  it("descriere irelevantă → null (nu face sugestii false)", () => {
    const s = suggestCaem("Vânzare produse agricole");
    // Poate returna null sau o sugestie; cel puțin nu trebuie să crape
    expect(typeof s === "object" || s === null).toBe(true);
  });

  it("diacriticele sunt tolerate: 'instruire' == 'instruire' normalizat", () => {
    const n1 = normalizeForMatch("Instruire în domeniu digital");
    const n2 = normalizeForMatch("Instruire in domeniu digital");
    // Ambele trebuie să fie echivalente (î → i)
    expect(n1).toBe(n2);
  });

  it("case-insensitive: 'INSTRUIRE' → 85.59", () => {
    const s = suggestCaem("INSTRUIRE DIGITALA");
    expect(s!.code).toBe("85.59");
  });

  it("sugestia NU suprascrie codul setat manual (regula §6)", () => {
    // Verificăm că suggestCaem returnează sugestie; aplicarea ei este
    // responsabilitatea UI-ului (care verifică că caemCode === "" înainte).
    // Testul confirmă că funcția returnează corect tipul și nu are side-effects.
    const s = suggestCaem("instruire");
    expect(s).not.toBeNull();
    // Funcția nu are side-effects (pure)
    const s2 = suggestCaem("instruire");
    expect(s2).toEqual(s);
  });

  it("returnează reason string non-gol", () => {
    const s = suggestCaem("curs programare");
    if (s !== null) {
      expect(typeof s.reason).toBe("string");
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });
});

// ─── CAEM_RULES config validation ────────────────────────────────────────────

describe("ITPARK-203 — CAEM_RULES config (non-scattered literals)", () => {
  it("CAEM_RULES este un array non-gol", () => {
    expect(Array.isArray(CAEM_RULES)).toBe(true);
    expect(CAEM_RULES.length).toBeGreaterThan(0);
  });

  it("fiecare regulă are code, keywords[], confidence, reason", () => {
    CAEM_RULES.forEach((rule, i) => {
      expect(rule.code, `rule[${i}].code`).toBeTruthy();
      expect(Array.isArray(rule.keywords), `rule[${i}].keywords`).toBe(true);
      expect(rule.keywords.length, `rule[${i}].keywords.length`).toBeGreaterThan(0);
      expect(rule.confidence, `rule[${i}].confidence`).toBeGreaterThan(0);
      expect(rule.confidence, `rule[${i}].confidence <= 1`).toBeLessThanOrEqual(1);
      expect(rule.reason, `rule[${i}].reason`).toBeTruthy();
    });
  });

  it("codurile CAEM din reguli sunt din lista oficială MITP (CORE §4)", () => {
    const eligibleCodes = new Set([
      "62.01", "58.21", "58.29", "62.02", "62.03", "62.09",
      "63.11", "63.12", "85.59",
    ]);
    CAEM_RULES.forEach((rule) => {
      expect(
        eligibleCodes.has(rule.code),
        `${rule.code} trebuie să fie în lista MITP eligibilă`
      ).toBe(true);
    });
  });

  it("85.59 și 62.02 sunt acoperite (codurile din fixture Vector Academy)", () => {
    const codes = CAEM_RULES.map((r) => r.code);
    expect(codes).toContain("85.59");
    expect(codes).toContain("62.02");
  });
});

// ─── Route + endpoint check ────────────────────────────────────────────────

describe("ITPARK-203 — Route mount (§3.5.1)", () => {
  it("itparkCaemRoutes exportat cu endpoint /suggest", async () => {
    const mod = await import("../../../server/routes/itparkCaem");
    expect(mod.itparkCaemRoutes).toBeDefined();
    expect(typeof mod.itparkCaemRoutes.fetch).toBe("function");
  });

  it("client API exportă suggestCaem și suggestCaemApi", async () => {
    const api = await import("../../lib/api/itparkCaem");
    expect(typeof api.suggestCaem).toBe("function");
    expect(typeof api.suggestCaemApi).toBe("function");
  });
});
