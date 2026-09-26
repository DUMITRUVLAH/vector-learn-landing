/**
 * CRM — echipa de vânzări: cine intră, cu ce rol, și cine nu mai intră.
 *
 * Montat la /api/crm/team (app.ts).
 *
 *   GET    /                         → membrii + invitațiile în așteptare (cere `audit.view`)
 *   POST   /invites                  → invită pe email cu un rol (doar administratorul)
 *   DELETE /invites/:id              → anulează o invitație în așteptare
 *   PATCH  /members/:id              → { role } schimbă rolul
 *   PUT    /members/:id/access       → { crmAccess } scoate din CRM / readă în CRM
 *   PUT    /members/:id/active       → { active } dezactivează / reactivează contul
 *
 * Invitația folosește fluxul existent (tabelul `par_invites`, pagina /business/invite, Google),
 * cu `module = "crm"`: la acceptare omul primește rolul ales și intră direct în CRM
 * (vezi lib/invites/grant.ts). Un al doilea flux de invitații ar fi însemnat a doua pagină de
 * acceptare și a doua integrare Google — două locuri în care să se strice același lucru.
 *
 * Două feluri de „scoatere", fiindcă nu înseamnă același lucru:
 *  - „Scoate din CRM" retrage `crm.access`: omul rămâne în workspace (cererile PAR, semnăturile
 *    lui), doar CRM-ul nu mai e al lui. Poarta e pe server (middleware/requireCrmAccess).
 *  - „Dezactivează contul" închide contul în tot workspace-ul și îi taie sesiunile pe loc.
 * Niciuna nu șterge rândul: leadurile, activitățile și jurnalul trimit la el.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, gt, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { users, sessions } from "../db/schema/users";
import { tenants } from "../db/schema/tenants";
import { parInvites } from "../db/schema/par";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { userHasCrmAccess } from "../middleware/requireCrmAccess";
import { hasCrmAccess } from "../lib/crm/permissions";
import { logCrmAudit } from "../lib/crm/audit";
import { CRM_INVITE_ROLES, CRM_ROLE_LABELS, type CrmInviteRole } from "../lib/invites/grant";
import { generateInviteToken, hashInviteToken, inviteUrl, sendInviteEmail, INVITE_TTL_MS } from "../lib/par/invites";
import { isReservedPlatformEmail } from "../lib/platformOwner";
import { dropAllCachedSessions } from "../auth/session";

export const crmTeamRoutes = new Hono<{ Variables: AuthVariables }>();
crmTeamRoutes.use("/*", requireAuth);
crmTeamRoutes.use("/invites/:id", parUuidGuard("id"));
crmTeamRoutes.use("/members/:id", parUuidGuard("id"));
crmTeamRoutes.use("/members/:id/*", parUuidGuard("id"));

/** Conturi de beneficiar, nu de lucru — nu apar în echipa de vânzări. */
const NON_STAFF_ROLES: ("student" | "parent")[] = ["student", "parent"];

/** Doar administratorul workspace-ului dă și ia acces. Un drept pe care ți-l poți acorda singur nu e o limită. */
function isAdmin(role: string): boolean {
  return role === "admin";
}

const roleSchema = z.enum(CRM_INVITE_ROLES);

/** Numărul de administratori activi — ultimul nu poate fi retrogradat sau dezactivat. */
async function activeAdminCount(tenantId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin"), eq(users.isActive, true)));
  return Number(n);
}

async function findMember(tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId), notInArray(users.role, NON_STAFF_ROLES)));
  return row ?? null;
}

crmTeamRoutes.get("/", requireCrmPermission("audit.view"), async (c) => {
  const user = c.get("user");
  const [members, overrides, invites] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
      .from(users)
      .where(and(eq(users.tenantId, user.tenantId), notInArray(users.role, NON_STAFF_ROLES)))
      .orderBy(users.name),
    db
      .select({ userId: crmUserPermissions.userId, permission: crmUserPermissions.permission, granted: crmUserPermissions.granted })
      .from(crmUserPermissions)
      .where(eq(crmUserPermissions.tenantId, user.tenantId))
      .catch(() => []),
    db
      .select({
        id: parInvites.id,
        email: parInvites.email,
        role: parInvites.workspaceRole,
        expiresAt: parInvites.expiresAt,
        createdAt: parInvites.createdAt,
      })
      .from(parInvites)
      .where(
        and(
          eq(parInvites.tenantId, user.tenantId),
          eq(parInvites.module, "crm"),
          isNull(parInvites.acceptedAt),
          gt(parInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(parInvites.createdAt)),
  ]);

  const byUser = new Map<string, { permission: string; granted: boolean }[]>();
  for (const o of overrides) {
    const list = byUser.get(o.userId) ?? [];
    list.push({ permission: o.permission, granted: o.granted });
    byUser.set(o.userId, list);
  }

  return c.json({
    canManage: isAdmin(user.role),
    roles: CRM_INVITE_ROLES.map((key) => ({ key, label: CRM_ROLE_LABELS[key] })),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      isActive: m.isActive !== false,
      crmAccess: hasCrmAccess(m.role, byUser.get(m.id) ?? []),
      isSelf: m.id === user.id,
    })),
    invites,
  });
});

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: roleSchema,
});

crmTeamRoutes.post("/invites", zValidator("json", inviteSchema), async (c) => {
  const user = c.get("user");
  if (!isAdmin(user.role)) return c.json({ error: "forbidden" }, 403);
  const { email, role } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase();
  // Același lanț de preluare ca la invitațiile PAR: accept-invite creează contul fără dovada
  // posesiei cutiei poștale, deci emailurile de proprietar al platformei nu se pot invita.
  if (isReservedPlatformEmail(normalizedEmail)) return c.json({ error: "email_reserved" }, 403);

  // Refuzăm doar un om care ARE deja CRM-ul. Unul scos din CRM sau dezactivat se poate invita
  // înapoi — acceptarea îl reactivează și îi redă accesul.
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, user.tenantId), eq(users.email, normalizedEmail)));
  if (existing && existing.isActive !== false && !(NON_STAFF_ROLES as string[]).includes(existing.role) && (await userHasCrmAccess(existing))) {
    return c.json(
      { error: "already_member", detail: "Omul ăsta are deja acces în CRM. Schimbă-i rolul din listă." },
      409,
    );
  }

  // O re-invitație înlocuiește invitația CRM în așteptare (linkul vechi nu mai merge).
  await db
    .delete(parInvites)
    .where(
      and(
        eq(parInvites.tenantId, user.tenantId),
        eq(parInvites.email, normalizedEmail),
        eq(parInvites.module, "crm"),
        isNull(parInvites.acceptedAt),
      ),
    );

  const token = generateInviteToken();
  const [invite] = await db
    .insert(parInvites)
    .values({
      tenantId: user.tenantId,
      email: normalizedEmail,
      module: "crm",
      parRole: null,
      workspaceRole: role,
      tokenHash: hashInviteToken(token),
      invitedByUserId: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();

  const url = inviteUrl(token);
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
  const emailed = await sendInviteEmail({
    to: normalizedEmail,
    orgName: tenant?.name ?? "organizație",
    url,
    roleLabel: `${CRM_ROLE_LABELS[role]} (CRM)`,
    invitedByName: user.name,
  });

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "team.invited",
    target: "crm_invite",
    targetId: invite.id,
    after: { email: normalizedEmail, role },
  });

  return c.json(
    { id: invite.id, email: invite.email, role, expiresAt: invite.expiresAt, inviteUrl: url, emailed },
    201,
  );
});

crmTeamRoutes.delete("/invites/:id", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user.role)) return c.json({ error: "forbidden" }, 403);
  const [deleted] = await db
    .delete(parInvites)
    .where(
      and(
        eq(parInvites.id, c.req.param("id")),
        eq(parInvites.tenantId, user.tenantId),
        eq(parInvites.module, "crm"),
        isNull(parInvites.acceptedAt),
      ),
    )
    .returning({ id: parInvites.id, email: parInvites.email });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "team.invite_revoked",
    target: "crm_invite",
    targetId: deleted.id,
    before: { email: deleted.email },
  });
  return c.json({ ok: true });
});

/**
 * Regulile comune pentru orice schimbare pe un om: e din workspace, nu ești tu (nu-ți poți tăia
 * singur craca), iar ultimul administrator activ nu poate pierde rolul sau contul.
 */
async function guardMemberChange(
  actor: { id: string; tenantId: string; role: string },
  targetId: string,
  opts: { removesAdmin: (target: typeof users.$inferSelect) => boolean },
) {
  if (!isAdmin(actor.role)) return { error: "forbidden" as const, status: 403 as const };
  if (targetId === actor.id) return { error: "cannot_change_self" as const, status: 409 as const };
  const target = await findMember(actor.tenantId, targetId);
  if (!target) return { error: "not_found" as const, status: 404 as const };
  if (target.role === "admin" && target.isActive !== false && opts.removesAdmin(target) && (await activeAdminCount(actor.tenantId)) <= 1) {
    return { error: "last_admin" as const, status: 409 as const };
  }
  return { target };
}

crmTeamRoutes.patch("/members/:id", zValidator("json", z.object({ role: roleSchema })), async (c) => {
  const user = c.get("user");
  const { role } = c.req.valid("json");
  const guard = await guardMemberChange(user, c.req.param("id"), { removesAdmin: () => role !== "admin" });
  if ("error" in guard) return c.json({ error: guard.error }, guard.status);
  const { target } = guard;
  if (target.role === role) return c.json({ ok: true });

  await db
    .update(users)
    .set({ role: role as CrmInviteRole, updatedAt: new Date() })
    .where(and(eq(users.id, target.id), eq(users.tenantId, user.tenantId)));
  // Sesiunea ține în cache rândul omului (30 s, auth/session.ts) — cu tot cu rolul pe care îl
  // citesc porțile de drepturi. Fără golire, rolul nou s-ar aplica abia după expirare.
  dropAllCachedSessions();
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "team.role_changed",
    target: "crm_user",
    targetId: target.id,
    before: { role: target.role },
    after: { role },
  });
  return c.json({ ok: true });
});

crmTeamRoutes.put("/members/:id/access", zValidator("json", z.object({ crmAccess: z.boolean() })), async (c) => {
  const user = c.get("user");
  const { crmAccess } = c.req.valid("json");
  const guard = await guardMemberChange(user, c.req.param("id"), { removesAdmin: () => false });
  if ("error" in guard) return c.json({ error: guard.error }, guard.status);
  const { target } = guard;
  // Adminul trece mereu (vezi hasCrmAccess) — o retragere pe el ar fi un buton care nu face nimic.
  if (!crmAccess && target.role === "admin") return c.json({ error: "admin_always_has_access" }, 409);

  if (crmAccess) {
    // Readus: ștergem retragerea; dacă rolul nu-l are implicit (ex. retrogradat), îl acordăm explicit.
    await db
      .delete(crmUserPermissions)
      .where(
        and(
          eq(crmUserPermissions.tenantId, user.tenantId),
          eq(crmUserPermissions.userId, target.id),
          eq(crmUserPermissions.permission, "crm.access"),
        ),
      );
    if (!hasCrmAccess(target.role, [])) {
      await db.insert(crmUserPermissions).values({
        tenantId: user.tenantId,
        userId: target.id,
        permission: "crm.access",
        granted: true,
        grantedByUserId: user.id,
      });
    }
  } else {
    await db
      .insert(crmUserPermissions)
      .values({
        tenantId: user.tenantId,
        userId: target.id,
        permission: "crm.access",
        granted: false,
        grantedByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: [crmUserPermissions.userId, crmUserPermissions.permission],
        set: { granted: false, grantedByUserId: user.id, updatedAt: new Date() },
      });
  }

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: crmAccess ? "team.access_granted" : "team.access_revoked",
    target: "crm_user",
    targetId: target.id,
    after: { crmAccess },
  });
  return c.json({ ok: true });
});

crmTeamRoutes.put("/members/:id/active", zValidator("json", z.object({ active: z.boolean() })), async (c) => {
  const user = c.get("user");
  const { active } = c.req.valid("json");
  const guard = await guardMemberChange(user, c.req.param("id"), { removesAdmin: () => !active });
  if ("error" in guard) return c.json({ error: guard.error }, guard.status);
  const { target } = guard;

  await db
    .update(users)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(users.id, target.id), eq(users.tenantId, user.tenantId)));
  if (!active) {
    // Un cont dezactivat iese ACUM, nu când îi expiră sesiunea peste 30 de zile. `requireAuth`
    // refuză oricum un cont inactiv; ștergerea sesiunilor e ca nici un tab deschis să nu mai
    // pară „logat" și ca o reactivare să ceară o autentificare nouă.
    await db.delete(sessions).where(and(eq(sessions.userId, target.id), ne(sessions.userId, user.id)));
  }
  // Contractul din auth/session.ts: dezactivarea golește cache-ul de sesiuni. Altfel omul ar mai
  // lucra încă până la 30 s cu `isActive: true` din cache (prins de smoke-ul live, 2026-09-26).
  dropAllCachedSessions();
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: active ? "team.reactivated" : "team.deactivated",
    target: "crm_user",
    targetId: target.id,
    after: { active },
  });
  return c.json({ ok: true });
});
