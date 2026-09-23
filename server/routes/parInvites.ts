/**
 * VF-004: PAR invitation management (par_admin only).
 *   POST   /api/par/invites          → create invite, returns { inviteUrl, emailed }
 *   GET    /api/par/invites          → list pending (not accepted, not expired)
 *   DELETE /api/par/invites/:id      → revoke a pending invite
 *
 * Accepting an invite lives in auth.ts (POST /api/auth/accept-invite) because it mints a session.
 * Mounted in app.ts: app.route("/api/par/invites", parInvitesRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gt, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parInvites, parMembers, parPayers, parSettings } from "../db/schema/par";
import { users } from "../db/schema";
import { tenants } from "../db/schema/tenants";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole, IMPLICIT_PAR_ADMIN_TENANT_ROLES } from "../middleware/requirePARRole";
import {
  generateInviteToken,
  hashInviteToken,
  inviteUrl,
  sendInviteEmail,
  INVITE_TTL_MS,
} from "../lib/par/invites";

import { parUuidGuard } from "../middleware/parUuidGuard";
import { isReservedPlatformEmail } from "../lib/platformOwner";

export const parInvitesRoutes = new Hono<{ Variables: AuthVariables }>();
parInvitesRoutes.use("*", requireAuth);
parInvitesRoutes.use("/:id", parUuidGuard("id"));

const inviteSchema = z.object({
  email: z.string().email().max(255),
  par_role: z.enum(["requestor", "approver", "finance", "par_admin"]),
  payer_ids: z.array(z.string().uuid()).min(1).max(100),
});

/** POST /api/par/invites — create an invitation */
parInvitesRoutes.post("/", requirePARRole("par_admin"), zValidator("json", inviteSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { email, par_role, payer_ids } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase();
  // SECURITY (audit 2026-08-29): o invitație către emailul de proprietar al platformei era prima
  // verigă a unui lanț de preluare completă (tokenul brut vine chiar în răspunsul acestei rute,
  // iar accept-invite creează contul fără nicio dovadă de posesie a cutiei poștale).
  if (isReservedPlatformEmail(normalizedEmail)) return c.json({ error: "email_reserved" }, 403);
  const payerIds = [...new Set(payer_ids)];
  const validPayers = await db.select({ id: parPayers.id }).from(parPayers).where(and(
    eq(parPayers.tenantId, tenantId), inArray(parPayers.id, payerIds), eq(parPayers.active, true),
  ));
  if (validPayers.length !== payerIds.length) return c.json({ error: "invalid_payer_scope" }, 400);

  // Refuse only when the person still HAS PAR access. Removing someone from PAR deletes their
  // par_members rows but keeps the users row (it owns their past requests and signatures), so
  // "an account exists" is not the same as "is a member": checking the users row alone made a
  // removed person impossible to invite back. accept-invite already re-grants the role to an
  // existing same-tenant account, so the invite can go ahead.
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.email, normalizedEmail)),
  });
  if (existingUser) {
    const [stillMember] = await db
      .select({ id: parMembers.id })
      .from(parMembers)
      .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, existingUser.id)))
      .limit(1);
    if (stillMember || IMPLICIT_PAR_ADMIN_TENANT_ROLES.includes(existingUser.role)) {
      return c.json({
        error: "already_member",
        detail: "Această persoană are deja acces în PAR. Schimbă-i rolul din lista de membri.",
      }, 409);
    }
  }

  // Drop any prior pending invite for the same email+tenant (re-invite replaces).
  await db
    .delete(parInvites)
    .where(
      and(
        eq(parInvites.tenantId, tenantId),
        eq(parInvites.email, normalizedEmail),
        isNull(parInvites.acceptedAt)
      )
    );

  const token = generateInviteToken();
  const [invite] = await db
    .insert(parInvites)
    .values({
      tenantId,
      email: normalizedEmail,
      parRole: par_role,
      payerScope: JSON.stringify(payerIds),
      tokenHash: hashInviteToken(token),
      invitedByUserId: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();

  const url = inviteUrl(token);
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const emailed = await sendInviteEmail({
    to: normalizedEmail,
    orgName: tenant?.name ?? "organizație",
    url,
    parRole: par_role,
    invitedByName: user.name,
  });

  return c.json({ id: invite.id, email: invite.email, parRole: invite.parRole, payerIds, inviteUrl: url, emailed }, 201);
});

/** GET /api/par/invites — list pending invites */
parInvitesRoutes.get("/", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({
      id: parInvites.id,
      email: parInvites.email,
      parRole: parInvites.parRole,
      payerScope: parInvites.payerScope,
      expiresAt: parInvites.expiresAt,
      createdAt: parInvites.createdAt,
    })
    .from(parInvites)
    .where(
      and(
        eq(parInvites.tenantId, tenantId),
        isNull(parInvites.acceptedAt),
        gt(parInvites.expiresAt, new Date())
      )
    )
    .orderBy(desc(parInvites.createdAt));
  return c.json({ invites: rows.map((row) => ({
    ...row,
    payerIds: (() => { try { return JSON.parse(row.payerScope ?? "[]"); } catch { return []; } })(),
    payerScope: undefined,
  })) });
});

/** DELETE /api/par/invites/:id — revoke a pending invite */
parInvitesRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(parInvites)
    .where(and(eq(parInvites.id, id), eq(parInvites.tenantId, tenantId), isNull(parInvites.acceptedAt)))
    .returning({ id: parInvites.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
