/**
 * Poarta de intrare în CRM — „scos din CRM" trebuie să însemne scos, nu doar ascuns din meniu.
 *
 * Montată o singură dată în app.ts pe `/api/crm/*`, înaintea routerelor CRM (fiecare își are
 * propriul `requireAuth`). De aceea NU răspunde 401 singură: fără sesiune validă lasă cererea să
 * treacă, iar `requireAuth` din router dă răspunsul canonic. Cu sesiune validă, cere `crm.access`
 * (vezi lib/crm/permissions.hasCrmAccess): implicit îl au toate rolurile de lucru, administratorul
 * îl poate retrage pe om din ecranul „Echipă".
 *
 * Căile care nu sunt ale echipei (captarea din site-ul clientului, cron-ul, diagnosticul) nu trec
 * prin poartă — n-au sesiune de om, iar un vizitator care întâmplător are și cont n-ar trebui să
 * piardă formularul de pe site.
 */
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import { SESSION_COOKIE, getSessionUser } from "../auth/session";
import { db } from "../db/client";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { platformAdmins } from "../db/schema/par";
import { hasCrmAccess } from "../lib/crm/permissions";

const UNGATED_PREFIXES = ["/api/crm/intake", "/api/crm/cron", "/api/crm/health"];

/** Excepțiile de drept ale omului; o tabelă lipsă = fără excepții (comportamentul de dinainte). */
export async function crmOverridesFor(userId: string, tenantId: string) {
  try {
    return await db
      .select({ permission: crmUserPermissions.permission, granted: crmUserPermissions.granted })
      .from(crmUserPermissions)
      .where(and(eq(crmUserPermissions.tenantId, tenantId), eq(crmUserPermissions.userId, userId)));
  } catch {
    return [];
  }
}

/** Are omul voie în CRM? Superadminul de platformă trece mereu (el testează modulele). */
export async function userHasCrmAccess(user: { id: string; tenantId: string; role: string }): Promise<boolean> {
  if (user.role === "admin") return true;
  if (hasCrmAccess(user.role, await crmOverridesFor(user.id, user.tenantId))) return true;
  try {
    const [superadmin] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, user.id))
      .limit(1);
    return !!superadmin;
  } catch {
    return false;
  }
}

export const requireCrmAccess: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (UNGATED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return next();
  const result = await getSessionUser(token);
  if (!result || result.user.isActive === false) return next();

  if (!(await userHasCrmAccess(result.user))) {
    return c.json({ error: "crm_access_revoked" }, 403);
  }
  await next();
};
