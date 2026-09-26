/**
 * Verificarea unui drept CRM ÎN INTERIORUL unei rute — pentru cazurile în care lipsa dreptului nu
 * înseamnă 403, ci un răspuns mai îngust (ex. rapoartele: agentul fără `reports.view_team` vede
 * doar cifrele lui, nu o pagină interzisă).
 *
 * Aceeași regulă ca poarta `requireCrmPermission`: rolul dă dreptul implicit, excepțiile omului
 * din `crm_user_permissions` îl pot da sau lua. Excepțiile se citesc la fiecare cerere, fără cache —
 * un drept retras trebuie să dispară imediat.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { crmUserPermissions } from "../../db/schema/crmUserPermissions";
import { canWithOverrides, type CrmPermission } from "./permissions";

export async function userHasCrmPermission(
  user: { id: string; tenantId: string; role: string },
  permission: CrmPermission
): Promise<boolean> {
  let overrides: { permission: string; granted: boolean }[] = [];
  try {
    overrides = await db
      .select({ permission: crmUserPermissions.permission, granted: crmUserPermissions.granted })
      .from(crmUserPermissions)
      .where(and(eq(crmUserPermissions.tenantId, user.tenantId), eq(crmUserPermissions.userId, user.id)));
  } catch {
    // Tabelă lipsă (schema în urma codului) = fără excepții, doar dreptul rolului — ca poarta.
    overrides = [];
  }
  return canWithOverrides(user.role, overrides, permission);
}
