import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parDepartments, parMemberProfiles, parPayerMembers, parPayers, parProjectMembers, parProjects, parMembers } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parProfilesRoutes = new Hono<{ Variables: AuthVariables }>();
parProfilesRoutes.use("*", requireAuth);

const profileSchema = z.object({
  department_id: z.string().uuid().nullable().optional(),
  job_title: z.string().max(300).nullable().optional(),
  staff_code: z.string().max(100).nullable().optional(),
});
const membershipsSchema = z.object({ project_ids: z.array(z.string().uuid()).max(200) });
const payerMembershipsSchema = z.object({ payer_ids: z.array(z.string().uuid()).max(100) });

async function upsertProfile(tenantId: string, userId: string, body: z.infer<typeof profileSchema>) {
  const [existing] = await db.select({
    id: parMemberProfiles.id,
    departmentId: parMemberProfiles.departmentId,
    jobTitle: parMemberProfiles.jobTitle,
    staffCode: parMemberProfiles.staffCode,
  }).from(parMemberProfiles)
    .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.userId, userId)));
  const values = {
    departmentId: body.department_id !== undefined ? body.department_id : existing?.departmentId ?? null,
    jobTitle: body.job_title !== undefined ? body.job_title : existing?.jobTitle ?? null,
    staffCode: body.staff_code !== undefined ? body.staff_code : existing?.staffCode ?? null,
    updatedAt: new Date(),
  };
  if (existing) return (await db.update(parMemberProfiles).set(values).where(eq(parMemberProfiles.id, existing.id)).returning())[0];
  return (await db.insert(parMemberProfiles).values({ tenantId, userId, ...values }).returning())[0];
}

async function departmentBelongsToTenant(tenantId: string, departmentId: string | null | undefined) {
  if (!departmentId) return true;
  const [department] = await db.select({ id: parDepartments.id }).from(parDepartments).where(and(
    eq(parDepartments.id, departmentId),
    eq(parDepartments.tenantId, tenantId),
    eq(parDepartments.active, true),
  ));
  return Boolean(department);
}

async function isParMember(tenantId: string, userId: string) {
  const [member] = await db.select({ id: parMembers.id }).from(parMembers).where(and(
    eq(parMembers.tenantId, tenantId),
    eq(parMembers.userId, userId),
  ));
  return Boolean(member);
}

parProfilesRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const [profile] = await db.select().from(parMemberProfiles)
    .where(and(eq(parMemberProfiles.tenantId, user.tenantId), eq(parMemberProfiles.userId, user.id)));
  const memberships = await db.select({ projectId: parProjectMembers.projectId }).from(parProjectMembers)
    .where(and(eq(parProjectMembers.tenantId, user.tenantId), eq(parProjectMembers.userId, user.id)));
  const payerMemberships = await db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers)
    .where(and(eq(parPayerMembers.tenantId, user.tenantId), eq(parPayerMembers.userId, user.id)));
  return c.json({ profile: profile ?? null, projectIds: memberships.map((m) => m.projectId), payerIds: payerMemberships.map((m) => m.payerId) });
});

parProfilesRoutes.patch("/me", zValidator("json", profileSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  if (!(await departmentBelongsToTenant(user.tenantId, body.department_id))) {
    return c.json({ error: "invalid_department" }, 400);
  }
  return c.json(await upsertProfile(user.tenantId, user.id, body));
});

parProfilesRoutes.get("/:id", parUuidGuard("id"), requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.req.param("id");
  if (!(await isParMember(tenantId, userId))) return c.json({ error: "member_not_found" }, 404);
  const [profile] = await db.select().from(parMemberProfiles)
    .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.userId, userId)));
  const memberships = await db.select({ projectId: parProjectMembers.projectId }).from(parProjectMembers)
    .where(and(eq(parProjectMembers.tenantId, tenantId), eq(parProjectMembers.userId, userId)));
  const payerMemberships = await db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers)
    .where(and(eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, userId)));
  return c.json({ profile: profile ?? null, projectIds: memberships.map((row) => row.projectId), payerIds: payerMemberships.map((row) => row.payerId) });
});

parProfilesRoutes.patch("/:id", parUuidGuard("id"), requirePARRole("par_admin"), zValidator("json", profileSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.req.param("id");
  if (!(await isParMember(tenantId, userId))) return c.json({ error: "member_not_found" }, 404);
  const body = c.req.valid("json");
  if (!(await departmentBelongsToTenant(tenantId, body.department_id))) {
    return c.json({ error: "invalid_department" }, 400);
  }
  return c.json(await upsertProfile(tenantId, userId, body));
});

parProfilesRoutes.put("/:id/projects", parUuidGuard("id"), requirePARRole("par_admin"), zValidator("json", membershipsSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.req.param("id");
  const [member] = await db.select({ id: parMembers.id }).from(parMembers).where(and(
    eq(parMembers.tenantId, tenantId), eq(parMembers.userId, userId),
  ));
  if (!member) return c.json({ error: "member_not_found" }, 404);
  const projectIds = [...new Set(c.req.valid("json").project_ids)];
  if (projectIds.length) {
    const valid = await db.select({ id: parProjects.id }).from(parProjects).where(and(
      eq(parProjects.tenantId, tenantId),
      inArray(parProjects.id, projectIds),
    ));
    if (valid.length !== projectIds.length) return c.json({ error: "invalid_project_scope" }, 400);
  }
  await db.delete(parProjectMembers).where(and(eq(parProjectMembers.tenantId, tenantId), eq(parProjectMembers.userId, userId)));
  if (projectIds.length) await db.insert(parProjectMembers).values(projectIds.map((projectId) => ({ tenantId, userId, projectId })));
  return c.json({ ok: true, projectIds });
});

parProfilesRoutes.put("/:id/payers", parUuidGuard("id"), requirePARRole("par_admin"), zValidator("json", payerMembershipsSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.req.param("id");
  const payerIds = [...new Set(c.req.valid("json").payer_ids)];
  const [member] = await db.select({ id: parMembers.id }).from(parMembers).where(and(
    eq(parMembers.tenantId, tenantId), eq(parMembers.userId, userId),
  ));
  if (!member) return c.json({ error: "member_not_found" }, 404);
  if (payerIds.length) {
    const valid = await db.select({ id: parPayers.id }).from(parPayers).where(and(
      eq(parPayers.tenantId, tenantId), inArray(parPayers.id, payerIds), eq(parPayers.active, true),
    ));
    if (valid.length !== payerIds.length) return c.json({ error: "invalid_payer_scope" }, 400);
  }
  await db.delete(parPayerMembers).where(and(eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, userId)));
  if (payerIds.length) await db.insert(parPayerMembers).values(payerIds.map((payerId) => ({ tenantId, userId, payerId })));
  return c.json({ ok: true, payerIds });
});
