/**
 * NAV-08: căile modulului IT Park, într-un singur loc.
 *
 * Modulul a fost scris pentru aplicația veche (`/app/fin/itpark/*`). Când FinDesk s-a mutat pe
 * `/business/fin/*`, în dispecer a ajuns o singură rută, iar fiecare pagină își extrăgea id-ul cu un
 * prefix fix (`/^\/app\/fin\/itpark\/…/`). Pe ruta nouă id-ul ieșea gol: fișa rămânea pe spinner
 * pentru totdeauna, iar lista, asistentul, anexele și scrisorile nu erau accesibile deloc.
 *
 * De aceea: toate linkurile trec pe aici, iar id-ul se citește fără prefix (§3.5.1quater — dacă
 * modulul se mută din nou, se schimbă `ITPARK_BASE`, nu zece pagini).
 */
export const ITPARK_BASE = "/business/fin/itpark";

export const itparkListPath = (): string => ITPARK_BASE;
export const itparkNewPath = (): string => `${ITPARK_BASE}/new`;
export const itparkDashboardPath = (): string => `${ITPARK_BASE}/dashboard`;
export const itparkPath = (id: string): string => `${ITPARK_BASE}/${id}`;

/** Sub-paginile unui dosar. */
export type ItparkSubPage = "anexa2" | "anexa3" | "anexa4" | "scrisori" | "ready" | "declaratie" | "edit";
export const itparkSubPath = (id: string, sub: ItparkSubPage): string => `${ITPARK_BASE}/${id}/${sub}`;

/** Segmente care NU sunt id-uri de dosar, deși stau pe aceeași poziție. */
const RESERVED = new Set(["new", "dashboard"]);

/**
 * Id-ul dosarului din rută, oricare ar fi prefixul (`/business/fin/itpark/<id>`, `/app/fin/itpark/<id>`,
 * cu sau fără sub-pagină și query). Întoarce "" când ruta nu e a unui dosar.
 */
export function itparkIdFromPath(path: string): string {
  const id = path.match(/\/itpark\/([^/?#]+)/)?.[1] ?? "";
  return RESERVED.has(id) ? "" : decodeURIComponent(id);
}
