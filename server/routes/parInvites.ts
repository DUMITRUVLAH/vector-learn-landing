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
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "../db/client";
import { parInvites, parSettings } from "../db/schema/par";
import { users } from "../db/schema";
import { tenants } from "../db/schema/tenants";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import {
  generateInviteToken,
  hashInviteToken,
  inviteUrl,
  sendInviteEmail,
  INVITE_TTL_MS,
} from "../lib/par/invites";

import { parUuidGuard } from "../middleware/parUuidGuard";

export const parInvitesRoutes = new Hono<{ Variables: AuthVariables }>();
parInvitesRoutes.use("*", requireAuth);
parInvitesRoutes.use("/:id", parUuidGuard("id"));

const inviteSchema = z.object({
  email: z.string().email().max(255),
  par_role: z.enum(["requestor", "approver", "finance", "par_admin"]),
});

/** POST /api/par/invites — create an invitation */
parInvitesRoutes.post("/", requirePARRole("par_admin"), zValidator("json", inviteSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { email, par_role } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase();

  // If a user with this email is already a member of this tenant, no invite needed.
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.email, normalizedEmail)),
  });
  if (existingUser) {
    return c.json({ error: "already_member", detail: "Acest email există deja în organizație." }, 409);
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
      tokenHash: hashInviteToken(token),
      invitedByUserId: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();

  const url = inviteUrl(token);
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const emailed = await sendInviteEmail({ to: normalizedEmail, orgName: tenant?.name ?? "organizație", url });

  return c.json({ id: invite.id, email: invite.email, parRole: invite.parRole, inviteUrl: url, emailed }, 201);
});

/** GET /api/par/invites — list pending invites */
parInvitesRoutes.get("/", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({
      id: parInvites.id,
      email: parInvites.email,
      parRole: parInvites.parRole,
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
  return c.json({ invites: rows });
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
