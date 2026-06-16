/**
 * VF-302: approver delegation management.
 *   GET    /api/par/delegations       → my delegations (par_admin sees all in tenant)
 *   POST   /api/par/delegations       → create a delegation FROM me TO someone, for an interval
 *   DELETE /api/par/delegations/:id   → cancel (own, or par_admin)
 *
 * Mounted in app.ts: app.route("/api/par/delegations", parDelegationsRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, or } from "drizzle-orm";
import { db } from "../db/client";
import { parDelegations, parMembers } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parDelegationsRoutes = new Hono<{ Variables: AuthVariables }>();
parDelegationsRoutes.use("*", requireAuth);

const createSchema = z.object({
  to_user_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }).or(z.string().date()),
  ends_at: z.string().datetime({ offset: true }).or(z.string().date()),
});

/** GET — my delegations (incoming + outgoing); par_admin sees all. */
parDelegationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const roles = await getUserPARRoles(user.id, tenantId);
  const isAdmin = roles.includes("par_admin");

  const where = isAdmin
    ? eq(parDelegations.tenantId, tenantId)
    : and(
        eq(parDelegations.tenantId, tenantId),
        or(eq(parDelegations.fromUserId, user.id), eq(parDelegations.toUserId, user.id))
      );

  const fromU = users;
  const rows = await db
    .select({
      id: parDelegations.id,
      fromUserId: parDelegations.fromUserId,
      toUserId: parDelegations.toUserId,
      startsAt: parDelegations.startsAt,
      endsAt: parDelegations.endsAt,
      active: parDelegations.active,
      createdAt: parDelegations.createdAt,
      toName: fromU.name,
    })
    .from(parDelegations)
    .leftJoin(fromU, eq(fromU.id, parDelegations.toUserId))
    .where(where)
    .orderBy(desc(parDelegations.createdAt));

  // Resolve "from" names in a second pass (avoid double self-join complexity).
  const fromIds = [...new Set(rows.map((r) => r.fromUserId))];
  const fromNames = fromIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(
        and(eq(users.tenantId, tenantId))
      )
    : [];
  const nameById = new Map(fromNames.map((u) => [u.id, u.name]));

  return c.json({
    delegations: rows.map((r) => ({ ...r, fromName: nameById.get(r.fromUserId) ?? null })),
  });
});

/** POST — create a delegation from the current user to another. */
parDelegationsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { to_user_id, starts_at, ends_at } = c.req.valid("json");

  // Self-delegation is meaningless.
  if (to_user_id === user.id) {
    return c.json({ error: "self_delegation", detail: "Nu te poți delega pe tine însuți." }, 400);
  }

  const startsAt = new Date(starts_at);
  const endsAt = new Date(ends_at);
  if (endsAt <= startsAt) {
    return c.json({ error: "invalid_interval", detail: "Sfârșitul trebuie să fie după început." }, 400);
  }

  // The delegate must be able to approve (approver or par_admin) — reuse VF-002 rule.
  const targetRoles = await getUserPARRoles(to_user_id, tenantId);
  if (!targetRoles.some((r) => ["approver", "par_admin"].includes(r))) {
    // Also confirm they are a member of THIS tenant (getUserPARRoles is tenant-scoped, so empty = not a member/role).
    const member = await db
      .select({ id: parMembers.id })
      .from(parMembers)
      .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, to_user_id)))
      .limit(1);
    if (member.length === 0) {
      return c.json({ error: "not_a_member", detail: "Utilizatorul nu face parte din organizație." }, 400);
    }
    return c.json({ error: "delegate_not_approver", detail: "Delegatul trebuie să fie aprobator." }, 400);
  }

  const [row] = await db
    .insert(parDelegations)
    .values({ tenantId, fromUserId: user.id, toUserId: to_user_id, startsAt, endsAt })
    .returning();

  return c.json(row, 201);
});

/** DELETE — cancel a delegation (own, or par_admin). */
parDelegationsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  const roles = await getUserPARRoles(user.id, tenantId);
  const isAdmin = roles.includes("par_admin");

  const where = isAdmin
    ? and(eq(parDelegations.id, id), eq(parDelegations.tenantId, tenantId))
    : and(eq(parDelegations.id, id), eq(parDelegations.tenantId, tenantId), eq(parDelegations.fromUserId, user.id));

  const [deleted] = await db.update(parDelegations).set({ active: false }).where(where).returning({ id: parDelegations.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
