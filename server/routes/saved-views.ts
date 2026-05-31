import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { savedViews } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const savedViewsRoutes = new Hono<{ Variables: AuthVariables }>();

savedViewsRoutes.use("/*", requireAuth);

const savedViewFiltersSchema = z.object({
  source: z.string().optional(),
  assignedTo: z.string().optional(),
  searchQuery: z.string().optional(),
  filterNoTask: z.boolean().optional(),
  filterOverdue: z.boolean().optional(),
});

const createSavedViewSchema = z.object({
  name: z.string().min(1).max(200),
  filters: savedViewFiltersSchema,
  isPublic: z.boolean().default(false),
});

/** GET /api/saved-views — list all views visible to the current user in the tenant */
savedViewsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const views = await db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.tenantId, user.tenantId),
        or(eq(savedViews.userId, user.id), eq(savedViews.isPublic, true))
      )
    );

  return c.json({ views });
});

/** POST /api/saved-views — create a new saved view */
savedViewsRoutes.post("/", zValidator("json", createSavedViewSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [created] = await db
    .insert(savedViews)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      name: body.name,
      filters: body.filters,
      isPublic: body.isPublic,
    })
    .returning();

  return c.json({ view: created }, 201);
});

/** DELETE /api/saved-views/:id — delete own view (managers can delete any) */
savedViewsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db.query.savedViews.findFirst({
    where: and(eq(savedViews.id, id), eq(savedViews.tenantId, user.tenantId)),
  });

  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  // Only the owner, or a manager/admin can delete
  const isOwner = existing.userId === user.id;
  const isManagerOrAdmin = user.role === "owner" || user.role === "manager";
  if (!isOwner && !isManagerOrAdmin) {
    return c.json({ error: "forbidden" }, 403);
  }

  await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.tenantId, user.tenantId)));

  return c.json({ ok: true });
});
