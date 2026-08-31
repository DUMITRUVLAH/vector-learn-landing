/**
 * DC-101 — căile modulului de documente, într-un singur loc.
 *
 * Documentele trăiesc ACUM sub PAR (`/business/par/documente`), nu pe `/business/docs`. Motivul e
 * de navigare, nu de estetică: meniul din stânga se alege după prefixul rutei, deci un act deschis
 * de pe `/business/docs` schimba tot sidebarul (din meniul PAR în meniul cu toate modulele) și
 * pagina „sărea" sub cursor. Sub același prefix, meniul rămâne pe loc.
 *
 * Căile vechi nu mor: `App.tsx` le redirecționează, iar linkurile trimise pe email încă funcționează.
 * De aceea toate navigările trec pe aici — dacă mutăm modulul din nou, se schimbă un fișier.
 */

/** Rădăcina modulului. Orice cale de mai jos pornește din ea. */
export const DOCS_BASE = "/business/par/documente";

/** Prefixul vechi, păstrat doar pentru redirecționare și pentru testele care îl acoperă. */
export const DOCS_LEGACY_BASE = "/business/docs";

export const docsListPath = (): string => DOCS_BASE;
export const docsNewPath = (): string => `${DOCS_BASE}/nou`;
export const docsTemplatesPath = (): string => `${DOCS_BASE}/sabloane`;
export const docPath = (id: string): string => `${DOCS_BASE}/${id}`;
export const docsProjectDossierPath = (projectId: string): string => `${DOCS_BASE}/proiect/${projectId}`;
export const docsCounterpartyDossierPath = (vendorId: string): string => `${DOCS_BASE}/contraparte/${vendorId}`;

/**
 * Traduce o cale veche în cea nouă, păstrând ce vine după prefix.
 * `/business/docs/templates` → `/business/par/documente/sabloane` (fila și-a schimbat și numele).
 */
export function migrateLegacyDocsPath(path: string): string {
  const rest = path.slice(DOCS_LEGACY_BASE.length);
  if (rest === "/templates" || rest.startsWith("/templates/")) {
    return `${DOCS_BASE}/sabloane${rest.slice("/templates".length)}`;
  }
  return `${DOCS_BASE}${rest}`;
}

/**
 * Segmentele care NU sunt id de document, deși stau pe aceeași poziție în cale.
 * Fără lista asta, `/documente/nou` ar fi citit ca „actul cu id-ul «nou»".
 */
const RESERVED_SEGMENTS = new Set(["nou", "sabloane", "templates", "proiect", "contraparte"]);

/**
 * Id-ul actului din calea curentă — indiferent dacă ruta e cea nouă (`/business/par/documente/:id`)
 * sau cea veche (`/business/docs/:id`).
 *
 * De ce nu tăiem un prefix fix: exact așa s-a rupt fișa PAR când modulul a fost mutat de pe
 * `/app/par/*` pe `/business/par/*` — pagina scotea `id=""` și orice act deschis dădea 404, în timp
 * ce testele rămâneau verzi pe ruta moartă (CLAUDE.md §3.5.1quater).
 */
export function documentIdFromPath(path: string): string | null {
  const m = path.match(/\/(?:documente|docs)\/([^/?]+)/);
  const id = m?.[1];
  return id && !RESERVED_SEGMENTS.has(id) ? id : null;
}

export type DossierTarget = { kind: "project" | "counterparty"; id: string };

/** Ținta dosarului din cale: proiect sau contraparte, pe ambele variante de rută. */
export function dossierTargetFromPath(path: string): DossierTarget | null {
  const project = path.match(/\/(?:documente|docs)\/proiect\/([^/?]+)/);
  if (project) return { kind: "project", id: project[1] };
  const party = path.match(/\/(?:documente|docs)\/contraparte\/([^/?]+)/);
  if (party) return { kind: "counterparty", id: party[1] };
  return null;
}
