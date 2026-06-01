/**
 * BRANCH-701 — Branches (multi-location) CRUD API
 *
 * GET    /api/branches              — list all branches for current tenant
 * POST   /api/branches              — create a new branch
 * GET    /api/branches/:id          — get single branch
 * PUT    /api/branches/:id          — update branch
 * DELETE /api/branches/:id          — delete branch (not if is_default)
 * GET    /api/branches/current      — get user's active branch (based on branch_scope)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { branches } from "../db/schema/branches";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const branchRoutes = new Hono<{ Variables: AuthVariables }>();

branchRoutes.use("*", requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(2000).optional(),
  managerUserId: z.string().uuid().optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

// ─── GET /api/branches ─────────────────────────────────────────────────────────
branchRoutes.get("/", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, user.tenantId))
    .orderBy(branches.createdAt);

  return c.json({ branches: rows });
});

// ─── GET /api/branches/current ─────────────────────────────────────────────────
// Must be before /:id to avoid "current" being treated as a UUID
branchRoutes.get("/current", async (c) => {
  const user = c.get("user");

  // Return default branch for tenant (branch_scope added in BRANCH-703)
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.tenantId, user.tenantId), eq(branches.isDefault, true)))
    .limit(1);

  if (!branch) {
    // Return first branch as fallback
    const [first] = await db
      .select()
      .from(branches)
      .where(eq(branches.tenantId, user.tenantId))
      .orderBy(branches.createdAt)
      .limit(1);

    return c.json({ branch: first ?? null });
  }

  return c.json({ branch });
});

// ─── POST /api/branches ────────────────────────────────────────────────────────
branchRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // If isDefault = true, clear other defaults first
  if (body.isDefault) {
    await db
      .update(branches)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(branches.tenantId, user.tenantId));
  }

  const [created] = await db
    .insert(branches)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      address: body.address ?? null,
      managerUserId: body.managerUserId ?? null,
      isDefault: body.isDefault ?? false,
    })
    .returning();

  return c.json({ branch: created }, 201);
});

// ─── GET /api/branches/:id ────────────────────────────────────────────────────
branchRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, user.tenantId)));

  if (!branch) return c.json({ error: "not_found" }, 404);

  return c.json({ branch });
});

// ─── PUT /api/branches/:id ────────────────────────────────────────────────────
branchRoutes.put("/:id", zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  // If setting as default, clear others
  if (body.isDefault) {
    await db
      .update(branches)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(branches.tenantId, user.tenantId)));
  }

  const [updated] = await db
    .update(branches)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(branches.id, id))
    .returning();

  return c.json({ branch: updated });
});

// ─── DELETE /api/branches/:id ─────────────────────────────────────────────────
branchRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  // Cannot delete the default branch
  if (existing.isDefault) {
    return c.json({ error: "cannot_delete_default_branch" }, 400);
  }

  await db.delete(branches).where(eq(branches.id, id));

  return c.json({ deleted: true });
});
