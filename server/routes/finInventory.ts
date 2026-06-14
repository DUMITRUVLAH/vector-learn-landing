/**
 * INVENTORY-001: Rute inventar materiale didactice + consumabile
 * Montare: app.route("/api/fin/inventory", finInventoryRoutes)
 *
 * Endpoints:
 *   GET  /items                  — lista articolelor (cu filtre)
 *   POST /items                  — creare articol nou
 *   PATCH /items/:id             — actualizare articol
 *   GET  /movements              — jurnal mișcări
 *   POST /movements              — înregistrare mișcare manuală
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import { finInventoryItems, finStockMovements } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  calculateAvgCost,
  calculateExitCost,
  isInbound,
  isOutbound,
} from "../lib/finInventoryEngine";

export const finInventoryRoutes = new Hono<{ Variables: AuthVariables }>();

finInventoryRoutes.use("*", requireAuth);

// ─── Schemă de validare ────────────────────────────────────────────────────────

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(50).optional().nullable(),
  unit: z.enum(["buc", "kg", "l", "m", "set", "pachet"]).default("buc"),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(["consumabile", "active_mici", "materiale_didactice", "papetarie", "electronice", "altele"]).optional().nullable(),
  minQtyAlert: z.number().int().min(0).default(0),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(50).optional().nullable(),
  unit: z.enum(["buc", "kg", "l", "m", "set", "pachet"]).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(["consumabile", "active_mici", "materiale_didactice", "papetarie", "electronice", "altele"]).optional().nullable(),
  minQtyAlert: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const createMovementSchema = z.object({
  itemId: z.string().uuid(),
  movementType: z.enum(["purchase", "sale", "adjustment", "transfer_in", "transfer_out"]),
  qty: z.number().int().min(1, "Cantitatea trebuie să fie cel puțin 1"),
  unitCostCents: z.number().int().min(0).default(0),
  invoiceId: z.string().uuid().optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
});

// ─── GET /items ────────────────────────────────────────────────────────────────

finInventoryRoutes.get("/items", async (c) => {
  const tenantId = c.get("user").tenantId;
  const category = c.req.query("category");
  const includeInactive = c.req.query("includeInactive") === "true";

  const conditions = [eq(finInventoryItems.tenantId, tenantId)];

  if (!includeInactive) {
    conditions.push(eq(finInventoryItems.isActive, true));
  }

  if (category) {
    conditions.push(eq(finInventoryItems.category, category));
  }

  const items = await db
    .select()
    .from(finInventoryItems)
    .where(and(...conditions))
    .orderBy(asc(finInventoryItems.name));

  return c.json({ items });
});

// ─── POST /items ───────────────────────────────────────────────────────────────

finInventoryRoutes.post("/items", zValidator("json", createItemSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [item] = await db
    .insert(finInventoryItems)
    .values({
      tenantId,
      name: body.name,
      sku: body.sku ?? null,
      unit: body.unit,
      description: body.description ?? null,
      category: body.category ?? null,
      minQtyAlert: body.minQtyAlert,
      qtyOnHand: 0,
      avgCostCents: 0,
      isActive: true,
    })
    .returning();

  return c.json({ item }, 201);
});

// ─── PATCH /items/:id ──────────────────────────────────────────────────────────

finInventoryRoutes.patch("/items/:id", zValidator("json", updateItemSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Verifică că articolul aparține tenant-ului
  const [existing] = await db
    .select({ id: finInventoryItems.id })
    .from(finInventoryItems)
    .where(and(eq(finInventoryItems.id, id), eq(finInventoryItems.tenantId, tenantId)));

  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.sku !== undefined) updateData.sku = body.sku;
  if (body.unit !== undefined) updateData.unit = body.unit;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.minQtyAlert !== undefined) updateData.minQtyAlert = body.minQtyAlert;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const [updated] = await db
    .update(finInventoryItems)
    .set(updateData)
    .where(and(eq(finInventoryItems.id, id), eq(finInventoryItems.tenantId, tenantId)))
    .returning();

  return c.json({ item: updated });
});

// ─── GET /movements ────────────────────────────────────────────────────────────

finInventoryRoutes.get("/movements", async (c) => {
  const tenantId = c.get("user").tenantId;
  const itemId = c.req.query("itemId");
  const type = c.req.query("type");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const conditions = [eq(finStockMovements.tenantId, tenantId)];

  if (itemId) {
    conditions.push(eq(finStockMovements.itemId, itemId));
  }
  if (type) {
    conditions.push(eq(finStockMovements.movementType, type));
  }

  const movements = await db
    .select()
    .from(finStockMovements)
    .where(and(...conditions))
    .orderBy(desc(finStockMovements.movedAt))
    .limit(limit)
    .offset(offset);

  return c.json({ movements, page, limit });
});

// ─── POST /movements ───────────────────────────────────────────────────────────

finInventoryRoutes.post("/movements", zValidator("json", createMovementSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const body = c.req.valid("json");

  // Fetch articolul curent
  const [item] = await db
    .select()
    .from(finInventoryItems)
    .where(and(eq(finInventoryItems.id, body.itemId), eq(finInventoryItems.tenantId, tenantId)));

  if (!item) {
    return c.json({ error: "item_not_found" }, 404);
  }

  let qtyDelta = 0;
  let unitCostCents = body.unitCostCents;
  let totalCostCents = 0;
  let newAvgCostCents = item.avgCostCents;
  let newQtyOnHand = item.qtyOnHand;

  if (isInbound(body.movementType)) {
    // Intrare → recalculează CMP
    const result = calculateAvgCost({
      oldQty: item.qtyOnHand,
      oldAvgCostCents: item.avgCostCents,
      qtyIn: body.qty,
      unitCostCents: body.unitCostCents,
    });
    newAvgCostCents = result.newAvgCostCents;
    newQtyOnHand = result.newQtyOnHand;
    totalCostCents = result.entryTotalCostCents;
    qtyDelta = body.qty;
  } else if (isOutbound(body.movementType)) {
    // Ieșire → verifică stoc suficient, cost la CMP curent
    const result = calculateExitCost(item.qtyOnHand, item.avgCostCents, body.qty);
    if (!result.ok) {
      return c.json(
        { error: "insufficient_stock", available: result.available, requested: result.requested },
        422
      );
    }
    unitCostCents = result.unitCostCents;
    totalCostCents = result.totalCostCents;
    newQtyOnHand = result.remainingQty;
    qtyDelta = -body.qty;
  } else if (body.movementType === "adjustment") {
    // Ajustare → qty poate fi adăugat sau scăzut, dar stocul nu poate deveni negativ
    const afterAdj = item.qtyOnHand + body.qty;
    if (afterAdj < 0) {
      return c.json({ error: "insufficient_stock", available: item.qtyOnHand, requested: body.qty }, 422);
    }
    newQtyOnHand = afterAdj;
    totalCostCents = body.qty * item.avgCostCents;
    qtyDelta = body.qty;
  }

  // Tranzacție: inserează mișcarea + actualizează articolul
  const [movement] = await db.insert(finStockMovements).values({
    tenantId,
    itemId: body.itemId,
    movementType: body.movementType,
    qty: body.qty,
    unitCostCents,
    totalCostCents,
    invoiceId: body.invoiceId ?? null,
    reference: body.reference ?? null,
    notes: body.notes ?? null,
    branchId: body.branchId ?? null,
    movedBy: user.id,
    movedAt: new Date(),
  }).returning();

  await db
    .update(finInventoryItems)
    .set({
      qtyOnHand: newQtyOnHand,
      avgCostCents: newAvgCostCents,
      updatedAt: new Date(),
    })
    .where(eq(finInventoryItems.id, body.itemId));

  return c.json({ movement, newQtyOnHand, newAvgCostCents }, 201);
});
