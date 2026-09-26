/**
 * CRM Faza 9 — ce poate face utilizatorul curent.
 *
 * Montat la /api/crm/permissions.
 *
 * Interfața cere lista o dată și ascunde ce n-are rost să arate. Ascunderea NU e apărarea:
 * fiecare rută administrativă are propria poartă (`requireCrmPermission`) — asta e doar ca omul
 * să nu vadă butoane care oricum ar da 403.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { effectivePermissions, listPermissions, CRM_ROLE_PERMISSIONS } from "../lib/crm/permissions";
import { logCrmAudit } from "../lib/crm/audit";

export const crmPermissionsRoutes = new Hono<{ Variables: AuthVariables }>();
crmPermissionsRoutes.use("/*", requireAuth);

crmPermissionsRoutes.get("/", async (c) => {
  const user = c.get("user");
  let overrides: { permission: string; granted: boolean }[] = [];
  try {
    overrides = await db
      .select({ permission: crmUserPermissions.permission, granted: crmUserPermissions.granted })
      .from(crmUserPermissions)
      .where(and(eq(crmUserPermissions.tenantId, user.tenantId), eq(crmUserPermissions.userId, user.id)));
  } catch {
    // Schema în urma codului: fără excepții, adică exact comportamentul de dinainte.
  }
  return c.json({
    role: user.role,
    permissions: effectivePermissions(user.role, overrides),
    /** Ce vine din rol, separat de excepții — ca ecranul de administrare să poată arăta diferența. */
    fromRole: listPermissions(user.role),
  });
});

// ─── Administrarea drepturilor echipei (cerința 60) ───────────────────────────

/**
 * Cine poate schimba drepturile altora: doar cine are `users.manage`… pe care matricea CRM nu-l
 * are. Îl legăm de `audit.view` + rolul de administrator: dreptul de a da drepturi nu poate fi el
 * însuși un drept pe care ți-l poți acorda singur.
 */
const ADMIN_ROLES = ["admin", "owner"];

crmPermissionsRoutes.get("/team", requireCrmPermission("audit.view"), async (c) => {
  const user = c.get("user");
  const [members, overrides] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.tenantId, user.tenantId)),
    db
      .select({
        userId: crmUserPermissions.userId,
        permission: crmUserPermissions.permission,
        granted: crmUserPermissions.granted,
      })
      .from(crmUserPermissions)
      .where(eq(crmUserPermissions.tenantId, user.tenantId))
      .catch(() => []),
  ]);

  const byUser = new Map<string, { permission: string; granted: boolean }[]>();
  for (const o of overrides) {
    const list = byUser.get(o.userId) ?? [];
    list.push({ permission: o.permission, granted: o.granted });
    byUser.set(o.userId, list);
  }

  return c.json({
    /** Ce poate fiecare rol, ca ecranul să arate de unde vine fiecare drept. */
    roleMatrix: CRM_ROLE_PERMISSIONS,
    members: members
      .filter((m) => m.isActive !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        overrides: byUser.get(m.id) ?? [],
        effective: effectivePermissions(m.role, byUser.get(m.id) ?? []),
      })),
  });
});

const setPermissionSchema = z.object({
  userId: z.string().uuid(),
  permission: z.string().min(1).max(64),
  /** `true` = acordă peste rol, `false` = retrage, `null` = șterge excepția (revine la rol). */
  granted: z.boolean().nullable(),
});

crmPermissionsRoutes.put("/team", zValidator("json", setPermissionSchema), async (c) => {
  const user = c.get("user");
  if (!ADMIN_ROLES.includes(user.role)) return c.json({ error: "forbidden", permission: "users.manage" }, 403);

  const body = c.req.valid("json");

  // Omul trebuie să fie din workspace-ul curent — altfel s-ar putea da drepturi în baza altcuiva.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, body.userId), eq(users.tenantId, user.tenantId)));
  if (!target) return c.json({ error: "not_found" }, 404);

  if (body.granted === null) {
    await db
      .delete(crmUserPermissions)
      .where(
        and(
          eq(crmUserPermissions.tenantId, user.tenantId),
          eq(crmUserPermissions.userId, body.userId),
          eq(crmUserPermissions.permission, body.permission)
        )
      );
  } else {
    await db
      .insert(crmUserPermissions)
      .values({
        tenantId: user.tenantId,
        userId: body.userId,
        permission: body.permission,
        granted: body.granted,
        grantedByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: [crmUserPermissions.userId, crmUserPermissions.permission],
        set: { granted: body.granted, grantedByUserId: user.id, updatedAt: new Date() },
      });
  }

  // Cine a dat sau a luat un drept e exact genul de lucru pentru care există jurnalul.
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "permission.changed",
    // Ținta e un OM al echipei, nu un lead — altfel filtrul jurnalului pe `crm_user` n-o găsește.
    target: "crm_user",
    targetId: body.userId,
    after: { permission: body.permission, granted: body.granted },
  });

  return c.json({ ok: true });
});
