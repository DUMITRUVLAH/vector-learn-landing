/**
 * @vitest-environment node
 * PAR-DRIVE: ruta de cron e singura fără sesiune — trebuie să refuze orice fără secret.
 * Un endpoint deschis aici ar lăsa pe oricine să pornească sincronizări pe toate workspace-urile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runWeeklyDriveSync = vi.fn(async () => []);
vi.mock("../lib/par/driveSync", () => ({
  runWeeklyDriveSync: (...a: unknown[]) => runWeeklyDriveSync(...(a as [])),
  runDriveSyncForTenant: vi.fn(),
}));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u", tenantId: "t", role: "admin", email: "a@a.md" });
    await next();
  },
}));

import { Hono } from "hono";
import { parDriveCronRoutes } from "../routes/parDrive";

const app = new Hono();
app.route("/api/par/drive/cron", parDriveCronRoutes);

beforeEach(() => {
  runWeeklyDriveSync.mockClear();
  delete process.env.CRON_SECRET;
});

describe("GET /api/par/drive/cron/run-weekly", () => {
  it("[blocant] 503 când CRON_SECRET nu e setat — nu rulează niciodată deschis", async () => {
    const res = await app.request("/api/par/drive/cron/run-weekly");
    expect(res.status).toBe(503);
    expect(runWeeklyDriveSync).not.toHaveBeenCalled();
  });

  it("[blocant] 401 fără Bearer-ul corect", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect((await app.request("/api/par/drive/cron/run-weekly")).status).toBe(401);
    const wrong = await app.request("/api/par/drive/cron/run-weekly", {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status).toBe(401);
    expect(runWeeklyDriveSync).not.toHaveBeenCalled();
  });

  it("rulează cu secretul corect", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await app.request("/api/par/drive/cron/run-weekly", {
      headers: { authorization: "Bearer s3cr3t" },
    });
    expect(res.status).toBe(200);
    expect(runWeeklyDriveSync).toHaveBeenCalledTimes(1);
  });
});
