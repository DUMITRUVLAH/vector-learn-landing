/**
 * @vitest-environment node
 * STOC PE PRODUSE, SCĂZUT LA VÂNZARE — INTEGRATION.
 *
 * Cererea clientului: „produsele să aibă stoc, iar când se vinde un produs, stocul să scadă".
 *
 * Testele de aici apără cele patru decizii care fac diferența între o scădere corectă și una
 * care golește depozitul pe hârtie:
 *  1. stocul scade o SINGURĂ dată per oportunitate, oricât de mult ar fi târâtă prin kanban;
 *  2. retragerea vânzării întoarce cantitatea, fără să strice costul mediu ponderat;
 *  3. stocul insuficient NU blochează câștigarea afacerii — o semnalează;
 *  4. stocul e cel din inventarul FinDesk, nu o a doua cantitate ținută de CRM.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, finInventoryItems, finStockMovements } from "../db/schema";
import { leads, leadInteractions } from "../db/schema/leads";
import { crmProducts } from "../db/schema/crmProducts";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { inAppNotifications } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
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
let userId: string;

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

/** Produs cu stoc pornit prin API, ca în interfață. Întoarce id-ul produsului și al articolului. */
async function produsCuStoc(name: string, initialQty: number, minQtyAlert = 0) {
  const created = await app.request("/api/crm/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, listPriceCents: 100_00 }),
  });
  const product = (await created.json()) as { id: string };
  const res = await app.request(`/api/crm/products/${product.id}/stock/enable`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initialQty, unitCostCents: 50_00, minQtyAlert }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { item: { id: string } };
  return { productId: product.id, itemId: body.item.id };
}

async function leadPe(stage: string, productId: string | null, productQty = 1) {
  const res = await app.request("/api/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Client test", stage, productId, productQty }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

async function mutaPe(leadId: string, stage: string) {
  return app.request(`/api/crm/leads/${leadId}/stage`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, lostReason: stage === "pierdut" ? "preț" : undefined }),
  });
}

async function stoc(itemId: string) {
  const [item] = await testDb.select().from(finInventoryItems).where(eq(finInventoryItems.id, itemId));
  return item;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  const { crmProductsRoutes } = await import("../routes/crmProducts");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);
  app.route("/api/crm/products", crmProductsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-stoc" }).returning();
  tenantId = t.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;

  await testDb.insert(crmPipelineStages).values([
    { tenantId, key: "nou", label: "Lead nou", orderIndex: 0 },
    { tenantId, key: "oferta", label: "Ofertă", orderIndex: 1 },
    { tenantId, key: "castigat", label: "Câștigat", orderIndex: 2, isWon: true },
    { tenantId, key: "pierdut", label: "Pierdut", orderIndex: 3, isLost: true },
  ]);

  session = { id: userId, tenantId, role: "admin", email: "ana@eco.md" };
});

beforeEach(() => {
  session = { id: userId, tenantId, role: "admin", email: "ana@eco.md" };
});

describe("Stoc pe produsele din CRM", () => {
  it("pornirea urmăririi creează articolul de inventar cu cantitatea inițială", async () => {
    const { productId, itemId } = await produsCuStoc("Panou 550W", 40);

    expect((await stoc(itemId)).qtyOnHand).toBe(40);

    const lista = await app.request("/api/crm/products");
    const body = (await lista.json()) as { items: { id: string; tracksStock: boolean; qtyOnHand: number }[] };
    const rand = body.items.find((p) => p.id === productId)!;
    expect(rand.tracksStock).toBe(true);
    expect(rand.qtyOnHand).toBe(40);
  });

  it("câștigarea unei oportunități scade din stoc exact cantitatea vândută", async () => {
    const { productId, itemId } = await produsCuStoc("Invertor 10kW", 12);
    const lead = await leadPe("oferta", productId, 3);

    const res = await mutaPe(lead.id, "castigat");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stock: { status: string; qty: number; remaining: number } };
    expect(body.stock.status).toBe("decremented");
    expect(body.stock.qty).toBe(3);
    expect(body.stock.remaining).toBe(9);

    expect((await stoc(itemId)).qtyOnHand).toBe(9);

    // Mișcarea rămâne în jurnalul de stoc, ca orice ieșire — cu referință spre lead.
    const movements = await testDb
      .select()
      .from(finStockMovements)
      .where(and(eq(finStockMovements.itemId, itemId), eq(finStockMovements.movementType, "sale")));
    expect(movements).toHaveLength(1);
    expect(movements[0].qty).toBe(3);
    expect(movements[0].reference).toBe(`CRM-${lead.id.slice(0, 8)}`);
  });

  it("nu scade de două ori dacă leadul e mutat iar în etapa de câștig", async () => {
    const { productId, itemId } = await produsCuStoc("Baterie 5kWh", 10);
    const lead = await leadPe("oferta", productId, 2);

    await mutaPe(lead.id, "castigat");
    expect((await stoc(itemId)).qtyOnHand).toBe(8);

    // Aceeași etapă, din nou (dublu-click, resincronizare de kanban): nimic nu se mai mișcă.
    await mutaPe(lead.id, "castigat");
    expect((await stoc(itemId)).qtyOnHand).toBe(8);
  });

  it("retragerea vânzării întoarce cantitatea și lasă costul mediu neatins", async () => {
    const { productId, itemId } = await produsCuStoc("Pompă de căldură", 6);
    const lead = await leadPe("oferta", productId, 2);

    await mutaPe(lead.id, "castigat");
    const dupaVanzare = await stoc(itemId);
    expect(dupaVanzare.qtyOnHand).toBe(4);

    const res = await mutaPe(lead.id, "oferta");
    const body = (await res.json()) as { stock: { status: string; remaining: number } };
    expect(body.stock.status).toBe("restored");

    const dupaRetragere = await stoc(itemId);
    expect(dupaRetragere.qtyOnHand).toBe(6);
    expect(dupaRetragere.avgCostCents).toBe(dupaVanzare.avgCostCents);

    // Ancora s-a eliberat: o vânzare ulterioară a aceluiași lead scade din nou.
    await mutaPe(lead.id, "castigat");
    expect((await stoc(itemId)).qtyOnHand).toBe(4);
  });

  it("stocul insuficient NU blochează câștigarea afacerii, dar o semnalează", async () => {
    const { productId, itemId } = await produsCuStoc("Structură pe acoperiș", 1);
    const lead = await leadPe("oferta", productId, 5);

    const res = await mutaPe(lead.id, "castigat");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stage: string;
      stock: { status: string; requested: number; available: number };
    };
    // Afacerea e câștigată chiar dacă depozitul e în urmă cu recepțiile.
    expect(body.stage).toBe("castigat");
    expect(body.stock.status).toBe("insufficient");
    expect(body.stock.requested).toBe(5);
    expect(body.stock.available).toBe(1);

    // Stocul rămâne neatins — nu se scade parțial și nu se duce în negativ.
    expect((await stoc(itemId)).qtyOnHand).toBe(1);

    // Lipsa se vede: urmă în istoricul leadului + notificare, nu o tăcere.
    const urme = await testDb
      .select()
      .from(leadInteractions)
      .where(and(eq(leadInteractions.leadId, lead.id), eq(leadInteractions.type, "system")));
    expect(urme.some((i) => (i.body ?? "").includes("Stoc insuficient"))).toBe(true);

    const notificari = await testDb
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.tenantId, tenantId));
    expect(notificari.some((n) => n.kind === "crm_stock_insufficient")).toBe(true);
  });

  it("produsul fără urmărire de stoc (serviciu) nu produce nicio mișcare", async () => {
    const created = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Consultanță energetică", listPriceCents: 300_00 }),
    });
    const product = (await created.json()) as { id: string };
    const lead = await leadPe("oferta", product.id, 4);

    const res = await mutaPe(lead.id, "castigat");
    const body = (await res.json()) as { stock: { status: string } };
    expect(body.stock.status).toBe("noop");

    const [row] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(row.stockMovementId).toBeNull();
  });

  it("corecția de cantitate urcă și coboară stocul, dar nu sub zero", async () => {
    const { productId, itemId } = await produsCuStoc("Cablu solar", 20);

    const plus = await app.request(`/api/crm/products/${productId}/stock/adjust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: 30, unitCostCents: 10_00, notes: "recepție" }),
    });
    expect(plus.status).toBe(200);
    expect((await stoc(itemId)).qtyOnHand).toBe(50);

    const minus = await app.request(`/api/crm/products/${productId}/stock/adjust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -5, notes: "inventar" }),
    });
    expect(minus.status).toBe(200);
    expect((await stoc(itemId)).qtyOnHand).toBe(45);

    const prea = await app.request(`/api/crm/products/${productId}/stock/adjust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -100 }),
    });
    expect(prea.status).toBe(422);
    expect((await stoc(itemId)).qtyOnHand).toBe(45);
  });

  it("stocul altui workspace nu se vede și nu se atinge", async () => {
    const { productId } = await produsCuStoc("Produs al firmei A", 10);

    const [altTenant] = await testDb
      .insert(tenants)
      .values({ name: "Altă firmă", slug: `alta-${Date.now()}` })
      .returning();
    const [altUser] = await testDb
      .insert(users)
      .values({ tenantId: altTenant.id, email: "x@alta.md", passwordHash: "x", name: "X", role: "admin" })
      .returning();
    session = { id: altUser.id, tenantId: altTenant.id, role: "admin", email: "x@alta.md" };

    // 404, nu 403: existența produsului altui client nu se confirmă.
    const res = await app.request(`/api/crm/products/${productId}/stock/adjust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -10 }),
    });
    expect(res.status).toBe(404);

    const lista = await app.request("/api/crm/products");
    const body = (await lista.json()) as { items: { id: string }[] };
    expect(body.items.some((p) => p.id === productId)).toBe(false);
  });

  it("oprirea urmăririi lasă jurnalul intact, dar produsul nu mai scade stoc", async () => {
    const { productId, itemId } = await produsCuStoc("Panou 450W", 8);
    const lead = await leadPe("oferta", productId, 1);
    await mutaPe(lead.id, "castigat");
    expect((await stoc(itemId)).qtyOnHand).toBe(7);

    const off = await app.request(`/api/crm/products/${productId}/stock/disable`, { method: "POST" });
    expect(off.status).toBe(200);

    const altLead = await leadPe("oferta", productId, 2);
    await mutaPe(altLead.id, "castigat");
    // Articolul de inventar și mișcarea veche rămân — doar legătura a dispărut.
    expect((await stoc(itemId)).qtyOnHand).toBe(7);
    const movements = await testDb
      .select()
      .from(finStockMovements)
      .where(eq(finStockMovements.itemId, itemId));
    expect(movements.length).toBeGreaterThan(0);
  });

  it("alerta de stoc scăzut ajunge la om când vânzarea coboară sub prag", async () => {
    const { productId } = await produsCuStoc("Contor inteligent", 4, 3);
    const lead = await leadPe("oferta", productId, 2);
    await mutaPe(lead.id, "castigat");

    const notificari = await testDb
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.tenantId, tenantId));
    expect(notificari.some((n) => n.kind === "crm_stock_low")).toBe(true);
  });
});
