/**
 * FIX-501: FinNav dead-links guard tests.
 *
 * These tests verify that no href in FinNav.tsx points to /app/fin/* (dead routes),
 * and that all hrefs match real /business/fin/* routes defined in App.tsx.
 *
 * T-FIX-501-1 [blocant] grep /app/fin in FinNav → 0 results
 * T-FIX-501-2 [blocant] every href has a matching route in App.tsx
 * T-FIX-501-3 [blocant] all links are /business/fin/*
 * T-FIX-501-4 [normal]  active link logic uses /business/fin paths
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

function readSrc(rel: string) {
  return readFileSync(join(SRC, rel), "utf-8");
}

const finNavSrc = readSrc("components/fin/FinNav.tsx");
const appTsxSrc = readSrc("App.tsx");

// Extract all hrefs from FIN_NAV entries — match href: "..." patterns
function extractFinNavHrefs(src: string): string[] {
  const hrefs: string[] = [];
  // Match href: "/..." in FIN_NAV const definition (before ROLE_LEVEL)
  const navSection = src.slice(0, src.indexOf("// ─── Role level helper"));
  const re = /href:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(navSection)) !== null) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

// Extract route prefixes from App.tsx — path.startsWith("X") and path === "X" and path.match patterns
function extractAppRoutes(src: string): string[] {
  const routes: string[] = [];
  // startsWith patterns
  const swRe = /path\.startsWith\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = swRe.exec(src)) !== null) {
    routes.push(m[1]);
  }
  // === patterns
  const eqRe = /path === "([^"]+)"/g;
  while ((m = eqRe.exec(src)) !== null) {
    routes.push(m[1]);
  }
  return routes;
}

const hrefs = extractFinNavHrefs(finNavSrc);
const appRoutes = extractAppRoutes(appTsxSrc);

describe("FIX-501: FinNav hrefs are all /business/fin/* (no dead /app/fin/* links)", () => {
  // T-FIX-501-1 [blocant]
  it("T-FIX-501-1: no href starts with /app/fin in FinNav FIN_NAV definition", () => {
    // Check the FIN_NAV section only (before Role level helper comment)
    const navSection = finNavSrc.slice(0, finNavSrc.indexOf("// ─── Role level helper"));
    const matches = navSection.match(/href:\s*"\/app\/fin/g);
    expect(matches).toBeNull();
  });

  // T-FIX-501-3 [blocant]
  it("T-FIX-501-3: all hrefs in FIN_NAV are /business/fin/* paths", () => {
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/business\/fin\//);
    }
  });

  // T-FIX-501-2 [blocant]
  it("T-FIX-501-2: every href has a matching route in App.tsx (startsWith or ===)", () => {
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // A route covers the href if any route prefix is a prefix of the href, OR
      // the href is a prefix of a route that uses startsWith (e.g. /business/fin/ covered by /business/fin/)
      const covered = appRoutes.some((route) => {
        // route startsWith href — route is more specific than href
        // OR href startsWith route — href is under this route's prefix
        return route.startsWith(href) || href.startsWith(route);
      });
      expect(covered, `href "${href}" has no matching route in App.tsx`).toBe(true);
    }
  });

  // T-FIX-501-4 [normal]
  it("T-FIX-501-4: active-link logic in FinNav uses /business/fin paths (not /app/fin)", () => {
    // Check the active= line in the component — should not reference /app/fin
    const componentSection = finNavSrc.slice(finNavSrc.indexOf("// ─── Component"));
    expect(componentSection).not.toMatch(/\/app\/fin/);
  });
});
