/**
 * @vitest-environment node
 * VM5-08 — pachetul pentru audit (rute reale, PGlite).
 *
 * Cerința: „Pentru audit e important să vadă cererea de plată, PAR, factura — data, suma etc."
 * Auditorul cere o PERIOADĂ, nu o cerere: până acum asta însemna zeci de descărcări separate.
 *
 * Testele verifică ce primește omul în mână: un singur fișier, cu registrul perioadei, dosarul
 * fiecărei cereri și actele originale — și nimic din afara perioadei sau a ariei lui.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parLineItems,
  parAttachments,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() { return testDb; },
  closeDb: async () => {},
}));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantId: string;
let adminId: string;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const e of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

/** Numele fișierelor din ZIP-ul întors de rută. */
async function packageEntries(query: string): Promise<string[]> {
  const res = await app.request(`/api/par/reports/audit-package.zip${query}`);
  if (res.status !== 200) return [`__status_${res.status}`];
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  return Object.keys(zip.files).sort();
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parReportsRoutes } = await import("../routes/parReports");
  app = new Hono();
  app.route("/api/par/reports", parReportsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-audit-pack" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [admin] = await testDb
    .insert(users)
    .values({ tenantId, email: "admin@atic.md", passwordHash: "x", name: "Admin", role: "admin" })
    .returning();
  adminId = admin.id;
  await testDb.insert(parMembers).values({ tenantId, userId: adminId, role: "par_admin" });
  await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId: adminId });

  const mkPar = async (no: string, when: string, cents: number) => {
    const [par] = await testDb.insert(parRequests).values({
      tenantId, payerId: payer.id, requestNo: no, requestedByUserId: adminId, status: "paid",
      currency: "MDL", totalEstimatedCents: cents, totalMdlCents: cents,
      dateOfRequest: new Date(when), submittedAt: new Date(when), paidAt: new Date(when),
      payeeName: "Prestator SRL",
    }).returning();
    await testDb.insert(parLineItems).values({
      tenantId, parId: par.id, position: 1, description: "Servicii", quantity: 1,
      unitPriceCents: cents, lineTotalCents: cents,
    });
    await testDb.insert(parAttachments).values({
      tenantId, parId: par.id, kind: "invoice", fileName: "factura.pdf",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    });
    return par.id;
  };

  await mkPar("PAR-2026-0601", "2026-06-10T00:00:00Z", 120000);
  await mkPar("PAR-2026-0602", "2026-06-20T00:00:00Z", 340000);
  // În afara perioadei cerute mai jos — nu are ce căuta în pachet.
  await mkPar("PAR-2026-0603", "2026-09-01T00:00:00Z", 50000);

  session = { id: adminId, tenantId, role: "admin", email: "admin@atic.md" };
}, 240_000);

describe("GET /api/par/reports/audit-package.zip", () => {
  it("livrează un singur fișier cu registrul, dosarele și actele perioadei", async () => {
    const entries = await packageEntries("?from=2026-06-01&to=2026-06-30");

    expect(entries).toContain("registru.xlsx");
    expect(entries).toContain("CUPRINS.txt");
    expect(entries.some((e) => e.startsWith("dosare/PAR-2026-0601"))).toBe(true);
    expect(entries.some((e) => e.startsWith("documente/PAR-2026-0601/"))).toBe(true);
  }, 120_000);

  it("nu include cereri din afara perioadei", async () => {
    const entries = await packageEntries("?from=2026-06-01&to=2026-06-30");
    expect(entries.some((e) => e.includes("PAR-2026-0603"))).toBe(false);
  }, 120_000);

  it("spune după ce criterii s-a făcut pachetul", async () => {
    const res = await app.request("/api/par/reports/audit-package.zip?from=2026-06-01&to=2026-06-30");
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    const cuprins = await zip.file("CUPRINS.txt")!.async("string");

    expect(cuprins).toContain("Cereri incluse: 2");
    expect(cuprins).toContain("De la: 2026-06-01");
    expect(cuprins).toContain("Până la: 2026-06-30");
  }, 120_000);

  it("un interval fără cereri spune asta, nu întoarce un fișier gol", async () => {
    const res = await app.request("/api/par/reports/audit-package.zip?from=2020-01-01&to=2020-12-31");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("empty");
  }, 120_000);
});
