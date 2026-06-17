/**
 * FIX-503: Nav-links guard tests.
 *
 * T-FIX-503-1 [blocant] check-nav-links.mjs exits 0 on repaired code
 * T-FIX-503-2 [blocant] check-nav-links.mjs exits 1 on a dead href (fixture test)
 * T-FIX-503-3 [blocant] audit report covers FinNav, BusinessShell, AppShell
 * T-FIX-503-5 [blocant] vercel.json build includes check-nav-links
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { tmpdir } from "os";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/check-nav-links.mjs");

describe("FIX-503: check-nav-links.mjs guard", () => {
  // T-FIX-503-1 [blocant]
  it("T-FIX-503-1: script exits 0 on the repaired codebase", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf-8" });
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/✅.*all nav hrefs are covered/);
  });

  // T-FIX-503-2 [blocant]
  it("T-FIX-503-2: script exits 1 when a dead href is injected (fixture test)", () => {
    // Create a fake FinNav fixture with a dead link
    const fakeFinNav = `
const FIN_NAV = [
  { section: null, items: [
    { id: "home", label: "Home", href: "/app/fin/inexistent" },
  ]},
];
// ─── Role level helper
`;
    const tmpFixture = join(tmpdir(), `fix503-test-finnav-${Date.now()}.tsx`);
    writeFileSync(tmpFixture, fakeFinNav, "utf-8");

    // Also pass a fixture for App.tsx that has NO /app/fin routes
    const fakeApp = `
function Routes() {
  if (path.startsWith("/business/fin/parties")) return null;
  if (path.startsWith("/business")) return null;
  return null;
}
`;
    const tmpAppFixture = join(tmpdir(), `fix503-test-app-${Date.now()}.tsx`);
    writeFileSync(tmpAppFixture, fakeApp, "utf-8");

    const result = spawnSync("node", [SCRIPT], {
      encoding: "utf-8",
      env: {
        ...process.env,
        CHECK_FINNAV_FIXTURE: tmpFixture,
        CHECK_APP_FIXTURE: tmpAppFixture,
        // Use the real BusinessShell and AppShell so only FinNav causes the failure
        CHECK_BUSINESSSHELL_FIXTURE: join(ROOT, "src/components/business/BusinessShell.tsx"),
        CHECK_APPSHELL_FIXTURE: join(ROOT, "src/components/app/AppShell.tsx"),
      },
    });

    // Clean up temp files
    try { unlinkSync(tmpFixture); } catch {}
    try { unlinkSync(tmpAppFixture); } catch {}

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DEAD NAV LINK|dead.*link|no matching route/i);
  });

  // T-FIX-503-5 [blocant]
  it("T-FIX-503-5: vercel.json build includes check-nav-links.mjs", () => {
    const vercelJson = readFileSync(join(ROOT, "vercel.json"), "utf-8");
    expect(vercelJson).toMatch(/check-nav-links\.mjs/);
  });

  it("T-FIX-503-5b: prod-safety.yml CI includes check-nav-links.mjs", () => {
    const yml = readFileSync(join(ROOT, ".github/workflows/prod-safety.yml"), "utf-8");
    expect(yml).toMatch(/check-nav-links/);
  });
});
