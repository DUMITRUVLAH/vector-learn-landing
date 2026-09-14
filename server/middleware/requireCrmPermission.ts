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
import { can, type CrmPermission } from "../lib/crm/permissions";
import type { AuthVariables } from "./requireAuth";

export function requireCrmPermission(permission: CrmPermission): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    if (!can(user.role, permission)) {
      return c.json({ error: "forbidden", permission }, 403);
    }
    await next();
  };
}
