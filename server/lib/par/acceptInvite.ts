/**
 * VF-fix (PAR invite ↔ approver connection): the bridge that was missing.
 *
 * Before this, `par_invites` rows were created by email but NOTHING ever turned an
 * invited email into a `par_members` row for a real user_id. The approval check
 * (requirePARRole / getUserPARRoles) looks up par_members BY user_id, so an invited
 * person who logged in had zero PAR roles → "forbidden: approver role required".
 *
 * This module centralises the linking so it can run from two places:
 *   1. POST /api/auth/accept-invite — the invite link signup/login flow.
 *   2. login + signup — auto-link any pending invite matching the user's email,
 *      so a person who was invited but signs in by other means is still connected.
 *
 * Linking is idempotent: a user already holding the invited role is left as-is, the
 * invite is just marked accepted.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { parInvites, parMembers, type ParInvite } from "../../db/schema/par";
import { tenants } from "../../db/schema/tenants";
import { hashInviteToken } from "./invites";

export type ParInviteRole = ParInvite["parRole"];

/** Find a pending (not accepted, not expired) invite by its plaintext token. */
export async function findPendingInviteByToken(token: string): Promise<ParInvite | null> {
  const tokenHash = hashInviteToken(token);
  const invite = await db.query.parInvites.findFirst({
    where: and(
      eq(parInvites.tokenHash, tokenHash),
      isNull(parInvites.acceptedAt),
      gt(parInvites.expiresAt, new Date())
    ),
  });
  return invite ?? null;
}

/**
 * Ensure the user has the invited PAR role in the invite's tenant and mark the
 * invite accepted. Idempotent. Also promotes the tenant to appKind "business" if
 * needed, because PAR lives in the Business Suite and the business session
 * (/api/business/auth/me) rejects non-business tenants as `wrong_app` — which would
 * make a freshly-accepted invite look like "login does nothing".
 *
 * Returns the role granted (or already held).
 */
export async function grantInviteRole(
  invite: ParInvite,
  userId: string
): Promise<ParInviteRole> {
  // 1) par_members row for (tenant, user, role) — create only if absent.
  const existing = await db.query.parMembers.findFirst({
    where: and(
      eq(parMembers.tenantId, invite.tenantId),
      eq(parMembers.userId, userId),
      eq(parMembers.role, invite.parRole)
    ),
  });
  if (!existing) {
    await db.insert(parMembers).values({
      tenantId: invite.tenantId,
      userId,
      role: invite.parRole,
    });
  }

  // 2) Mark the invite accepted (only if still pending — avoids clobbering).
  await db
    .update(parInvites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(parInvites.id, invite.id), isNull(parInvites.acceptedAt)));

  // 3) PAR is a Business Suite module — make sure the tenant is reachable there.
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, invite.tenantId) });
  if (tenant && tenant.appKind !== "business") {
    await db
      .update(tenants)
      .set({ appKind: "business", updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));
  }

  return invite.parRole;
}

/**
 * Auto-link any pending invites for this email within the given tenant. Used on
 * login/signup so an invited person who reaches the app by any path still gets
 * their PAR role. Returns the list of roles granted (may be empty).
 *
 * Scoped to the user's own tenant: a par_invites row references a tenant, and a
 * user belongs to exactly one tenant — only invites for THAT tenant may apply to
 * them, never another org's invite that happens to share the email.
 */
export async function linkPendingInvitesForEmail(params: {
  userId: string;
  email: string;
  tenantId: string;
}): Promise<ParInviteRole[]> {
  const normalizedEmail = params.email.toLowerCase();
  const pending = await db.query.parInvites.findMany({
    where: and(
      eq(parInvites.tenantId, params.tenantId),
      eq(parInvites.email, normalizedEmail),
      isNull(parInvites.acceptedAt),
      gt(parInvites.expiresAt, new Date())
    ),
  });

  const granted: ParInviteRole[] = [];
  for (const invite of pending) {
    granted.push(await grantInviteRole(invite, params.userId));
  }
  return granted;
}
