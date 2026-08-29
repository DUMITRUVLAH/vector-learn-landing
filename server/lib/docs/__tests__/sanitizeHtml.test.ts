/**
 * @vitest-environment node
 *
 * DG-104 — un șablon de act e HTML scris de om și randat pentru toți colegii, în aplicație și în
 * PDF. Dacă trece un `onerror` sau un `<script>`, e XSS persistent, nu o scăpare cosmetică.
 * Testele lovesc exact vectorii: handler de eveniment, script, href javascript:, iframe, gunoi
 * din Word — și verifică, în oglindă, că formatarea legitimă supraviețuiește.
 */
import { describe, it, expect } from "vitest";
import { sanitizeTemplateHtml, cleanPastedHtml } from "../sanitizeHtml";

describe("DG-104 — curățarea corpului de șablon", () => {
  it("[blocant] scoate script-ul cu tot cu conținut", () => {
    const out = sanitizeTemplateHtml('<p>Act</p><script>fetch("/api/steal")</script>');
    expect(out).toBe("<p>Act</p>");
    expect(out).not.toContain("fetch");
  });

  it("[blocant] scoate handlerele de eveniment de pe orice etichetă", () => {
    const out = sanitizeTemplateHtml('<p onclick="alert(1)" onmouseover="x()">Text</p>');
    expect(out).toBe("<p>Text</p>");
  });

  it("[blocant] aruncă etichetele nepermise, dar păstrează textul actului", () => {
    const out = sanitizeTemplateHtml('<img src=x onerror="alert(1)"><font color="red">Suma</font>');
    expect(out).not.toContain("img");
    expect(out).not.toContain("onerror");
    expect(out).toContain("Suma");
  });

  it("[blocant] linkurile javascript: cad, cele normale rămân", () => {
    expect(sanitizeTemplateHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeTemplateHtml('<a href="https://sfs.md">SFS</a>')).toBe(
      '<a href="https://sfs.md">SFS</a>'
    );
  });

  it("[blocant] iframe, style și comentariile Word dispar complet", () => {
    const word = `<!--[if gte mso 9]><xml>junk</xml><![endif]--><style>p{color:red}</style><iframe src="//evil"></iframe><p>Act de primire-predare</p>`;
    const out = sanitizeTemplateHtml(word);
    expect(out).toBe("<p>Act de primire-predare</p>");
  });

  it("[blocant] formatarea legitimă a actului supraviețuiește", () => {
    const body = `<h1>ACT DE PRIMIRE-PREDARE</h1><p><strong>Predător:</strong> <em>ATIC</em></p><table><tbody><tr><td colspan="2">Laptop</td><td>2 buc</td></tr></tbody></table><ul><li>anexă</li></ul><hr>`;
    const out = sanitizeTemplateHtml(body);
    expect(out).toContain("<h1>ACT DE PRIMIRE-PREDARE</h1>");
    expect(out).toContain("<strong>Predător:</strong>");
    expect(out).toContain('<td colspan="2">Laptop</td>');
    expect(out).toContain("<li>anexă</li>");
    expect(out).toContain("<hr>");
  });

  it("[blocant] câmpurile șablonului trec neatinse prin curățare", () => {
    const out = sanitizeTemplateHtml(
      '<p>IBAN <span data-field="contraparte.iban">{{contraparte.iban}}</span></p>'
    );
    expect(out).toContain('data-field="contraparte.iban"');
    expect(out).toContain("{{contraparte.iban}}");
  });

  it("[normal] lipirea din Word pierde paragrafele goale și spațiile insecabile", () => {
    const out = cleanPastedHtml("<p>Contract</p><p>&nbsp;</p><p></p><p>nr. 12</p>");
    // Și paragraful cu spațiu insecabil e gol: Word îl presară între rânduri, iar în act ar
    // deveni un gol nejustificat pe pagină.
    expect(out).toBe("<p>Contract</p><p>nr. 12</p>");
  });
});
