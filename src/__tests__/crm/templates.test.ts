/**
 * CRM-108 — Template-uri cu variabile
 * Covers T-CRM-108-1..3 (unit tests for variable extraction/rendering logic)
 */
import { describe, it, expect } from "vitest";
import { extractVariables, renderPreview, KNOWN_VARIABLES } from "@/lib/api/templates";

describe("CRM-108 — extractVariables", () => {
  /**
   * T-CRM-108-1: template cu {{first_name}} → variabilă detectată
   */
  it("T-CRM-108-1: detects single variable", () => {
    const vars = extractVariables("Bună ziua {{first_name}}!");
    expect(vars).toContain("first_name");
  });

  it("T-CRM-108-1: detects multiple variables", () => {
    const vars = extractVariables("Bună {{first_name}}, cursul {{course}} pe {{trial_date}}.");
    expect(vars).toEqual(expect.arrayContaining(["first_name", "course", "trial_date"]));
    expect(vars).toHaveLength(3);
  });

  it("T-CRM-108-1: deduplicates repeated variables", () => {
    const vars = extractVariables("{{first_name}} și {{first_name}} de două ori.");
    expect(vars).toHaveLength(1);
    expect(vars[0]).toBe("first_name");
  });

  it("T-CRM-108-1: returns empty array for no variables", () => {
    const vars = extractVariables("Mesaj fără variabile.");
    expect(vars).toHaveLength(0);
  });

  it("T-CRM-108-1: template cu variabilă necunoscută → variabila e în lista detectată", () => {
    const vars = extractVariables("Salut {{unknown_var}}!");
    expect(vars).toContain("unknown_var");
  });
});

describe("CRM-108 — renderPreview", () => {
  /**
   * T-CRM-108-2: preview înlocuiește variabilele cu sample data
   */
  it("T-CRM-108-2: renders known variables with sample data", () => {
    const result = renderPreview("Bună {{first_name}}, cursul este {{course}}.");
    expect(result).toBe(`Bună ${KNOWN_VARIABLES.first_name}, cursul este ${KNOWN_VARIABLES.course}.`);
    expect(result).not.toContain("{{");
  });

  it("T-CRM-108-2: renders all known variables", () => {
    const template = Object.keys(KNOWN_VARIABLES).map((k) => `{{${k}}}`).join(" | ");
    const rendered = renderPreview(template);
    expect(rendered).not.toContain("{{");
    Object.values(KNOWN_VARIABLES).forEach((v) => {
      expect(rendered).toContain(v);
    });
  });

  /**
   * T-CRM-108-3: variabilă necunoscută → rămâne neînlocuită în preview
   */
  it("T-CRM-108-3: unknown variable preserved in output (warning indicator)", () => {
    const result = renderPreview("Salut {{unknown_var}}!");
    // Unknown variable should be preserved as-is
    expect(result).toContain("{{unknown_var}}");
  });

  it("T-CRM-108-3: mix of known and unknown variables", () => {
    const result = renderPreview("{{first_name}} și {{totally_unknown}}.");
    expect(result).toContain(KNOWN_VARIABLES.first_name);
    expect(result).toContain("{{totally_unknown}}");
    expect(result).not.toContain("{{first_name}}");
  });

  it("renders with custom context", () => {
    const result = renderPreview("Bună {{first_name}}!", { first_name: "Ion" });
    expect(result).toBe("Bună Ion!");
  });
});

describe("CRM-108 — Unknown variable warnings logic", () => {
  it("T-CRM-108-3: identifies unknown variables for warning", () => {
    const body = "Salut {{first_name}} și {{mystery_field}}!";
    const detected = extractVariables(body);
    const unknownVars = detected.filter((v) => !KNOWN_VARIABLES[v]);
    expect(unknownVars).toContain("mystery_field");
    expect(unknownVars).not.toContain("first_name");
  });

  it("no warnings for all-known template", () => {
    const body = "Bună {{first_name}}, {{course}} la {{trial_date}}.";
    const detected = extractVariables(body);
    const unknownVars = detected.filter((v) => !KNOWN_VARIABLES[v]);
    expect(unknownVars).toHaveLength(0);
  });
});
