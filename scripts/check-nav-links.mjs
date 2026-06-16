#!/usr/bin/env node
/**
 * check-nav-links.mjs — FIX-503 anti-regression guard
 *
 * Verifies that hrefs in FinDesk/Business nav components resolve to real App.tsx routes.
 * A dead nav-link (href points to no route) falls through to the catch-all RedirectToBusiness
 * and ejects the user — exactly the FIX-501 / FIX-502 bug class.
 *
 * Scope: FinNav, BusinessShell, AppShell (BUSINESS_NAV_GROUPS only).
 * CRM AppShell NAV_GROUPS (/app/*) are excluded — they are a structural split issue
 * tracked separately in SPLIT-401.
 *
 * Exit 0 = all hrefs covered. Exit 1 = dead link(s) found.
 *
 * Usage:
 *   node scripts/check-nav-links.mjs         # check real source
 *   CHECK_NAV_FIXTURE=path/to/fixture.tsx \
 *   CHECK_APP_FIXTURE=path/to/app.tsx \
 *   node scripts/check-nav-links.mjs         # test on fixtures
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const appSrcPath = process.env.CHECK_APP_FIXTURE ?? join(ROOT, "src/App.tsx");

// ─── 1. Extract routes from App.tsx ───────────────────────────────────────────

function extractRoutes(src) {
  const routes = new Set();

  // path.startsWith("X") patterns
  for (const m of src.matchAll(/path\.startsWith\("([^"]+)"\)/g)) {
    routes.add(m[1]);
  }

  // path === "X" patterns
  for (const m of src.matchAll(/path === "([^"]+)"/g)) {
    routes.add(m[1]);
  }

  // path.match(/regex/) patterns — extract literal prefix from common patterns like
  // /^\/business\/fin\/payroll\/runs\/[^/]+/ → /business/fin/payroll/runs/
  for (const m of src.matchAll(/path\.match\(\/\^(\\\/[^$/|[\\]+)/g)) {
    const prefix = m[1].replace(/\\\//g, "/").replace(/[^/a-z0-9-_]/gi, "");
    if (prefix.length > 1) routes.add(prefix);
  }

  return routes;
}

/**
 * Given an href like "/business/fin/payroll" and the set of App.tsx routes,
 * returns true if ANY route covers it:
 *   - route is a prefix of href (route="/business/fin/" covers href="/business/fin/payroll")
 *   - href is a prefix of route (route="/business/fin/parties" covered by href="/business/fin/parties")
 *   - exact match
 *
 * Special: /business/fin/ catch-all (App.tsx line: if (path.startsWith("/business/fin/")))
 * covers all /business/fin/* hrefs.
 */
function isCovered(href, routes) {
  for (const route of routes) {
    if (href === route) return true;
    if (href.startsWith(route)) return true;
    if (route.startsWith(href)) return true;
  }
  return false;
}

// ─── 2. Extract hrefs from a nav component source ─────────────────────────────

function extractHrefs(src, sectionName) {
  const hrefs = [];
  const re = /href:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    hrefs.push({ href: m[1], source: sectionName });
  }
  return hrefs;
}

// ─── 3. Read nav files ────────────────────────────────────────────────────────

function readNav(relPath, envKey) {
  const p = process.env[envKey] ?? join(ROOT, relPath);
  try {
    return readFileSync(p, "utf-8");
  } catch {
    console.error(`[check-nav-links] ERROR: cannot read ${p}`);
    process.exit(1);
  }
}

const appSrc = readFileSync(appSrcPath, "utf-8");
const routes = extractRoutes(appSrc);

// FinNav: all hrefs should be /business/fin/* — we check them all
const finNavSrc = readNav("src/components/fin/FinNav.tsx", "CHECK_FINNAV_FIXTURE");
// Only check the FIN_NAV definition section (before Role level helper)
const finNavDefSection = finNavSrc.includes("// ─── Role level helper")
  ? finNavSrc.slice(0, finNavSrc.indexOf("// ─── Role level helper"))
  : finNavSrc;
const finNavHrefs = extractHrefs(finNavDefSection, "FinNav");

// BusinessShell: all hrefs
const businessShellSrc = readNav("src/components/business/BusinessShell.tsx", "CHECK_BUSINESSSHELL_FIXTURE");
// Extract only NAV_GROUPS section
const businessShellNavSection = businessShellSrc.includes("NAV_GROUPS")
  ? businessShellSrc.slice(0, businessShellSrc.indexOf("/**\n * Pagini publice"))
  : businessShellSrc;
const businessShellHrefs = extractHrefs(businessShellNavSection, "BusinessShell");

// AppShell: only the BUSINESS_NAV_GROUPS section (CRM NAV_GROUPS excluded — SPLIT-401 scope)
const appShellSrc = readNav("src/components/app/AppShell.tsx", "CHECK_APPSHELL_FIXTURE");
const businessNavStart = appShellSrc.indexOf("const BUSINESS_NAV_GROUPS");
const businessNavEnd = appShellSrc.indexOf("/** Flat list");
const appShellBusinessSection = businessNavStart !== -1 && businessNavEnd !== -1
  ? appShellSrc.slice(businessNavStart, businessNavEnd)
  : "";
const appShellBusinessHrefs = extractHrefs(appShellBusinessSection, "AppShell(BUSINESS_NAV_GROUPS)");

// ─── 4. Check all collected hrefs ─────────────────────────────────────────────

const allHrefs = [...finNavHrefs, ...businessShellHrefs, ...appShellBusinessHrefs];
const dead = allHrefs.filter(({ href }) => !isCovered(href, routes));

// ─── 5. Report ────────────────────────────────────────────────────────────────

console.log("[check-nav-links] Checking FinNav + BusinessShell + AppShell(BUSINESS_NAV_GROUPS)...");
console.log(`[check-nav-links] App.tsx routes extracted: ${routes.size}`);
console.log(`[check-nav-links] Nav hrefs checked: ${allHrefs.length}`);

if (dead.length === 0) {
  console.log("✅ [check-nav-links] all nav hrefs are covered by App.tsx routes — no dead links.");
  process.exit(0);
} else {
  console.error(`\n❌ [check-nav-links] ${dead.length} DEAD NAV LINK(S) FOUND:`);
  for (const { href, source } of dead) {
    console.error(`   ${source}: "${href}" — no matching route in App.tsx (will eject user)`);
  }
  console.error(`\nFix: update href to a real App.tsx route, or add the route to App.tsx.`);
  console.error(`See: backlog/specs/FIX-503-app-wide-deadlink-audit-guard.md`);
  process.exit(1);
}
