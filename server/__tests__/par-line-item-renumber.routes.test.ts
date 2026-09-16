/**
 * @vitest-environment node
 * Numerotarea articolelor (secțiunea 10) după ștergere — INTEGRATION (rute reale, PGlite).
 *
 * De ce există: pozițiile se dădeau ca „max + 1" și nu se atingeau niciodată la ștergere, deci
 * tabelul rămânea cu „4, 5, 8, 9" — lacunele ajungeau și în formularul tipărit, unde un „nr. crt."
 * cu găuri citește ca un document din care lipsesc poziții (Cristina, 16.09.2026).
 *
 * Acoperă:
 *   1. DELETE renumerotează rândurile rămase 1..n, în baza de date.
 *   2. Răspunsul DELETE cară pozițiile noi (clientul ține lista în state).
 *   3. Un articol adăugat DUPĂ ștergere continuă numerotarea fără să sară peste numere.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parMembers, parPayerModules, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let parId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "solicitant@vector.md" });
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

interface LineItem {
  id: string;
  position: number;
  description: string;
}

async function addLine(description: string): Promise<LineItem> {
  const res = await app.request(`/api/par/${parId}/line-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, quantity: 1, unit_price_cents: 10000 }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { line_item: LineItem }).line_item;
}

async function positions(): Promise<{ position: number; description: string }[]> {
  const res = await app.request(`/api/par/${parId}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { line_items: LineItem[] };
  return body.line_items.map((l) => ({ position: l.position, description: l.description }));
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-renumber" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC Test" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "solicitant@vector.md", passwordHash: "x", name: "Ana Solicitanta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "requestor" });

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0201",
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "draft",
      payerId: payer.id,
      endUse: "Abonamente pentru echipa de comunicare",
      currency: "MDL",
      totalEstimatedCents: 0,
      dateOfRequest: new Date("2026-09-16T00:00:00Z"),
    })
    .returning();
  parId = par.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Secțiunea 10: numerotarea articolelor după ștergere", () => {
  it("[blocant] DELETE renumerotează rândurile rămase 1..n (fără lacune)", async () => {
    const a = await addLine("Mailchimp — abonament");
    const b = await addLine("Canva — abonament");
    const c = await addLine("Zoom — abonament");
    const d = await addLine("Notion — abonament");
    expect([a, b, c, d].map((l) => l.position)).toEqual([1, 2, 3, 4]);

    const res = await app.request(`/api/par/${parId}/line-items/${b.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { line_items: { id: string; position: number }[] };
    // Răspunsul cară pozițiile noi: altfel interfața ar afișa mai departe „1, 3, 4".
    expect(body.line_items).toEqual([
      { id: a.id, position: 1 },
      { id: c.id, position: 2 },
      { id: d.id, position: 3 },
    ]);

    expect(await positions()).toEqual([
      { position: 1, description: "Mailchimp — abonament" },
      { position: 2, description: "Zoom — abonament" },
      { position: 3, description: "Notion — abonament" },
    ]);
  });

  it("[blocant] articolul adăugat după ștergere primește următorul număr, nu unul sărit", async () => {
    const e = await addLine("Figma — abonament");
    expect(e.position).toBe(4);
    expect((await positions()).map((l) => l.position)).toEqual([1, 2, 3, 4]);
  });

  it("ștergerea ULTIMULUI rând nu atinge pozițiile celorlalte", async () => {
    const before = await positions();
    const res = await app.request(`/api/par/${parId}`);
    const { line_items } = (await res.json()) as { line_items: LineItem[] };
    const last = line_items[line_items.length - 1];

    const del = await app.request(`/api/par/${parId}/line-items/${last.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await positions()).toEqual(before.slice(0, -1));
  });
});
