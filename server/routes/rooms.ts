/**
 * SCHED-501: Rooms API — CRUD for classroom management
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { rooms } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const roomRoutes = new Hono<{ Variables: AuthVariables }>();

roomRoutes.use("/*", requireAuth);

const createRoomSchema = z.object({
  name: z.string().min(1).max(200),
  capacity: z.number().int().min(1).default(10),
  description: z.string().max(500).optional().nullable(),
});

const updateRoomSchema = createRoomSchema.partial();

// ─── GET /api/rooms ───────────────────────────────────────────────────────────

roomRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(rooms)
    .where(eq(rooms.tenantId, tenantId))
    .orderBy(asc(rooms.name));
  return c.json({ items });
});

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

roomRoutes.post("/", zValidator("json", createRoomSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [created] = await db
    .insert(rooms)
    .values({ tenantId, name: body.name, capacity: body.capacity, description: body.description ?? null })
    .returning();
  return c.json(created, 201);
});

// ─── PATCH /api/rooms/:id ─────────────────────────────────────────────────────

roomRoutes.patch("/:id", zValidator("json", updateRoomSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.capacity !== undefined) patch.capacity = body.capacity;
  if (body.description !== undefined) patch.description = body.description;

  const [updated] = await db
    .update(rooms)
    .set(patch)
    .where(and(eq(rooms.id, id), eq(rooms.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// ─── DELETE /api/rooms/:id ────────────────────────────────────────────────────

roomRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  await db
    .delete(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.tenantId, tenantId)));
  return c.json({ deleted: true });
});
