/**
 * @vitest-environment node
 * Filtrele rapoartelor PAR — INTEGRARE pe rutele reale + PGlite cu toate migrările.
 *
 * Până acum rapoartele știau un singur filtru: perioada. Un manager de proiect nu poate lucra
 * așa („cât s-a plătit pe proiectul X", „doar cererile plătite", „doar EUR"), iar exporturile
 * trebuie să conțină EXACT rândurile din grafic — un export care iese cu alt set de date decât
 * ecranul de deasupra lui e cel mai scump fel de raport greșit: unul care pare corect.
 *
 * Testele cer rutele reale cu filtre reale și verifică cifrele, nu doar statusul 200.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parMembers, parPayers, parProjects, parRequests } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantId: string;
let otherTenantId: string;
let adminId: string;
let projectAId: string;

interface SpendBody { items: { id: string | null; label: string; totalCents: number; paidCents?: number; count: number }[] }

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const get = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as SpendBody };
};

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parReportsRoutes } = await import("../routes/parReports");
  app = new Hono();
  app.route("/api/par/reports", parReportsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-reports" }).returning();
  tenantId = t.id;
  const [admin] = await testDb
    .insert(users)
    .values({ tenantId, email: "admin@atic.md", passwordHash: "x", name: "Irina", role: "admin" })
    .returning();
  adminId = admin.id;
  await testDb.insert(parMembers).values({ tenantId, userId: adminId, role: "par_admin" });

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  const [projectA] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "LED", payerId: payer.id, active: true })
    .returning();
  projectAId = projectA.id;
  const [projectB] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Digital Safeguard", payerId: payer.id, active: true })
    .returning();

  const mkPar = async (v: Partial<typeof parRequests.$inferInsert> & { requestNo: string }) =>
    (await testDb.insert(parRequests).values({
      tenantId,
      requestedByUserId: adminId,
      payerId: payer.id,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "pending_approval",
      endUse: "Servicii",
      currency: "MDL",
      totalEstimatedCents: 100_000,
      totalMdlCents: 100_000,
      dateOfRequest: new Date("2026-03-10T00:00:00Z"),
      ...v,
    }).returning())[0];

  // Proiectul LED: una plătită (200 MDL) și una în aprobare (100 MDL).
  await mkPar({ requestNo: "PAR-0001", projectId: projectAId, status: "paid", totalEstimatedCents: 200_00, totalMdlCents: 200_00, payeeName: "Orange" });
  await mkPar({ requestNo: "PAR-0002", projectId: projectAId, payeeName: "Moldtelecom" });
  // Alt proiect, altă lună, altă monedă.
  await mkPar({ requestNo: "PAR-0003", projectId: projectB.id, currency: "EUR", totalEstimatedCents: 50_00, totalMdlCents: 1000_00, dateOfRequest: new Date("2026-06-15T00:00:00Z"), payeeName: "AWS" });

  // Alt workspace — nu are voie să apară în NICIUN raport.
  const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-reports" }).returning();
  otherTenantId = other.id;
  const [otherUser] = await testDb
    .insert(users).values({ tenantId: otherTenantId, email: "x@alt.md", passwordHash: "x", name: "X", role: "admin" }).returning();
  const [otherPayer] = await testDb.insert(parPayers).values({ tenantId: otherTenantId, name: "Alt SRL" }).returning();
  await testDb.insert(parRequests).values({
    tenantId: otherTenantId, requestNo: "PAR-9999", requestedByUserId: otherUser.id, payerId: otherPayer.id,
    purpose: "execute_payment", chargeTo: "program", status: "paid", endUse: "Secret",
    currency: "MDL", totalEstimatedCents: 999_00, totalMdlCents: 999_00, dateOfRequest: new Date("2026-03-11T00:00:00Z"),
  });

  session = { id: adminId, tenantId, role: "admin", email: "admin@atic.md" };
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("filtrele rapoartelor", () => {
  it("[blocant] fără filtre, raportul pe proiect conține toate proiectele workspace-ului", async () => {
    const { status, body } = await get("/api/par/reports/by-project");
    expect(status).toBe(200);
    const labels = body.items.map((i) => i.label).sort();
    expect(labels).toEqual(["Digital Safeguard", "LED"]);
    expect(body.items.some((i) => i.totalCents === 999_00)).toBe(false); // nimic din alt workspace
  });

  it("[blocant] filtrul pe proiect restrânge raportul la un singur proiect", async () => {
    const { body } = await get(`/api/par/reports/by-project?project_id=${projectAId}`);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].label).toBe("LED");
    expect(body.items[0].count).toBe(2);
  });

  it("[blocant] filtrul pe status lasă doar cererile plătite", async () => {
    const { body } = await get("/api/par/reports/by-project?status=paid");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].label).toBe("LED");
    expect(body.items[0].count).toBe(1);
    expect(body.items[0].totalCents).toBe(200_00);
  });

  it("mai multe statusuri se dau separate prin virgulă", async () => {
    const { body } = await get("/api/par/reports/by-project?status=paid,pending_approval");
    const led = body.items.find((i) => i.label === "LED");
    expect(led?.count).toBe(2);
  });

  it("[blocant] filtrul pe monedă separă cererile în valută", async () => {
    const { body } = await get("/api/par/reports/by-project?currency=EUR");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].label).toBe("Digital Safeguard");
  });

  it("perioada rămâne funcțională alături de celelalte filtre", async () => {
    const { body } = await get("/api/par/reports/by-project?from=2026-06-01&to=2026-06-30");
    expect(body.items.map((i) => i.label)).toEqual(["Digital Safeguard"]);
  });

  it("căutarea liberă prinde beneficiarul, nu doar numărul cererii", async () => {
    const { body } = await get("/api/par/reports/by-project?q=orange");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].count).toBe(1);
  });

  it("un status inventat e ignorat, nu prăbușește raportul", async () => {
    const { status, body } = await get("/api/par/reports/by-project?status=inventat");
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it("[blocant] exportul CSV conține EXACT rândurile filtrate — altfel graficul și fișierul se contrazic", async () => {
    const res = await app.request(`/api/par/reports/export.csv?project_id=${projectAId}&status=paid`);
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // antet + o singură cerere
    expect(lines[1]).toContain("PAR-0001");
    expect(csv).not.toContain("PAR-9999");
  });

  it("filtrele se aplică la fel pe toate dimensiunile (plătitor, buget, aging)", async () => {
    for (const url of ["by-payer", "by-budget", "by-charge-to", "aging"]) {
      const res = await app.request(`/api/par/reports/${url}?project_id=${projectAId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { count: number }[] };
      const total = body.items.reduce((s, i) => s + Number(i.count ?? 0), 0);
      expect(total).toBe(2); // exact cele două cereri ale proiectului LED
    }
  });
});
