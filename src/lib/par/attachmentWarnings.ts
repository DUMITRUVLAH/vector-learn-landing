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

/**
 * Toate nepotrivirile cererii, în ordinea documentelor.
 *
 * Doar `matches === false` intră aici. Un câmp neverificat (`null`) NU e o nepotrivire: dacă
 * documentul e scanat prost sau nu conține IBAN-ul, asta nu înseamnă că cineva a greșit — iar dacă
 * l-am număra, fiecare aprobare ar trece printr-un avertisment și nimeni nu le-ar mai citi.
 */
export function collectDocumentMismatches(
  attachments: readonly { fileName: string; analysis?: string | null }[]
): DocumentMismatch[] {
  const out: DocumentMismatch[] = [];
  for (const att of attachments) {
    const analysis = parseAttachmentAnalysis(att.analysis);
    if (!analysis) continue;
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
