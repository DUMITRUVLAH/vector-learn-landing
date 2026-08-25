/**
 * Who may LOOK at a PAR — one rule, used by every read path.
 *
 * The rule was copy-pasted inline into GET /:id, the duplicate action, the timeline, the dosar
 * download and the comments/quotes handlers. Each copy drifted: the dosar handed a full PDF
 * (payee IBAN/IDNP + bank documents) of another user's UNSUBMITTED draft to any approver, because
 * its copy stopped at "has an elevated role". CORE §1/§9: a draft has not been routed to anybody,
 * so it stays with its author; only a workspace admin/manager keeps the support-level view.
 */
import { getUserPARRoles } from "../../middleware/requirePARRole";
import { isWorkspaceAdminRole } from "./roles";

const ELEVATED_PAR_ROLES = ["approver", "finance", "par_admin"] as const;

export { isWorkspaceAdminRole };

export async function canViewPar(
  user: { id: string; role?: string | null },
  tenantId: string,
  par: { requestedByUserId: string | null; status?: string | null }
): Promise<boolean> {
  if (par.requestedByUserId === user.id) return true;
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.some((r) => (ELEVATED_PAR_ROLES as readonly string[]).includes(r))) return false;
  if (par.status === "draft" && !isWorkspaceAdminRole(user.role)) return false;
  return true;
}
