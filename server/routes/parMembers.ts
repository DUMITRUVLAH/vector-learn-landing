/**
 * PAR-002: Member management routes
 * GET/POST/DELETE /api/par/members — par_admin only
 * GET /api/par/me — returns current user's PAR roles
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parMembers } from "../db/schema/par";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
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

  return c.json({ members });
});

/** POST /api/par/members — assign a role */
parMembersRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", assignMemberSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

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

  const [deleted] = await db
    .delete(parMembers)
    .where(and(eq(parMembers.id, id), eq(parMembers.tenantId, tenantId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ ok: true });
});
