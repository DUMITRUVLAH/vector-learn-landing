/**
 * TB-001: TaskBoard — Produse/Cursuri (dimensiunea de planificare)
 * GET/POST/PATCH/DELETE /api/board/products
 *
 * TODO(TB): tighten writes to manager+ (owner decision 2026-07-07: permissive for now —
 * any authenticated tenant user may write; role scaffolding comes later).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { boardProducts, BOARD_PRODUCT_STATUSES } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardProductsRoutes = new Hono<{ Variables: AuthVariables }>();
boardProductsRoutes.use("*", requireAuth);
boardProductsRoutes.use("/:id", parUuidGuard("id"));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const productSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(32).optional(),
  courseId: z.string().uuid().nullable().optional(),
  startDate: z.string().regex(DATE_RE).nullable().optional(),
  endDate: z.string().regex(DATE_RE).nullable().optional(),
  status: z.enum(BOARD_PRODUCT_STATUSES).optional(),
  colorToken: z.string().max(32).nullable().optional(),
});

boardProductsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const includeArchived = c.req.query("status") === "all";
  const rows = await db
    .select()
    .from(boardProducts)
    .where(
      includeArchived
        ? eq(boardProducts.tenantId, tenantId)
        : and(eq(boardProducts.tenantId, tenantId), eq(boardProducts.status, "active"))
    )
    .orderBy(asc(boardProducts.name));
  return c.json({ products: rows });
});

boardProductsRoutes.post("/", zValidator("json", productSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [row] = await db
    .insert(boardProducts)
    .values({
      tenantId,
      name: body.name,
      kind: body.kind ?? "course",
      courseId: body.courseId ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      colorToken: body.colorToken ?? null,
    })
    .returning();
  return c.json(row, 201);
});

boardProductsRoutes.patch("/:id", zValidator("json", productSchema.partial()), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [row] = await db
    .update(boardProducts)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(boardProducts.id, id), eq(boardProducts.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

boardProductsRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(boardProducts)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(boardProducts.id, id), eq(boardProducts.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
