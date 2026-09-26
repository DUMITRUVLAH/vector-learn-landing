/**
 * CRM Faza 1 — Produse API
 *
 * Mounted at /api/crm/products (app.ts: app.route("/api/crm/products", crmProductsRoutes))
 *
 * GET  /api/crm/products            — listă (implicit doar active; ?includeInactive=1 pentru toate)
 * POST /api/crm/products            — creare (409 sku_taken dacă SKU-ul e deja folosit în tenant)
 * PATCH /api/crm/products/:id       — actualizare parțială
 * POST /api/crm/products/:id/archive — arhivează (isActive=false)
 * POST /api/crm/products/:id/restore — dezarhivează (isActive=true)
 * POST /api/crm/products/:id/stock/enable  — pornește urmărirea stocului (migrarea 0177)
 * POST /api/crm/products/:id/stock/adjust  — corecție de cantitate (recepție / inventar)
 * POST /api/crm/products/:id/stock/disable — oprește urmărirea (articolul de inventar rămâne)
 * POST /api/crm/products/:id/stock/threshold — schimbă pragul de alertă „stoc scăzut"
 *
 * STOCUL NU stă aici. Produsul se leagă de un articol de inventar FinDesk
 * (`fin_inventory_items`), unde există deja cantitate, cost mediu ponderat și jurnal de
 * mișcări — vezi server/lib/crm/productStock.ts pentru motiv și pentru scăderea automată
 * la câștigarea unei oportunități.
 *
 * NU se șterge niciodată fizic un produs: un produs arhivat poate fi deja referit de istoricul
 * de vânzări/oferte, iar un DELETE ar rupe acele înregistrări. Arhivarea doar îl scoate din
 * lista implicită.
 *
 * IMPORTANT: `../db/schema/crmProducts` e definit separat (vezi task-ul de integrare) — acest
 * fișier presupune forma descrisă acolo (id, tenantId, sku, name, category, description, unit,
 * listPriceCents, currency, vatPercent, isActive, orderIndex, createdAt, updatedAt).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { crmProducts } from "../db/schema/crmProducts";
import { finInventoryItems } from "../db/schema";
import { recordStockMovement } from "../lib/finInventoryMovements";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";

export const crmProductsRoutes = new Hono<{ Variables: AuthVariables }>();
crmProductsRoutes.use("/*", requireAuth);
// Cataloagele sunt prețurile firmei: se citesc de oricine lucrează în CRM, se SCHIMBĂ doar de
// cine administrează (matricea din server/lib/crm/permissions.ts).
crmProductsRoutes.post("/*", requireCrmPermission("products.manage"));
crmProductsRoutes.patch("/*", requireCrmPermission("products.manage"));
crmProductsRoutes.delete("/*", requireCrmPermission("products.manage"));

// ─── Validation schemas ───────────────────────────────────────────────────────

const productFieldsSchema = z.object({
  name: z.string().min(2, "Denumirea este obligatorie (minim 2 caractere)"),
  sku: z.string().max(60).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  description: z.string().optional().nullable(),
  unit: z.string().max(30).optional(),
  listPriceCents: z.number().int().min(0).optional(),
  currency: z.string().max(8).optional(),
  // Plafon 100, ca la rândurile manuale din oferte (`crmDocuments`): un TVA de 250% nu există, iar
  // din catalog s-ar propaga în fiecare ofertă care folosește produsul.
  vatPercent: z.number().min(0).max(100, "TVA-ul nu poate depăși 100%").optional(),
  orderIndex: z.number().int().optional(),
});

const createProductSchema = productFieldsSchema;
const updateProductSchema = productFieldsSchema.partial();

/** SKU gol/absent nu intră în verificarea de unicitate — doar un SKU real poate coliza. */
async function skuTaken(tenantId: string, sku: string, excludeId?: string): Promise<boolean> {
  const conditions = [eq(crmProducts.tenantId, tenantId), eq(crmProducts.sku, sku)];
  if (excludeId) conditions.push(ne(crmProducts.id, excludeId));
  const [row] = await db
    .select({ id: crmProducts.id })
    .from(crmProducts)
    .where(and(...conditions));
  return !!row;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

crmProductsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const includeInactive = c.req.query("includeInactive") === "1";

  const conditions = [eq(crmProducts.tenantId, user.tenantId)];
  if (!includeInactive) conditions.push(eq(crmProducts.isActive, true));

  // LEFT JOIN, nu o a doua cerere: lista de produse e ecranul pe care omul decide ce mai poate
  // vinde, iar „câte mai am" trebuie să vină odată cu prețul, nu după el.
  const rows = await db
    .select({
      product: crmProducts,
      qtyOnHand: finInventoryItems.qtyOnHand,
      minQtyAlert: finInventoryItems.minQtyAlert,
      avgCostCents: finInventoryItems.avgCostCents,
    })
    .from(crmProducts)
    .leftJoin(
      finInventoryItems,
      and(
        eq(finInventoryItems.id, crmProducts.inventoryItemId),
        eq(finInventoryItems.tenantId, user.tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(asc(crmProducts.orderIndex), asc(crmProducts.name));

  const items = rows.map((r) => ({
    ...r.product,
    // `tracksStock` e fals și când legătura a rămas suspendată (articol șters manual din bază):
    // mai bine „fără stoc" decât o cantitate inventată.
    tracksStock: r.qtyOnHand !== null,
    qtyOnHand: r.qtyOnHand,
    minQtyAlert: r.minQtyAlert,
    avgCostCents: r.avgCostCents,
    lowStock: r.qtyOnHand !== null && (r.minQtyAlert ?? 0) > 0 && r.qtyOnHand <= (r.minQtyAlert ?? 0),
  }));

  return c.json({ items });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmProductsRoutes.post("/", zValidator("json", createProductSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if (body.sku && (await skuTaken(user.tenantId, body.sku))) {
    return c.json({ error: "sku_taken" }, 409);
  }

  const values: Partial<typeof crmProducts.$inferInsert> & { tenantId: string; name: string } = {
    tenantId: user.tenantId,
    name: body.name,
  };
  if (body.sku !== undefined) values.sku = body.sku;
  if (body.category !== undefined) values.category = body.category;
  if (body.description !== undefined) values.description = body.description;
  if (body.unit !== undefined) values.unit = body.unit;
  if (body.listPriceCents !== undefined) values.listPriceCents = body.listPriceCents;
  if (body.currency !== undefined) values.currency = body.currency;
  // Coloana e `numeric` (drizzle o expune ca string) — vine din API ca number, se scrie ca string.
  if (body.vatPercent !== undefined) values.vatPercent = String(body.vatPercent);
  if (body.orderIndex !== undefined) values.orderIndex = body.orderIndex;

  const [row] = await db.insert(crmProducts).values(values).returning();
  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmProductsRoutes.patch("/:id", zValidator("json", updateProductSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmProducts.id })
    .from(crmProducts)
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (body.sku && (await skuTaken(user.tenantId, body.sku, id))) {
    return c.json({ error: "sku_taken" }, 409);
  }

  const updates: Partial<typeof crmProducts.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.sku !== undefined) updates.sku = body.sku;
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.listPriceCents !== undefined) updates.listPriceCents = body.listPriceCents;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.vatPercent !== undefined) updates.vatPercent = String(body.vatPercent);
  if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex;

  const [row] = await db
    .update(crmProducts)
    .set(updates)
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── POST /:id/archive ────────────────────────────────────────────────────────

crmProductsRoutes.post("/:id/archive", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .update(crmProducts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// ─── POST /:id/restore ────────────────────────────────────────────────────────

crmProductsRoutes.post("/:id/restore", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .update(crmProducts)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// ─── Stoc ─────────────────────────────────────────────────────────────────────
//
// Trei rute subțiri peste inventarul FinDesk. Omul din vânzări nu trebuie să știe că modulul
// de contabilitate există ca să răspundă la „câte mai am pe stoc"; contabilul nu trebuie să
// primească un al doilea stoc, ținut separat de CRM.

const enableStockSchema = z.object({
  /** Cantitatea existentă acum în depozit. 0 = se pornește urmărirea de la zero. */
  initialQty: z.number().int().min(0).default(0),
  /** Costul unitar de achiziție, în bani. Intră în costul mediu ponderat al articolului. */
  unitCostCents: z.number().int().min(0).default(0),
  /** Sub cât se dă alerta de stoc scăzut. 0 = fără alertă. */
  minQtyAlert: z.number().int().min(0).default(0),
});

const adjustStockSchema = z.object({
  /** Diferența, cu semn: +10 la o recepție, -3 la o pierdere sau la un inventar în minus. */
  delta: z.number().int().refine((v) => v !== 0, { message: "Corecția nu poate fi zero" }),
  /** Doar la intrări: costul unitar al lotului. Fără el, cantitatea intră la costul mediu curent. */
  unitCostCents: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

async function productOfTenant(tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(crmProducts)
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, tenantId)));
  return row ?? null;
}

// ─── POST /:id/stock/enable ───────────────────────────────────────────────────

crmProductsRoutes.post("/:id/stock/enable", zValidator("json", enableStockSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const product = await productOfTenant(user.tenantId, id);
  if (!product) return c.json({ error: "not_found" }, 404);

  // Deja legat → doar întoarcem starea. A doua apăsare pe „urmărește stocul" nu are voie să
  // creeze un al doilea articol de inventar pentru același produs.
  if (product.inventoryItemId) {
    const [existing] = await db
      .select()
      .from(finInventoryItems)
      .where(
        and(eq(finInventoryItems.id, product.inventoryItemId), eq(finInventoryItems.tenantId, user.tenantId))
      );
    if (existing) return c.json({ product, item: existing });
  }

  const [item] = await db
    .insert(finInventoryItems)
    .values({
      tenantId: user.tenantId,
      name: product.name,
      sku: product.sku ? product.sku.slice(0, 50) : null,
      // Coloana din inventar e mai scurtă decât cea din catalog (varchar 20 vs 30).
      unit: (product.unit || "buc").slice(0, 20),
      description: product.description ?? null,
      minQtyAlert: body.minQtyAlert,
    })
    .returning();

  const [updated] = await db
    .update(crmProducts)
    .set({ inventoryItemId: item.id, updatedAt: new Date() })
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)))
    .returning();

  // Cantitatea de pornire intră ca achiziție, nu ca simplă cifră scrisă în coloană: așa are
  // dată, autor și cost în jurnal, iar valoarea stocului din contabilitate rămâne corectă.
  let qtyOnHand = 0;
  if (body.initialQty > 0) {
    const result = await recordStockMovement({
      tenantId: user.tenantId,
      itemId: item.id,
      movementType: "purchase",
      qty: body.initialQty,
      unitCostCents: body.unitCostCents,
      reference: `CRM-INIT`,
      notes: `Stoc inițial la pornirea urmăririi din CRM`,
      movedBy: user.id,
    });
    if (result.ok) qtyOnHand = result.newQtyOnHand;
  }

  return c.json({ product: updated, item: { ...item, qtyOnHand } }, 201);
});

// ─── POST /:id/stock/adjust ───────────────────────────────────────────────────

crmProductsRoutes.post("/:id/stock/adjust", zValidator("json", adjustStockSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const product = await productOfTenant(user.tenantId, id);
  if (!product) return c.json({ error: "not_found" }, 404);
  if (!product.inventoryItemId) return c.json({ error: "stock_not_tracked" }, 409);

  // O intrare CU cost e o achiziție (recalculează costul mediu); una fără cost, sau o ieșire,
  // e o ajustare de inventar — mișcă doar cantitatea, lasă costul mediu neatins.
  const isPurchase = body.delta > 0 && body.unitCostCents !== undefined;
  const result = await recordStockMovement({
    tenantId: user.tenantId,
    itemId: product.inventoryItemId,
    movementType: isPurchase ? "purchase" : "adjustment",
    qty: body.delta,
    unitCostCents: body.unitCostCents,
    reference: "CRM-AJUST",
    notes: body.notes ?? null,
    movedBy: user.id,
  });

  if (!result.ok) {
    if (result.error === "item_not_found") return c.json({ error: "not_found" }, 404);
    return c.json(
      { error: "insufficient_stock", available: result.available, requested: result.requested },
      422
    );
  }

  return c.json({ qtyOnHand: result.newQtyOnHand, avgCostCents: result.newAvgCostCents });
});

const thresholdSchema = z.object({
  /** Sub cât (inclusiv) produsul apare cu roșu și pleacă alerta. 0 = fără alertă. */
  minQtyAlert: z.number().int().min(0).max(1_000_000),
});

// ─── POST /:id/stock/threshold ────────────────────────────────────────────────

// Pragul se alege la pornire, dar se află abia din vânzări: fără ruta asta, singurul mod de a-l
// muta era să oprești urmărirea și s-o pornești iar — adică un articol de inventar nou, gol.
crmProductsRoutes.post("/:id/stock/threshold", zValidator("json", thresholdSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const product = await productOfTenant(user.tenantId, id);
  if (!product) return c.json({ error: "not_found" }, 404);
  if (!product.inventoryItemId) return c.json({ error: "stock_not_tracked" }, 409);

  const [item] = await db
    .update(finInventoryItems)
    .set({ minQtyAlert: body.minQtyAlert, updatedAt: new Date() })
    .where(
      and(eq(finInventoryItems.id, product.inventoryItemId), eq(finInventoryItems.tenantId, user.tenantId))
    )
    .returning({ qtyOnHand: finInventoryItems.qtyOnHand, minQtyAlert: finInventoryItems.minQtyAlert });
  if (!item) return c.json({ error: "not_found" }, 404);

  return c.json(item);
});

// ─── POST /:id/stock/disable ──────────────────────────────────────────────────

crmProductsRoutes.post("/:id/stock/disable", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const product = await productOfTenant(user.tenantId, id);
  if (!product) return c.json({ error: "not_found" }, 404);

  // Doar dezlegăm. Articolul de inventar și mișcările lui rămân: sunt registrul unei perioade
  // care chiar a existat, iar ștergerea lor ar rupe valoarea stocului din rapoartele financiare.
  const [updated] = await db
    .update(crmProducts)
    .set({ inventoryItemId: null, updatedAt: new Date() })
    .where(and(eq(crmProducts.id, id), eq(crmProducts.tenantId, user.tenantId)))
    .returning();

  return c.json(updated);
});
