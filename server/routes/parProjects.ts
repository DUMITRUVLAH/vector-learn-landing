/**
 * PAR-003: Projects / Programs CRUD
 * GET/POST/PATCH/DELETE /api/par/projects
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parProjects } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { getProjectApproverMap, setProjectApprovers } from "../lib/par/projectApprovers";

export const parProjectsRoutes = new Hono<{ Variables: AuthVariables }>();
parProjectsRoutes.use("*", requireAuth);
parProjectsRoutes.use("/:id", parUuidGuard("id"));
parProjectsRoutes.use("/:id/:action/*", parUuidGuard("id"));

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  donor: z.string().max(200).optional().nullable(),
  active: z.boolean().optional(),
});

parProjectsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(parProjects)
    .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.active, true)))
    .orderBy(asc(parProjects.name));
  // Attach the designated approver user-ids per project ([] = unrestricted → any approver).
  const approverMap = await getProjectApproverMap(tenantId);
  const projects = rows.map((p) => ({ ...p, approverUserIds: [...(approverMap.get(p.id) ?? [])] }));
  return c.json({ projects });
});

const approversSchema = z.object({ userIds: z.array(z.string().uuid()).max(50) });

/** PUT /api/par/projects/:id/approvers — replace a project's designated approver list (par_admin). */
parProjectsRoutes.put(
  "/:id/approvers",
  requirePARRole("par_admin"),
  zValidator("json", approversSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const [proj] = await db
      .select({ id: parProjects.id })
      .from(parProjects)
      .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)));
    if (!proj) return c.json({ error: "not_found" }, 404);
    await setProjectApprovers(tenantId, id, c.req.valid("json").userIds);
    const approverMap = await getProjectApproverMap(tenantId);
    return c.json({ ok: true, approverUserIds: [...(approverMap.get(id) ?? [])] });
  }
);

parProjectsRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", projectSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");
    const [row] = await db
      .insert(parProjects)
      .values({ tenantId, name: body.name, donor: body.donor ?? null })
      .returning();
    return c.json(row, 201);
  }
);

parProjectsRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", projectSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(parProjects)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parProjectsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(parProjects)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
