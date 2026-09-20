/**
 * CRM — șabloanele de etape cu care poate porni o pâlnie nouă (partea PURĂ).
 *
 * De ce NU stau în `src/lib/api/crm.ts`, deși sunt despre o cerere care pleacă de acolo: în
 * `lib/api/` trăiesc doar funcțiile care vorbesc cu serverul, fiindcă ecranele testate îl
 * înlocuiesc cu un dublu (`vi.mock`). O constantă adăugată acolo obligă FIECARE suită de CRM să
 * o declare în mock — regula e scrisă în `src/lib/crm/segmentFilters.ts`, unde s-a întâmplat
 * exact asta, iar un export nou a picat opt suite care doar randau pipeline-ul. (S-a repetat
 * aici, la prima încercare: 26 de teste roșii pentru o listă de trei etichete.)
 *
 * Etichetele sunt duplicate din `server/lib/crm/stages.ts`, iar CHEILE sunt singurul lucru pe
 * care serverul îl validează: un șablon necunoscut e respins cu 400, deci o listă desincronizată
 * se vede imediat, nu tăcut.
 */
export const PIPELINE_TEMPLATES = [
  { key: "default", label: "Standard (Lead nou → Client)" },
  { key: "spanco", label: "SPANCO (Suspect → Comandă)" },
  { key: "call_center", label: "Call-center B2B (Rezervă rece → Contract)" },
] as const;

export type PipelineTemplateKey = (typeof PIPELINE_TEMPLATES)[number]["key"];
