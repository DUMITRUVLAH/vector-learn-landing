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
