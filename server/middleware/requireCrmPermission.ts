/**
 * CRM Faza 9 — poarta de permisiuni pentru rutele CRM.
 *
 * Verificarea stă pe server, nu doar în interfață: un buton ascuns e o curtoazie, nu o limită.
 * Matricea e în `server/lib/crm/permissions.ts` (date, nu verificări împrăștiate prin cod).
 *
 * Răspunde 403 cu dreptul care lipsește — un „forbidden" gol nu-i spune nimănui ce să ceară de
 * la administrator.
 */
import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { canWithOverrides, type CrmPermission } from "../lib/crm/permissions";
import type { AuthVariables } from "./requireAuth";

/**
 * Excepțiile omului, citite la fiecare verificare. Fără memorare în proces: pe serverless
 * procesele mor și renasc oricum, iar un drept retras trebuie să dispară IMEDIAT, nu după ce
 * expiră un cache pe care nimeni nu-l poate goli.
 *
 * Nu aruncă: o tabelă lipsă (schema în urma codului) înseamnă „fără excepții", adică exact
 * comportamentul de dinainte — nu un 500 pe fiecare rută CRM.
 */
async function overridesFor(userId: string, tenantId: string) {
  try {
    return await db
      .select({ permission: crmUserPermissions.permission, granted: crmUserPermissions.granted })
      .from(crmUserPermissions)
      .where(and(eq(crmUserPermissions.tenantId, tenantId), eq(crmUserPermissions.userId, userId)));
  } catch {
    return [];
  }
}

export function requireCrmPermission(permission: CrmPermission): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);

    const overrides = await overridesFor(user.id, user.tenantId);
    if (!canWithOverrides(user.role, overrides, permission)) {
      return c.json({ error: "forbidden", permission }, 403);
    }
    await next();
  };
}
