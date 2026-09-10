/**
 * VM5-05 (partea de server): câte nepotriviri are o cerere între documentele atașate și datele ei.
 *
 * Inboxul e locul unde se aprobă în serie — și tocmai acolo verdictul reconcilierii nu ajungea
 * deloc. Ca să apară un semn pe rând (și un avertisment în „aprobă toate"), lista are nevoie de un
 * număr, nu de analiza întreagă.
 *
 * Numără DOAR `matches === false`. Un câmp neverificat nu e o greșeală a nimănui: dacă l-am număra,
 * fiecare cerere cu un scan mai slab ar purta un semn de alarmă, iar semnele care apar mereu nu mai
 * sunt citite. Aceeași regulă ca pe client (`src/lib/par/attachmentWarnings.ts`).
 */

interface StoredAnalysis {
  status?: string;
  checks?: { matches?: boolean | null }[];
}

/** Nepotrivirile dintr-o singură analiză salvată (text JSON pe atașament). */
export function countAnalysisMismatches(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as StoredAnalysis;
    if (!parsed || !Array.isArray(parsed.checks)) return 0;
    return parsed.checks.filter((c) => c?.matches === false).length;
  } catch {
    return 0;
  }
}

/** Nepotrivirile pe cerere, gata de atașat la rândurile listei. */
export function countMismatchesByPar(
  rows: readonly { parId: string; analysis: string | null }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const n = countAnalysisMismatches(row.analysis);
    if (n > 0) out.set(row.parId, (out.get(row.parId) ?? 0) + n);
  }
  return out;
}
