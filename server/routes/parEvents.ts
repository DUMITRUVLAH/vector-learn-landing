/**
 * VM1-04: PAR Events — sub-entities of projects (Proiect → Eveniment → Cerere).
 *
 * GET    /api/par/events                — list events (tenant-scoped, optional ?project_id=)
 * POST   /api/par/events                — create event (par_admin only)
 * PUT    /api/par/events/:id            — update event (par_admin only)
 * DELETE /api/par/events/:id            — deactivate event (par_admin only, soft-delete via active=false)
 *
 * CORE: backlog/par/PAR-CORE.md
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parEvents, parProjects } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parEventsRoutes = new Hono<{ Variables: AuthVariables }>();

parEventsRoutes.use("*", requireAuth);
parEventsRoutes.use("/:id", parUuidGuard("id"));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  project_id: z.string().uuid().optional().nullable(),
  starts_at: z.string().datetime({ offset: true }).optional().nullable(),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  active: z.boolean().optional(),
});

// ─── GET /api/par/events ─────────────────────────────────────────────────────

/** List events for tenant. Optional ?project_id= filter. All roles can read.
 * Feature 2: joins users (creator name) + projects (project name) for display. */
parEventsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const projectId = c.req.query("project_id");
  // ?include_inactive=1 allows admin views to see soft-deleted events
  const includeInactive = c.req.query("include_inactive") === "1";

  const conditions = [eq(parEvents.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(parEvents.active, true));
  if (projectId) conditions.push(eq(parEvents.projectId, projectId));

  const rows = await db
    .select({
      id: parEvents.id,
      tenantId: parEvents.tenantId,
      projectId: parEvents.projectId,
      projectName: parProjects.name,
      name: parEvents.name,
      startsAt: parEvents.startsAt,
      endsAt: parEvents.endsAt,
      active: parEvents.active,
      createdByUserId: parEvents.createdByUserId,
      createdByName: users.name,
      createdAt: parEvents.createdAt,
      updatedAt: parEvents.updatedAt,
    })
    .from(parEvents)
    .leftJoin(parProjects, eq(parProjects.id, parEvents.projectId))
    .leftJoin(users, eq(users.id, parEvents.createdByUserId))
    .where(and(...conditions))
    .orderBy(asc(parEvents.name));

  const data = Array.isArray(rows) ? rows : (rows as { rows?: typeof rows }).rows ?? [];
  return c.json({ events: data });
});

// ─── POST /api/par/events ─────────────────────────────────────────────────────

parEventsRoutes.post("/", requirePARRole("par_admin"), async (c) => {
  const currentUser = c.get("user");
  const tenantId = currentUser.tenantId;
  const body = createSchema.parse(await c.req.json());

  const [created] = await db
    .insert(parEvents)
    .values({
      tenantId,
      name: body.name,
      projectId: body.project_id ?? null,
      startsAt: body.starts_at ? new Date(body.starts_at) : null,
      endsAt: body.ends_at ? new Date(body.ends_at) : null,
      // Feature 2: track who created the event
      createdByUserId: currentUser.id,
    })
    .returning();

  return c.json(created, 201);
});

// ─── PUT /api/par/events/:id ──────────────────────────────────────────────────

parEventsRoutes.put("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = updateSchema.parse(await c.req.json());

  const updateData: Partial<typeof parEvents.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.project_id !== undefined) updateData.projectId = body.project_id;
  if (body.starts_at !== undefined) updateData.startsAt = body.starts_at ? new Date(body.starts_at) : null;
  if (body.ends_at !== undefined) updateData.endsAt = body.ends_at ? new Date(body.ends_at) : null;
  if (body.active !== undefined) updateData.active = body.active;

  const [updated] = await db
    .update(parEvents)
    .set(updateData)
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// ─── DELETE /api/par/events/:id — soft-delete via active=false ───────────────

parEventsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const [updated] = await db
    .update(parEvents)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
