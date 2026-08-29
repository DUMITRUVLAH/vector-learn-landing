/**
 * Dicționar `par.*` — modulul PAR (cereri de plată, aprobări, execuție).
 *
 * Migrat din vechiul `src/lib/i18n.ts` plat (VF-304), cu prefix de modul. Datele
 * din baza de date (nume de proiecte, departamente, furnizori) **nu se traduc
 * niciodată** — doar chrome-ul de interfață.
 *
 * `par.status.*` folosește exact valorile din enum-ul de status al cererii, ca
 * `t(\`par.status.${status}\`)` să fie verificat de TypeScript la compilare.
 */
import type { Dict, Translated } from "../types";

export const ro = {
  // ── navigație ──────────────────────────────────────────────────────────────
  "par.nav.requests": "Cereri PAR",
  "par.nav.new": "Cerere nouă",
  "par.nav.inbox": "Inbox aprobare",
  "par.nav.finance": "Finanțe",
  "par.nav.reports": "Rapoarte",
  "par.nav.admin": "Admin",
  "par.nav.folders": "Dosare",
  "par.nav.exchange": "Curs valutar",
  "par.nav.efactura": "e-Factura",

  // ── autentificare ──────────────────────────────────────────────────────────
  "par.login.subtitle": "Conectează-te pentru a accesa fluxul de aprobări financiare",
  "par.login.email": "Email",
  "par.login.password": "Parolă",
  "par.login.submit": "Conectare",
  "par.login.withEmail": "sau cu email",
  "par.login.google": "Continuă cu Google",

  // ── listă cereri ───────────────────────────────────────────────────────────
  "par.dashboard.title": "Cereri de plată (PAR)",
  "par.dashboard.subtitle": "Gestionează cererile de plată ale organizației",
  "par.dashboard.new": "Cerere nouă",
  "par.dashboard.total": "Total cereri",
  "par.dashboard.active": "Activ (estimat)",
  "par.dashboard.paid": "Total plătit",
  "par.dashboard.searchPlaceholder": "Caută după număr…",

  // ── cerere nouă ────────────────────────────────────────────────────────────
  "par.create.title": "Cerere nouă de plată",
  "par.create.totalEstimated": "TOTAL ESTIMAT",
  "par.create.submit": "Trimite pentru aprobare",
  "par.create.saveDraft": "Salvează ciornă",

  // ── inbox aprobatori ───────────────────────────────────────────────────────
  "par.inbox.title": "Inbox aprobatori",
  "par.inbox.subtitle": "Cereri PAR care așteaptă decizia dvs.",
  "par.inbox.empty": "Nicio cerere în așteptare.",

  // ── statusuri (cheile = valorile din enum) ─────────────────────────────────
  "par.status.draft": "Ciornă",
  "par.status.pending_approval": "În aprobare",
  "par.status.changes_requested": "Modificări solicitate",
  "par.status.rejected": "Respinsă",
  "par.status.approved": "Aprobată",
  "par.status.in_finance": "La finanțe",
  "par.status.reapproval_required": "Reaprobare necesară",
  "par.status.paid": "Plătită",
  "par.status.cancelled": "Anulată",

  // ── roluri ─────────────────────────────────────────────────────────────────
  "par.role.requestor": "Solicitant",
  "par.role.approver": "Aprobator",
  "par.role.finance": "Finanțe",
  "par.role.par_admin": "Administrator PAR",
} as const satisfies Dict;

export const en: Translated<typeof ro> = {
  // ── navigation ─────────────────────────────────────────────────────────────
  "par.nav.requests": "PAR requests",
  "par.nav.new": "New request",
  "par.nav.inbox": "Approval inbox",
  "par.nav.finance": "Finance",
  "par.nav.reports": "Reports",
  "par.nav.admin": "Admin",
  "par.nav.folders": "Folders",
  "par.nav.exchange": "Exchange rates",
  "par.nav.efactura": "e-Invoice",

  // ── sign in ────────────────────────────────────────────────────────────────
  "par.login.subtitle": "Sign in to access the financial approval flow",
  "par.login.email": "Email",
  "par.login.password": "Password",
  "par.login.submit": "Sign in",
  "par.login.withEmail": "or with email",
  "par.login.google": "Continue with Google",

  // ── request list ───────────────────────────────────────────────────────────
  "par.dashboard.title": "Payment requests (PAR)",
  "par.dashboard.subtitle": "Manage your organization's payment requests",
  "par.dashboard.new": "New request",
  "par.dashboard.total": "Total requests",
  "par.dashboard.active": "Active (estimated)",
  "par.dashboard.paid": "Total paid",
  "par.dashboard.searchPlaceholder": "Search by number…",

  // ── new request ────────────────────────────────────────────────────────────
  "par.create.title": "New payment request",
  "par.create.totalEstimated": "ESTIMATED TOTAL",
  "par.create.submit": "Submit for approval",
  "par.create.saveDraft": "Save draft",

  // ── approver inbox ─────────────────────────────────────────────────────────
  "par.inbox.title": "Approver inbox",
  "par.inbox.subtitle": "PAR requests awaiting your decision.",
  "par.inbox.empty": "No requests pending.",

  // ── statuses (keys = enum values) ──────────────────────────────────────────
  "par.status.draft": "Draft",
  "par.status.pending_approval": "Pending approval",
  "par.status.changes_requested": "Changes requested",
  "par.status.rejected": "Rejected",
  "par.status.approved": "Approved",
  "par.status.in_finance": "In finance",
  "par.status.reapproval_required": "Reapproval required",
  "par.status.paid": "Paid",
  "par.status.cancelled": "Cancelled",

  // ── roles ──────────────────────────────────────────────────────────────────
  "par.role.requestor": "Requester",
  "par.role.approver": "Approver",
  "par.role.finance": "Finance",
  "par.role.par_admin": "PAR administrator",
};
