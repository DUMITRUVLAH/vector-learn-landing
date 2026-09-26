/**
 * @vitest-environment node
 *
 * Importul de lead-uri: rândurile goale, adresele stricate, numerele de rând — și curățarea
 * jurnalului la anonimizare. Fiecare caz de aici a fost un bug găsit de `e2e-crm-1000`.
 */
import { describe, it, expect } from "vitest";
import { applyMapping, parseDelimited, validateDraft } from "../importFile";
import { scrubPii } from "../audit";

describe("applyMapping — rândurile goale", () => {
  it("[blocant] un rând gol din mijloc nu devine un lead fără nume", () => {
    const t = parseDelimited("Nume;Telefon\nUnu;069222011\n\n;\nDoi;069222012");
    const drafts = applyMapping(t.rows, { 0: "full_name", 1: "phone" }, t.rowNumbers?.map((n) => n - 1));
    expect(drafts.map((d) => d.full_name)).toEqual(["Unu", "Doi"]);
    // Numărul rămâne poziția reală în date — „Doi" e al patrulea rând de sub antet.
    expect(drafts.map((d) => d.rowNumber)).toEqual([1, 4]);
  });
});

describe("validateDraft — emailul", () => {
  it("[blocant] „ion@@gmail” cu telefon: avertisment, iar adresa NU ajunge pe lead", () => {
    const [d] = applyMapping([["Ion", "069222020", "ion@@gmail"]], { 0: "full_name", 1: "phone", 2: "email" });
    expect(d.email).toBeNull();
    expect(d.invalid_email).toBe("ion@@gmail");
    const v = validateDraft(d);
    expect(v.errors).toEqual([]);
    expect(v.warnings.some((w) => /email/i.test(w))).toBe(true);
  });

  it("[blocant] adresa stricată fără telefon e eroare — rândul n-are niciun contact", () => {
    const [d] = applyMapping([["Ion", "ion@@gmail"]], { 0: "full_name", 1: "email" });
    expect(validateDraft(d).errors.length).toBe(1);
  });

  it("o adresă validă trece neatinsă", () => {
    const [d] = applyMapping([["Ion", "ion@gmail.com"]], { 0: "full_name", 1: "email" });
    expect(d.email).toBe("ion@gmail.com");
    expect(validateDraft(d)).toEqual({ errors: [], warnings: [] });
  });
});

describe("scrubPii — jurnalul după anonimizare", () => {
  it("[blocant] cheile personale și textele care conțin numele/emailul se înlocuiesc, structura rămâne", () => {
    const out = scrubPii(
      { fullName: "Ana Pop", email: "ana@x.md", stage: "new", body: { note: "sună-o pe Ana Pop" }, valueCents: 100 },
      ["Ana Pop", "ana@x.md"],
      "[GDPR_REMOVED]"
    );
    expect(out).toEqual({
      fullName: "[GDPR_REMOVED]",
      email: "[GDPR_REMOVED]",
      stage: "new",
      body: { note: "sună-o pe [GDPR_REMOVED]" },
      valueCents: 100,
    });
    expect(JSON.stringify(out)).not.toMatch(/Ana Pop|ana@x\.md/);
  });

  it("null rămâne null (o intrare fără valori nu capătă marcaje inventate)", () => {
    expect(scrubPii(null, ["Ana"], "[GDPR_REMOVED]")).toBeNull();
    expect(scrubPii({ email: null }, ["Ana"], "[GDPR_REMOVED]")).toEqual({ email: null });
  });
});
