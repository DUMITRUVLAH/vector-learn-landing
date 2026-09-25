/**
 * CRM-G01 — parametrii din adresa Pipeline-ului.
 *
 * De ce: un lead nu avea adresă. Fișa se deschidea peste tablă, dar linkul rămânea
 * `/business/crm/pipeline`, deci nu puteai trimite unui coleg „uite leadul ăsta", iar căutarea
 * din bara de sus și butonul „Lead nou" n-aveau cum să ajungă la tablă cu intenția lor.
 *
 *   ?lead=<id>   deschide fișa leadului
 *   ?q=<text>    pornește tabla filtrată după text
 *   ?nou=1       deschide formularul de lead nou
 */
export interface PipelineUrlParams {
  lead: string | null;
  q: string | null;
  nou: boolean;
}

const PIPELINE_PATH = "/business/crm/pipeline";

export function readPipelineUrl(path: string): PipelineUrlParams {
  const i = path.indexOf("?");
  const params = new URLSearchParams(i >= 0 ? path.slice(i + 1) : "");
  const lead = params.get("lead")?.trim() || null;
  const q = params.get("q")?.trim() || null;
  return { lead, q, nou: params.get("nou") === "1" };
}

/** Adresa canonică a tablei, cu fișa deschisă (sau fără). */
export function pipelineHref(leadId?: string | null): string {
  return leadId ? `${PIPELINE_PATH}?lead=${encodeURIComponent(leadId)}` : PIPELINE_PATH;
}

/**
 * Rescrie adresa FĂRĂ navigare: `replaceState` nu declanșează `hashchange`, deci tabla nu se
 * reîncarcă și istoricul nu se umple cu câte o intrare pentru fiecare fișă deschisă.
 */
export function syncPipelineUrl(leadId: string | null): void {
  if (typeof window === "undefined") return;
  const target = `#${pipelineHref(leadId)}`;
  if (window.location.hash !== target) window.history.replaceState(window.history.state, "", target);
}
