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
import { and, eq, gte, lte, desc, or } from "drizzle-orm";
import { db } from "../db/client";
import { parDelegations, parMembers } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parDelegationsRoutes = new Hono<{ Variables: AuthVariables }>();
parDelegationsRoutes.use("*", requireAuth);
parDelegationsRoutes.use("/:id", parUuidGuard("id"));

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

  // The delegate must be a member of THIS tenant. They do NOT have to already be
  // an approver: requiring that made delegation useless in exactly the case it
  // exists for — an org with a single approver going on leave could not delegate
  // at all (self-delegation is blocked above, and the only other candidates were
  // by definition not approvers). The delegation itself is what confers approval
  // authority, and it is time-boxed, created by someone who already holds that
  // authority, and written to the audit log.
  const member = await db
    .select({ id: parMembers.id })
    .from(parMembers)
    .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, to_user_id)))
    .limit(1);
  if (member.length === 0) {
    return c.json({ error: "not_a_member", detail: "Utilizatorul nu face parte din organizație." }, 400);
  }

  // Reject an overlapping delegation for the same pair: two live windows for the
  // same from→to answer "who may approve right now?" twice, and the list turns
  // into duplicate rows nobody can tell apart.
  const overlapping = await db
    .select({ id: parDelegations.id })
    .from(parDelegations)
    .where(
      and(
        eq(parDelegations.tenantId, tenantId),
        eq(parDelegations.fromUserId, user.id),
        eq(parDelegations.toUserId, to_user_id),
        lte(parDelegations.startsAt, endsAt),
        gte(parDelegations.endsAt, startsAt),
      ),
    )
    .limit(1);
  if (overlapping.length > 0) {
    return c.json(
      { error: "overlapping_delegation", detail: "Există deja o delegare către această persoană în acest interval." },
      409,
    );
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
