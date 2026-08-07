/**
 * PAR-002: Member management routes
 * GET/POST/DELETE /api/par/members — par_admin only
 * GET /api/par/me — returns current user's PAR roles
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parMembers } from "../db/schema/par";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole, IMPLICIT_PAR_ADMIN_TENANT_ROLES } from "../middleware/requirePARRole";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parMembersRoutes = new Hono<{ Variables: AuthVariables }>();

parMembersRoutes.use("*", requireAuth);
parMembersRoutes.use("/:id", parUuidGuard("id"));

const assignMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["requestor", "approver", "finance", "par_admin"]),
  approvalLimitCents: z.number().int().positive().optional().nullable(),
});

/** GET /api/par/members — list all members (par_admin) */
parMembersRoutes.get("/", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;

  const members = await db
    .select({
      id: parMembers.id,
      userId: parMembers.userId,
      role: parMembers.role,
      approvalLimitCents: parMembers.approvalLimitCents,
      createdAt: parMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(parMembers)
    .leftJoin(users, eq(parMembers.userId, users.id))
    .where(eq(parMembers.tenantId, tenantId));

  // Tenant admins/managers hold an IMPLICIT par_admin (see requirePARRole) — they
  // can approve payments, read every report and hand out roles, without ever
  // appearing in par_members. Listing only the explicit rows made this screen
  // answer "who can approve payments here?" incorrectly: the most powerful people
  // were the ones it didn't show. They are returned flagged, never editable —
  // their authority comes from the tenant role, so it is revoked there.
  const implicitHolders = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        inArray(users.role, IMPLICIT_PAR_ADMIN_TENANT_ROLES as unknown as (typeof users.role.enumValues)[number][]),
      ),
    );

  const explicitAdminUserIds = new Set(
    members.filter((m) => m.role === "par_admin").map((m) => m.userId),
  );

  const implicit = implicitHolders
    .filter((u) => !explicitAdminUserIds.has(u.id))
    .map((u) => ({
      id: `implicit:${u.id}`,
      userId: u.id,
      role: "par_admin" as const,
      approvalLimitCents: null,
      createdAt: null,
      userName: u.name,
      userEmail: u.email,
      /** Authority comes from the tenant role, not a par_members row. */
      implicit: true as const,
      implicitFromTenantRole: u.role,
    }));

  return c.json({ members: [...members, ...implicit] });
});

/** POST /api/par/members — assign a role */
parMembersRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", assignMemberSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    // The target MUST belong to this tenant. Without this check any par_admin
    // could post an arbitrary user UUID: the row was created against their own
    // tenant, and `GET /api/par/members` LEFT JOINs `users`, so the member list
    // then displayed a FOREIGN user's name and email — a cross-tenant PII leak
    // for anyone whose id had leaked (audit rows, signature blocks, URLs).
    // It granted no access (getUserPARRoles filters by the session's tenant),
    // but it read one out.
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, body.userId), eq(users.tenantId, tenantId)));

    if (!target) {
      return c.json({ error: "user_not_in_tenant" }, 404);
    }

    // Check if already assigned same role
    const existing = await db
      .select()
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, body.userId),
          eq(parMembers.role, body.role)
        )
      );

    if (existing.length > 0) {
      // Update approval limit if provided
      const [updated] = await db
        .update(parMembers)
        .set({
          approvalLimitCents: body.approvalLimitCents ?? null,
          updatedAt: new Date(),
        })
        .where(eq(parMembers.id, existing[0].id))
        .returning();
      return c.json(updated, 200);
    }

    const [member] = await db
      .insert(parMembers)
      .values({
        tenantId,
        userId: body.userId,
        role: body.role,
        approvalLimitCents: body.approvalLimitCents ?? null,
      })
      .returning();

    return c.json(member, 201);
  }
);

/** DELETE /api/par/members/:id — revoke a role */
parMembersRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  // Refuse to remove the LAST par_admin: PAR administration (roles, approval
  // rules, reference data) would have no one left who can reach it. Tenant
  // admins/managers hold an implicit par_admin, so most orgs are shielded — but
  // an org whose PAR admin is a plain member could lock itself out completely.
  const [row] = await db
    .select({ role: parMembers.role, userId: parMembers.userId })
    .from(parMembers)
    .where(and(eq(parMembers.id, id), eq(parMembers.tenantId, tenantId)));

  if (row?.role === "par_admin") {
    const admins = await db
      .select({ id: parMembers.id })
      .from(parMembers)
      .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.role, "par_admin")));
    if (admins.length <= 1) {
      return c.json(
        { error: "last_par_admin", message: "Nu poți elimina ultimul administrator PAR. Acordă rolul altcuiva mai întâi." },
        409,
      );
    }
  }

  const [deleted] = await db
    .delete(parMembers)
    .where(and(eq(parMembers.id, id), eq(parMembers.tenantId, tenantId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ ok: true });
});
