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
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const crmProductsRoutes = new Hono<{ Variables: AuthVariables }>();
crmProductsRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const productFieldsSchema = z.object({
  name: z.string().min(2, "Denumirea este obligatorie (minim 2 caractere)"),
  sku: z.string().max(60).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  description: z.string().optional().nullable(),
  unit: z.string().max(30).optional(),
  listPriceCents: z.number().int().min(0).optional(),
  currency: z.string().max(8).optional(),
  vatPercent: z.number().min(0).optional(),
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

  const items = await db
    .select()
    .from(crmProducts)
    .where(and(...conditions))
    .orderBy(asc(crmProducts.orderIndex), asc(crmProducts.name));

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
