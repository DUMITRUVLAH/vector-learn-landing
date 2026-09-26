/**
 * Adresa fișei unui client: `/business/crm/clienti/<id>`.
 *
 * Id-ul se citește indiferent de prefixul rutei — lecția ParDetail (CLAUDE.md §3.5.1quater): un
 * `replace` pe un prefix fix se rupe tăcut când ruta se mută.
 */
const LIST_PATH = "/business/crm/clienti";

export function companyHref(id: string): string {
  return `${LIST_PATH}/${encodeURIComponent(id)}`;
}

export function companyIdFromPath(path: string): string | null {
  const m = path.match(/\/clienti\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const COMPANIES_LIST_PATH = LIST_PATH;
