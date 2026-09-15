/**
 * CRM — filtrele de segmentare, partea PURĂ (cerința 4 din caietul de sarcini).
 *
 * De ce stau separat de `src/lib/api/crm.ts`, deși sunt despre aceleași filtre: acolo trăiesc
 * cererile către server, iar ecranele care se testează îl înlocuiesc cu un dublu (`vi.mock`).
 * O funcție pură ajunsă în modulul de rețea obligă fiecare test de CRM să știe de ea — s-a
 * întâmplat exact asta: adăugarea contorului de segmente a picat opt suite care doar randau
 * pipeline-ul. Regula rămâne: în `api/` doar ce vorbește cu serverul.
 */

/**
 * Filtrele de segmentare. Firmografia (industrie/regiune/mărime/consum) se citește prin firma
 * leadului (`crm_companies`), unde are coloane reale; produsul stă pe lead.
 *
 * Aceleași câmpuri se trimit în ambele vederi (tablă și listă) — un filtru care ar însemna
 * altceva în kanban decât în listă ar fi o capcană, nu o funcție.
 */
export interface CrmSegmentFilters {
  productId?: string;
  industry?: string;
  region?: string;
  companySize?: string;
  minConsumptionKwh?: number;
  maxConsumptionKwh?: number;
}

/** Cheile care SUNT segmentare. Orice altceva (căutare, sortare, vedere) nu intră aici. */
export const CRM_SEGMENT_KEYS = [
  "productId",
  "industry",
  "region",
  "companySize",
  "minConsumptionKwh",
  "maxConsumptionKwh",
] as const satisfies readonly (keyof CrmSegmentFilters)[];

/**
 * Scoate cheile goale ȘI pe cele care nu sunt segmentare — un `?industry=` gol ar fi însemnat pe
 * server „filtrează pe nimic", iar o vizualizare salvată (care poartă și `view`, `sort`, `dir`)
 * și-ar fi trimis toată structura în query string-ul de segment.
 */
export function cleanCrmSegments(segments: CrmSegmentFilters): CrmSegmentFilters {
  const cleaned: CrmSegmentFilters = {};
  for (const key of CRM_SEGMENT_KEYS) {
    const value = segments[key];
    if (value !== undefined && value !== null && (value as unknown) !== "") {
      (cleaned as Record<string, unknown>)[key] = value;
    }
  }
  return cleaned;
}

/** Serializează filtrele active într-un query string (sare peste cele goale). */
export function crmSegmentQuery(segments?: CrmSegmentFilters): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(cleanCrmSegments(segments ?? {}))) {
    qs.set(key, String(value));
  }
  return qs.toString();
}

/** Câte filtre de segmentare sunt active — pentru insigna de pe butonul „Segmentare". */
export function crmSegmentCount(segments?: CrmSegmentFilters): number {
  return Object.keys(cleanCrmSegments(segments ?? {})).length;
}
