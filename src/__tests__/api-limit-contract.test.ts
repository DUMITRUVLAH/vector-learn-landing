/**
 * @vitest-environment node
 *
 * Client↔server limit-contract gate.
 *
 * The bug: InvoicesPage called listStudents({ limit: 200 }) but the /api/students
 * Zod schema caps limit at 100 → 400 → the page showed "Niciun elev activ" with
 * 17 active students in the DB. Nothing caught the mismatch because the page used a
 * value the server rejects.
 *
 * This test scans, for each list route, the server's Zod `limit` cap, then scans the
 * frontend for every `limit: <n>` literal passed to that route's client function and
 * fails if any client value EXCEEDS the server cap. It's static (no live server), so
 * it's fast and runs in CI on every change.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname ?? __dirname, "../..");

// Map a server route file → the client API module(s) that call it.
// We read the server cap from the route's Zod `.max(N)` on the `limit` field.
function serverLimitCap(routeFile: string): number | null {
  const full = path.join(root, "server/routes", routeFile);
  if (!fs.existsSync(full)) return null;
  const src = fs.readFileSync(full, "utf8");
  // Match: limit: z.coerce.number()...max(100)...
  const m = src.match(/limit\s*:\s*z[^\n]*?\.max\((\d+)\)/);
  return m ? parseInt(m[1], 10) : null;
}

// For each client page/api file, find `limit: <n>` literals near a given list-fn name.
function clientLimitsFor(fnName: string): { file: string; value: number }[] {
  const found: { file: string; value: number }[] = [];
  const dirs = ["src/pages/app", "src/lib/api"];
  for (const d of dirs) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      // crude but effective: a call to fnName(...) with a limit: N within ~120 chars
      const re = new RegExp(`${fnName}\\s*\\([^)]*?limit:\\s*(\\d+)`, "gs");
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(src)) !== null) {
        found.push({ file: `${d}/${f}`, value: parseInt(mm[1], 10) });
      }
    }
  }
  return found;
}

// route file → the client function name that hits it
const CONTRACTS: { route: string; clientFn: string }[] = [
  { route: "students.ts", clientFn: "listStudents" },
  { route: "contracts.ts", clientFn: "listContracts" },
];

describe("client↔server limit contracts", () => {
  for (const { route, clientFn } of CONTRACTS) {
    it(`${clientFn} never requests more than /api ${route} allows`, () => {
      const cap = serverLimitCap(route);
      expect(cap, `could not read limit cap from server/routes/${route}`).not.toBeNull();
      const calls = clientLimitsFor(clientFn);
      const violations = calls.filter((c) => c.value > (cap as number));
      expect(
        violations,
        `${clientFn} requests limit > server cap ${cap}: ${violations
          .map((v) => `${v.file} (${v.value})`)
          .join(", ")}`
      ).toEqual([]);
    });
  }
});
