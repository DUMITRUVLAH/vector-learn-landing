/**
 * Who may LOOK at a PAR — one rule, used by every read path.
 *
 * The rule was copy-pasted inline into GET /:id, the duplicate action, the timeline, the dosar
 * download and the comments/quotes handlers. Each copy drifted: the dosar handed a full PDF
 * (payee IBAN/IDNP + bank documents) of another user's UNSUBMITTED draft to any approver, because
 * its copy stopped at "has an elevated role". CORE §1/§9: a draft has not been routed to anybody,
 * so it stays with its author; only a workspace admin/manager keeps the support-level view.
 *
 * SECURITY (audit 2026-08-29) — a doua jumătate a regulii lipsea: rolul era verificat, ARIA nu.
 * `GET /api/par/:id` își adăuga singur verificarea de proiect/plătitor, dar celelalte căi de
 * citire nu: `/:id/dosar` (PDF cu IBAN/IDNP), `/:id/timeline`, `/:id/comments` (citire ȘI
 * scriere), `/:id/quotes` și rutele e-Factura. Un aprobator invitat strict pe proiectul unui
 * donator descărca dosarul complet al unei cereri din alt proiect — ceea ce `GET /:id` îi
 * refuza cu 404. Acum aria e verificată AICI, deci toate căile o moștenesc, iar `projectId` și
 * `payerId` sunt obligatorii în tip: un apelant nou nu poate „uita" scope-ul fără să pice compilarea.
 */
import { getUserPARRoles } from "../../middleware/requirePARRole";
import { isWorkspaceAdminRole } from "./roles";
import { accessiblePayerIds, mayAccessPayer, mayAccessProject } from "./projectScope";

const ELEVATED_PAR_ROLES = ["approver", "finance", "par_admin"] as const;

export { isWorkspaceAdminRole };

export async function canViewPar(
  user: { id: string; role?: string | null },
  tenantId: string,
  par: {
    requestedByUserId: string | null;
    status?: string | null;
    /** Obligatorii: fără ele nu se poate verifica aria. Vezi antetul fișierului. */
    projectId: string | null;
    payerId: string | null;
  }
): Promise<boolean> {
  if (par.requestedByUserId === user.id) return true;
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.some((r) => (ELEVATED_PAR_ROLES as readonly string[]).includes(r))) return false;
  if (par.status === "draft" && !isWorkspaceAdminRole(user.role ?? undefined)) return false;
  return parInUserScope(user, tenantId, par);
}

/**
 * Aria: aceleași reguli ca filtrul din `GET /api/par` (server/routes/par.ts), ca lista și
 * detaliul să nu spună lucruri diferite despre aceeași cerere.
 */
async function parInUserScope(
  user: { id: string; role?: string | null },
  tenantId: string,
  par: { projectId: string | null; payerId: string | null }
): Promise<boolean> {
  if (par.projectId) return mayAccessProject(user.id, tenantId, par.projectId, user.role ?? undefined);
  if (par.payerId) return mayAccessPayer(user.id, tenantId, par.payerId, user.role ?? undefined);
  // Nici proiect, nici plătitor (plătitor șters): nu există arie de verificat, deci o văd doar
  // cei fără restricție de arie — exact ca în listă, unde un asemenea rând nu prinde niciun filtru.
  return (await accessiblePayerIds(user.id, tenantId, user.role ?? undefined)) === null;
}
