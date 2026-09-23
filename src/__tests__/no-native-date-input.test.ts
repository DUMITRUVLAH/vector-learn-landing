/**
 * @vitest-environment node
 *
 * Nicio pagină nu mai folosește `<input type="date">` direct.
 *
 * Owner (2026-09-23): „formatul la dată nu e comod, acum e luna, ziua, anul". Câmpul nativ își
 * ia ordinea din limba BROWSERULUI, nu a paginii — pe un Chrome în engleză (SUA) arăta
 * 01/13/2027 și niciun atribut nu o schimbă. Toate datele trec prin `DateField`
 * (src/components/ds/DateField.tsx), care arată mereu zi.lună.an. Un câmp nativ nou ar readuce
 * problema doar pe ecranul acela, fără ca vreun test de pagină să observe — de aici gărzile astea.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname ?? __dirname, "../..");
const ALLOWED = new Set([path.join("src", "components", "ds", "DateField.tsx")]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...tsxFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("câmpurile de dată", () => {
  it('[blocant] nicio pagină nu folosește `type="date"` în afara DateField', () => {
    const offenders = tsxFiles(path.join(root, "src"))
      .map((f) => path.relative(root, f))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => {
        const src = fs.readFileSync(path.join(root, rel), "utf8");
        // Strict intenționat: și un `onChange={(e) => …}` înaintea lui `type` (săgeata are `>`)
        // trebuie prins, deci nu încercăm să delimităm eticheta JSX.
        return /\btype=(?:"date"|'date'|\{"date"\})/.test(src);
      });
    expect(offenders, `Folosește <DateField> din @/components/ds în: ${offenders.join(", ")}`).toEqual([]);
  });
});
