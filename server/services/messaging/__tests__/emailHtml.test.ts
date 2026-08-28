/**
 * Regression: the notification email header rendered a broken image
 * (`https://vectorlearn.md/logo.png` — a host that serves no such file) and the
 * old "Vector Learn" branding, while the product shipping these emails is FinFlow.
 * Gmail strips the `onerror` fallback, so recipients saw the broken-image icon.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildHtml } from "../providers";

const ORIGINAL_APP_URL = process.env.APP_URL;

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe("buildHtml — email branding", () => {
  it("shows the FinFlow lockup, not Vector Learn", () => {
    const html = buildHtml("[PAR] PAR-2026-0043 — aprobare necesară", "Cererea așteaptă aprobarea ta.");

    expect(html).not.toContain("Vector Learn");
    expect(html).not.toContain("vectorlearn.md/logo.png");
    expect(html).toContain(">FinFlow</td>");
    expect(html).toContain("FinFlow · Notificare automată");
  });

  it("points the logo at an absolute https asset that exists in public/", () => {
    process.env.APP_URL = "https://finflow.best";
    const html = buildHtml("subiect", "corp");

    expect(html).toContain('src="https://finflow.best/finflow-mark.png"');
    // The asset must ship with the app, or the header is a broken image again.
    expect(existsSync(path.resolve(process.cwd(), "public/finflow-mark.png"))).toBe(true);
  });

  it("never emits a localhost logo URL into a real inbox", () => {
    process.env.APP_URL = "http://localhost:5173";
    const html = buildHtml("subiect", "corp");

    expect(html).not.toContain("localhost");
    expect(html).toContain('src="https://finflow.best/finflow-mark.png"');
  });

  it("degrades to the wordmark when the image is blocked (empty alt, no broken icon)", () => {
    const html = buildHtml("subiect", "corp");

    expect(html).toMatch(/<img src="[^"]*finflow-mark\.png" alt=""/);
    expect(html).not.toContain("onerror");
  });

  it("escapes markup coming from the subject and the body", () => {
    const html = buildHtml('<script>"x"', "a & <b>\nlinia 2");

    expect(html).toContain("&lt;script&gt;&quot;x&quot;");
    expect(html).toContain("a &amp; &lt;b&gt;<br>linia 2");
  });
});

/**
 * Regression (2026-08-28): linkurile din emailurile PAR erau text simplu în HTML.
 * Gmail le autolinka, Outlook NU — destinatarii pe Outlook primeau un URL neclicabil.
 */
describe("buildHtml — linkuri clicabile", () => {
  it("transformă ultima linie „Etichetă: https://…” într-un buton cu <a href>", () => {
    const html = buildHtml(
      "[PAR] PAR-2026-0003",
      "PAR PAR-2026-0003 este aprobată.\n\nDeschide cererea: https://finflow.best/#/business/par/675c33af-b475-463f-9f4e-23becff5c694"
    );

    expect(html).toContain(
      '<a href="https://finflow.best/#/business/par/675c33af-b475-463f-9f4e-23becff5c694"'
    );
    expect(html).toContain(">Deschide cererea</a>");
    // butonul e pe <td bgcolor> — Outlook desktop ignoră padding-ul pe <a>
    expect(html).toContain('<td bgcolor="#1a1aff"');
    // fallback pentru clienții care blochează stilurile
    expect(html).toContain("Dacă butonul nu funcționează, copiază linkul");
    // linia „Deschide cererea: …” nu se mai repetă ca text în corp
    expect(html).not.toContain("Deschide cererea: https://");
  });

  it("face clicabil orice URL rămas în corpul mesajului", () => {
    const html = buildHtml("subiect", "Vezi https://finflow.best/#/business/par/abc și gata.");

    expect(html).toContain('<a href="https://finflow.best/#/business/par/abc"');
    // punctuația/textul de după rămâne în afara ancorei
    expect(html).toContain("</a> și gata.");
  });

  it("nu permite ieșirea din atributul href prin ghilimele din corp", () => {
    const html = buildHtml("subiect", 'https://x.test/a"onmouseover="alert(1)');

    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain("&quot;onmouseover=");
  });

  it("nu afișează buton când nu există niciun link", () => {
    const html = buildHtml("subiect", "Doar text, fără linkuri.");

    expect(html).not.toContain("bgcolor=\"#1a1aff\"");
    expect(html).toContain("Doar text, fără linkuri.");
  });
});
