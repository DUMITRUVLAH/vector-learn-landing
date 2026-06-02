/**
 * Build/CI gate: every Hono router exported from server/routes/*.ts MUST be referenced in
 * server/app.ts (the single production router). An unmounted route is invisible to unit tests
 * (they import the route module directly) but falls through to the SPA HTML fallback in the real
 * app → the page crashes on JSON.parse('<!doctype …') ("Unexpected token '<'").
 *
 * This is the durable fix for IMPROVEMENTS #1 (the ~41 orphaned routes) — it would have caught
 * the api-keys + webhooks breakage. Fails the build (exit 1) on any orphan.
 *
 * An export can be intentionally unmounted (internal/superseded). Annotate the export line with
 *   // mount-exempt: <reason>
 * to allow-list it explicitly (forces a human to acknowledge each one).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROUTES_DIR = "server/routes";
const APP = readFileSync("server/app.ts", "utf8");

const orphans = [];
const exempt = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith(".ts")) continue;
    const src = readFileSync(p, "utf8");
    const lines = src.split("\n");
    // Match: export const <name> = new Hono(...)   (the router export convention)
    const re = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*new\s+Hono\b/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      const name = m[1];
      const isExempt = [lines[i], lines[i - 1], lines[i - 2], lines[i - 3]]
        .some((l) => (l ?? "").includes("mount-exempt"));
      // referenced in app.ts as an identifier (import + app.route(...) use)
      const referenced = new RegExp(`\\b${name}\\b`).test(APP);
      if (isExempt) exempt.push(`${p}: ${name}`);
      else if (!referenced) orphans.push(`${p}: ${name}`);
    }
  }
}

walk(ROUTES_DIR);

if (exempt.length) {
  console.log(`[check-route-mounts] ${exempt.length} mount-exempt router(s):`);
  for (const e of exempt) console.log(`   - ${e}`);
}
if (orphans.length) {
  console.error(`\n❌ [check-route-mounts] ${orphans.length} Hono router(s) exported but NOT referenced in server/app.ts:`);
  for (const o of orphans) console.error(`   - ${o}`);
  console.error(`\nMount each in server/app.ts (app.route("/api/...", xxxRoutes)) or annotate the`);
  console.error(`export line with "// mount-exempt: <reason>" if it is intentionally unmounted.`);
  process.exit(1);
}
console.log(`✅ [check-route-mounts] all exported Hono routers are mounted in app.ts.`);
