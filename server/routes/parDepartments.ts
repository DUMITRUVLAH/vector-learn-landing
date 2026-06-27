/**
 * PAR-003: Departments CRUD
 * GET/POST/PATCH/DELETE /api/par/departments
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parDepartments } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parDepartmentsRoutes = new Hono<{ Variables: AuthVariables }>();
parDepartmentsRoutes.use("*", requireAuth);
parDepartmentsRoutes.use("/:id", parUuidGuard("id"));

const deptSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
});

parDepartmentsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(parDepartments)
    .where(and(eq(parDepartments.tenantId, tenantId), eq(parDepartments.active, true)))
    .orderBy(asc(parDepartments.name));
  return c.json({ departments: rows });
});

parDepartmentsRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", deptSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");
    const [row] = await db
      .insert(parDepartments)
      .values({ tenantId, ...body })
      .returning();
    return c.json(row, 201);
  }
);

parDepartmentsRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", deptSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(parDepartments)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parDepartments.id, id), eq(parDepartments.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parDepartmentsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(parDepartments)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parDepartments.id, id), eq(parDepartments.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
