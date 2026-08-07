/**
 * ITPARK-ROUTE-001 — the web client uses /api/itpark/*.
 *
 * This deliberately stops at the authentication boundary: a 401 proves the
 * route is mounted, whereas a wrong mount returns 404 before requireAuth runs.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("ITPark API mount", () => {
  it("mounts the engagements route under /api/itpark", async () => {
    const appSource = await readFile(join(process.cwd(), "server", "app.ts"), "utf8");

    expect(appSource).toContain('app.route("/api/itpark/engagements", itparkEngagementsRoutes);');
    expect(appSource).not.toContain('app.route("/api/fin/itpark/engagements", itparkEngagementsRoutes);');
  });

  it("keeps the CAEM catalog on the endpoint used by the web client", async () => {
    const appSource = await readFile(join(process.cwd(), "server", "app.ts"), "utf8");
    expect(appSource).toContain('app.route("/api/itpark/caem-codes", itparkCaemRoutes);');
    expect(appSource).not.toContain('app.route("/api/itpark/caem", itparkCaemRoutes);');
  });
});
