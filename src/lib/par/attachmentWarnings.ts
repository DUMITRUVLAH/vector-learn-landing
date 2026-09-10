/**
 * VM5-05: nepotrivirile dintre documente și cerere, adunate într-un singur loc.
 *
 * Din ședința de prezentare: „să se adauge un pop-up unde nu corespunde și aprobatorul să poată
 * vedea / înțelege (cel care emite vede, dar să poată vedea și aprobatorul)".
 *
 * Verificarea exista deja (server: `analyzeAttachmentAgainstPar`), dar rezultatul trăia ca un chip
 * mic lângă numele fișierului, într-o secțiune spre finalul fișei. În inbox — locul unde se aprobă
 * în serie — nu se vedea deloc. Modulul ăsta e sursa unică pentru: banda de avertisment de pe fișă,
 * confirmarea de la aprobare și semnul din listă.
 */

export interface AnalysisCheck {
  field: string;
  expected: string | number | null;
  found: string | number | null;
  /** true = se potrivește · false = NU se potrivește · null = nu s-a putut verifica. */
  matches: boolean | null;
}

export interface AttachmentAnalysis {
  /**
   * Versiunea regulilor cu care s-a făcut analiza (`server/lib/par/reconcileScope.ts`). Lipsește pe
   * verdictele salvate înainte de 10.09.2026 — unele vizibil greșite, cu numărul facturii citit ca
   * sumă. Ele rămân afișate, dar nu au voie să blocheze o aprobare.
   */
  version?: number;
  status: "match" | "warning";
  warnings: number;
  checks: AnalysisCheck[];
  analyzedAt?: string;
}

/** O nepotrivire concretă, gata de afișat: pe ce document, la ce câmp, ce s-a așteptat, ce s-a găsit. */
export interface DocumentMismatch {
  fileName: string;
  field: string;
  expected: string | number | null;
  found: string | number | null;
}

/** Analiza salvată pe atașament e text JSON; orice altceva se tratează ca „nu există analiză". */
export function parseAttachmentAnalysis(raw: string | null | undefined): AttachmentAnalysis | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AttachmentAnalysis;
    return value && (value.status === "match" || value.status === "warning") && Array.isArray(value.checks)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Regulile curente de reconciliere; ține pas cu `ANALYSIS_VERSION` de pe server. */
export const CURRENT_ANALYSIS_VERSION = 2;

/**
 * Toate nepotrivirile cererii, în ordinea documentelor.
 *
 * Două filtre, amândouă ca avertismentul să rămână credibil:
 *
 * 1. Doar `matches === false`. Un câmp neverificat (`null`) NU e o nepotrivire: dacă documentul e
 *    scanat prost sau nu conține IBAN-ul, asta nu înseamnă că cineva a greșit.
 * 2. Doar analizele făcute cu regulile curente. Pe producție, 17 din 23 de atașamente purtau un
 *    verdict vechi, aproape toate pe „sumă" — inclusiv un contract-cadru comparat cu plata unei
 *    luni și un număr de factură citit drept sumă. Un avertisment care sare pe trei sferturi din
 *    cereri nu mai e citit de nimeni. Documentele vechi se reevaluează când sunt reîncărcate sau
 *    reanalizate.
 */
export function collectDocumentMismatches(
  attachments: readonly { fileName: string; analysis?: string | null }[]
): DocumentMismatch[] {
  const out: DocumentMismatch[] = [];
  for (const att of attachments) {
    const analysis = parseAttachmentAnalysis(att.analysis);
    if (!analysis) continue;
    if ((analysis.version ?? 0) < CURRENT_ANALYSIS_VERSION) continue;
    for (const check of analysis.checks) {
      if (check.matches === false) {
        out.push({ fileName: att.fileName, field: check.field, expected: check.expected, found: check.found });
      }
    }
  }
  return out;
}

/** Cum se scrie o valoare de verificare pe ecran: sumele vin în bani (minor units). */
export function formatCheckValue(value: string | number | null, currency = "MDL"): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    return `${(value / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
  return value;
}
