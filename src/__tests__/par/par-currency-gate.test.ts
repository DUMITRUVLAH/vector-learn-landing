/**
 * Poarta „moneda cererii" — scripts/check-par-currency.mjs.
 *
 * Regresia pe care o păzește: 1.500 USD scriși „1.500,00 L" în inboxul aprobatorului, în coada
 * de finanțe și în PDF-ul oficial (ATIC, PAR-2026-0027). Fix-urile punctuale s-au tot reintrodus
 * pentru că nimic nu le ținea pe loc; poarta e ce le ține.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/check-par-currency.mjs");

function run(args: string[] = []) {
  return spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
}

describe("poarta de monedă pentru PAR", () => {
  it("trece pe codul reparat", () => {
    const r = run();
    if (r.status !== 0) console.error(r.stdout, r.stderr);
    expect(r.status).toBe(0);
  });

  it("cade când o sumă per-cerere e trecută prin formatMDL", () => {
    const fixture = join(tmpdir(), `par-currency-fixture-${Date.now()}.tsx`);
    writeFileSync(
      fixture,
      `export function Row({ par }) {\n  return <td>{formatMDL(par.totalEstimatedCents)}</td>;\n}\n`,
      "utf-8"
    );
    try {
      const r = run([fixture]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("totalEstimatedCents");
    } finally {
      unlinkSync(fixture);
    }
  });

  it("cade când formularul tipărit are eticheta de monedă scrisă de mână", () => {
    const fixture = join(tmpdir(), `parPdf-fixture-${Date.now()}.ts`);
    writeFileSync(
      fixture,
      `export const html = \`<th>Est. Unit Price<br/><span>MDL</span></th>\`;\n`,
      "utf-8"
    );
    try {
      const r = run([fixture]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("etichetă de monedă");
    } finally {
      unlinkSync(fixture);
    }
  });

  it("acceptă o exceptare motivată pe linia de deasupra", () => {
    const fixture = join(tmpdir(), `par-currency-exempt-${Date.now()}.tsx`);
    writeFileSync(
      fixture,
      `export function Total({ report }) {\n` +
        `  // currency-exempt: totalCents vine agregat în lei din SQL\n` +
        `  return <td>{formatMDL(report.totalCents)}</td>;\n}\n`,
      "utf-8"
    );
    try {
      expect(run([fixture]).status).toBe(0);
    } finally {
      unlinkSync(fixture);
    }
  });
});
