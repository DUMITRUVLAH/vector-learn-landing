/**
 * CRM Faza 9 — matricea de permisiuni pe rolurile workspace-ului.
 *
 * Portare din crm-vector (`src/lib/crm/roles.ts`), cu o adaptare impusă de produs: acolo se
 * adăugau roluri NOI în baza de date (`director_comercial`, `team_leader`, `sales_manager`).
 * Aici rolurile există deja pe `users.role` și sunt folosite de tot restul aplicației (PAR,
 * finanțe, școală) — un al doilea set de roluri, doar pentru CRM, ar însemna două răspunsuri la
 * întrebarea „cine e omul ăsta". Deci matricea se așază peste rolurile existente.
 *
 * Permisiunile sunt DATE, nu verificări împrăștiate prin cod: orice drept nou se adaugă aici și
 * în matrice, iar `can` rămâne o funcție pură — testabilă fără bază de date.
 *
 * O notă despre `leads.view_all`: îl au TOATE rolurile care pot intra azi în CRM. Nu e o scăpare,
 * e o decizie — până acum oricine deschidea modulul vedea toate leadurile workspace-ului, iar o
 * restrângere tăcută ar lua vederea de ansamblu unor oameni care se bazează pe ea de luni de zile.
 * Diferențierea pe care o aduce faza asta e pe acțiunile ADMINISTRATIVE și distructive
 * (ștergere, produse, distribuire, jurnal, export).
 */
export type CrmPermission =
  | "crm.access"
  | "leads.view_all"
  | "leads.view_own"
  | "leads.edit"
  | "leads.delete"
  | "leads.export"
  | "reports.view_team"
  | "reports.view_own"
  | "documents.create"
  | "products.manage"
  | "pipelines.manage"
  | "automations.manage"
  | "assignment.manage"
  | "cadences.manage"
  | "audit.view";

/** Rolurile de workspace ale FinFlow (`users.role`). */
export type WorkspaceRole = "admin" | "manager" | "teacher" | "receptionist" | "student" | "parent";

const COMMERCIAL_BASE: CrmPermission[] = [
  "crm.access",
  "leads.view_all",
  "leads.view_own",
  "leads.edit",
  "reports.view_own",
  "documents.create",
];

/**
 * Cine ce poate. Ierarhia, în cuvinte:
 *  - `admin` — tot;
 *  - `manager` — tot ce ține de comercial, inclusiv jurnalul și distribuirea;
 *  - `teacher` / `receptionist` — lucrează cu leadurile (văd tabla întreagă, editează, fac acte),
 *    dar NU șterg leaduri, nu umblă la produse, la pâlnii, la automatizări sau la jurnal;
 *  - `student` / `parent` — nimic: CRM-ul nu e pentru ei.
 */
export const CRM_ROLE_PERMISSIONS: Record<WorkspaceRole, CrmPermission[]> = {
  admin: [
    "crm.access",
    "leads.view_all",
    "leads.view_own",
    "leads.edit",
    "leads.delete",
    "leads.export",
    "reports.view_team",
    "reports.view_own",
    "documents.create",
    "products.manage",
    "pipelines.manage",
    "automations.manage",
    "assignment.manage",
    "cadences.manage",
    "audit.view",
  ],
  manager: [
    ...COMMERCIAL_BASE,
    "leads.delete",
    "leads.export",
    "reports.view_team",
    "products.manage",
    "pipelines.manage",
    "automations.manage",
    "assignment.manage",
    "cadences.manage",
    "audit.view",
  ],
  teacher: [...COMMERCIAL_BASE],
  receptionist: [...COMMERCIAL_BASE],
  student: [],
  parent: [],
};

function permissionsOf(role: string): CrmPermission[] {
  return CRM_ROLE_PERMISSIONS[role as WorkspaceRole] ?? [];
}

/** Pură: are rolul ăsta dreptul cerut? Un rol necunoscut nu primește nimic. */
export function can(role: string, permission: CrmPermission): boolean {
  return permissionsOf(role).includes(permission);
}

/** Pură: are rolul cel puțin unul dintre drepturi? */
export function canAny(role: string, permissions: readonly CrmPermission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Tot ce poate rolul — asta primește interfața, ca să nu arate butoane care oricum ar da 403. */
export function listPermissions(role: string): CrmPermission[] {
  return [...permissionsOf(role)];
}


// ─── Excepții pe om (cerința 60) ──────────────────────────────────────────────

/** O excepție citită din `crm_user_permissions`. */
export interface PermissionOverride {
  permission: string;
  granted: boolean;
}

/**
 * Drepturile EFECTIVE ale unui om: matricea rolului, plus ce i s-a acordat în plus, minus ce i
 * s-a retras. Pură — stratul de date doar îi aduce excepțiile.
 *
 * Ordinea contează: retragerea bate acordarea. Dacă cineva a scris ambele pentru același drept
 * (n-ar trebui — indexul unic o împiedică), interpretarea sigură e cea restrictivă.
 */
export function effectivePermissions(role: string, overrides: readonly PermissionOverride[]): CrmPermission[] {
  const set = new Set<string>(permissionsOf(role));
  for (const o of overrides) if (o.granted) set.add(o.permission);
  for (const o of overrides) if (!o.granted) set.delete(o.permission);
  return [...set] as CrmPermission[];
}

/** Pură: are omul dreptul, ținând cont de excepții? */
export function canWithOverrides(
  role: string,
  overrides: readonly PermissionOverride[],
  permission: CrmPermission
): boolean {
  return effectivePermissions(role, overrides).includes(permission);
}

// ─── Intrarea în modul ────────────────────────────────────────────────────────

/**
 * Poate omul să intre deloc în CRM? `crm.access` e dreptul-poartă: îl au implicit toate rolurile
 * de lucru (exact ca înainte, când oricine din echipă deschidea modulul), iar administratorul îl
 * RETRAGE pe om din ecranul „Echipă" — omul rămâne în workspace (cererile PAR, semnăturile lui),
 * doar că CRM-ul nu mai e al lui.
 *
 * Administratorul trece mereu: un workspace în care ultimul admin și-a tăiat singur accesul n-ar
 * mai avea pe nimeni care să-l repună. Ca să scoți un admin din CRM, îi schimbi întâi rolul.
 */
export function hasCrmAccess(role: string, overrides: readonly PermissionOverride[]): boolean {
  if (role === "admin") return true;
  return effectivePermissions(role, overrides).includes("crm.access");
}
