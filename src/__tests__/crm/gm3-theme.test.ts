/**
 * @vitest-environment node
 *
 * Tema GM3 a CRM-ului ia de la Google culorile și formele, nu fontul: litera rămâne Onest, ca în
 * tot FinFlow-ul (cerința ownerului, 2026-09-25). jsdom nu calculează CSS, deci verificăm sursa.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "../../styles/gm3.css"), "utf8");
const html = readFileSync(path.resolve(__dirname, "../../../index.html"), "utf8");

describe("tema GM3 a CRM-ului", () => {
  it("[blocant] fontul CRM-ului e Onest", () => {
    const decl = css.match(/\.gm3\s*\{[\s\S]*?font-family:\s*([^;]+);/);
    expect(decl?.[1].trim().startsWith('"Onest"')).toBe(true);
  });

  it("[normal] nu se mai încarcă un font pe care nu-l folosește nimeni", () => {
    expect(css).not.toMatch(/Google Sans/);
    expect(html).not.toMatch(/Google\+Sans/);
    expect(html).toMatch(/family=Onest/);
  });
});
