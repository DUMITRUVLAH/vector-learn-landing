/**
 * @vitest-environment node
 *
 * Aprobatorii șterși nu se mai întorc în matricea DOA.
 *
 * De ce există: DELETE /api/par/doa/:id dezactivează rândul (soft delete), dar GET întorcea și
 * rândurile inactive. Ecranul de setări îi arăta din nou pe aprobatorii eliminați, iar salvarea
 * regulii (care șterge rândurile vechi și le recreează din ce vede pe ecran) îi scria înapoi ca
 * rânduri ACTIVE — la fiecare salvare lista creștea, cu aceleași persoane de mai multe ori.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parDoaMatrix, parMembers, parPayerModules, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "admin", email: "violeta@atic.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

/** Un pas din lanțul de aprobare, exact cum îl creează ecranul de setări. */
async function doaRow(step: number, label: string) {
  const res = await app.request("/api/par/doa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payerId,
      minAmountCents: 0,
      step,
      approverRoleLabel: label,
      approverUserId: userId,
      approvalMode: "sequential",
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

const listRows = async () => {
  const res = await app.request("/api/par/doa");
  expect(res.status).toBe(200);
  return ((await res.json()) as { rows: { id: string; approverRoleLabel: string }[] }).rows;
};

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parDoaRoutes } = await import("../routes/parDoa");
  app = new Hono();
  app.route("/api/par/doa", parDoaRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-doa-soft-delete" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "violeta@atic.md", passwordHash: "x", name: "Violeta", role: "admin" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "par_admin" });
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(parDoaMatrix).where(eq(parDoaMatrix.tenantId, tenantId));
});

describe("GET /api/par/doa — rândurile dezactivate", () => {
  it("[blocant] un rând șters nu mai apare în listă", async () => {
    await doaRow(1, "Ana Chirita");
    const bob = await doaRow(2, "Irina Oriol");

    expect(await app.request(`/api/par/doa/${bob.id}`, { method: "DELETE" })).toMatchObject({ status: 200 });

    const rows = await listRows();
    expect(rows.map((r) => r.approverRoleLabel)).toEqual(["Ana Chirita"]);
  });

  it("[blocant] ștergerea rămâne ștearsă după re-salvarea regulii", async () => {
    // Exact secvența din ecran: trei aprobatori, îl scoți pe al doilea, apoi salvezi regula —
    // adică ștergi ce era și recreezi din ce e pe ecran. Cel scos nu are voie să reapară.
    const first = await doaRow(1, "Ana Chirita");
    const second = await doaRow(2, "Irina Oriol");
    const third = await doaRow(3, "Ana Chirita");

    await app.request(`/api/par/doa/${second.id}`, { method: "DELETE" });

    const visible = await listRows();
    for (const r of visible) await app.request(`/api/par/doa/${r.id}`, { method: "DELETE" });
    await doaRow(1, "Ana Chirita");
    await doaRow(2, "Ana Chirita");

    const rows = await listRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.approverRoleLabel)).toEqual(["Ana Chirita", "Ana Chirita"]);
    expect(rows.map((r) => r.id)).not.toContain(first.id);
    expect(rows.map((r) => r.id)).not.toContain(second.id);
    expect(rows.map((r) => r.id)).not.toContain(third.id);
  });
});
