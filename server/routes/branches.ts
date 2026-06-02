import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { branches } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createBranchSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  managerUserId: z.string().uuid().optional().nullable(),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  managerUserId: z.string().uuid().optional().nullable(),
});

export const branchRoutes = new Hono<{ Variables: AuthVariables }>();

branchRoutes.use("*", requireAuth);

// GET /api/branches — list active branches for tenant
branchRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select()
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), eq(branches.status, "active")))
    .orderBy(desc(branches.createdAt));

  return c.json({ items: rows });
});

// POST /api/branches — create branch
branchRoutes.post("/", zValidator("json", createBranchSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  const [created] = await db
    .insert(branches)
    .values({
      tenantId,
      name: body.name,
      address: body.address ?? null,
      managerUserId: body.managerUserId ?? null,
      status: "active",
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/branches/:id — update name/address/manager
branchRoutes.patch("/:id", zValidator("json", updateBranchSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.address !== undefined) patch.address = body.address ?? null;
  if (body.managerUserId !== undefined) patch.managerUserId = body.managerUserId ?? null;

  const [updated] = await db
    .update(branches)
    .set(patch)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// DELETE /api/branches/:id — archive (soft delete)
branchRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const [updated] = await db
    .update(branches)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, id: updated.id, status: "archived" });
});
