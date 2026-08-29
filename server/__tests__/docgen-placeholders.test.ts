/**
 * @vitest-environment node
 *
 * DG-102 — câmpurile actelor sunt grupate pe sursă (`{{contraparte.iban}}`), pentru că un
 * `{{iban}}` singur nu spune al cui e IBAN-ul — al nostru sau al furnizorului. Regexul comun de
 * șabloane accepta doar `\w+`, deci punctele erau ignorate în tăcere și actul pleca la semnat cu
 * `{{contraparte.iban}}` tipărit pe el. Testul blochează regresia, în ambele direcții.
 */
import { describe, it, expect } from "vitest";
import { extractPlaceholders, renderWithContext } from "../lib/docmerge/placeholders";

describe("DG-102 — câmpuri cu punct în nume", () => {
  it("[blocant] se detectează câmpurile grupate pe sursă", () => {
    const body = "IBAN {{contraparte.iban}}, emis de {{noi.denumire}}, proiect {{proiect.nume}}";
    expect(extractPlaceholders(body)).toEqual([
      "contraparte.iban",
      "noi.denumire",
      "proiect.nume",
    ]);
  });

  it("[blocant] se completează la randare, fără să rămână acolade în act", () => {
    const out = renderWithContext("IBAN {{contraparte.iban}} · {{noi.denumire}}", {
      "contraparte.iban": "MD48ML000002259A19498121",
      "noi.denumire": "Asociația ATIC",
    });
    expect(out).toBe("IBAN MD48ML000002259A19498121 · Asociația ATIC");
    expect(out).not.toContain("{{");
  });

  it("[blocant] valorile rămân escapate — un furnizor numit cu HTML nu injectează cod în act", () => {
    const out = renderWithContext("Furnizor: {{contraparte.denumire}}", {
      "contraparte.denumire": '<script>alert(1)</script>',
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("[normal] câmpurile simple existente continuă să funcționeze (retrocompatibilitate)", () => {
    expect(extractPlaceholders("Salut {{first_name}}!")).toEqual(["first_name"]);
    expect(renderWithContext("Salut {{first_name}}!", { first_name: "Maria" })).toBe("Salut Maria!");
  });
});
