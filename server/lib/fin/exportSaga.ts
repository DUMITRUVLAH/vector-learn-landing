/**
 * EXPORT-002: Generator CSV format SAGA C (România).
 *
 * SAGA C importă jurnalele din CSV cu delimitator `,` (virgulă) și header fix:
 *   Data,Cont,DenumireCont,Suma,TipOperatie,Descriere
 *
 * TipOperatie: "D" = Debit, "C" = Credit
 * Suma: valoare pozitivă în RON cu 2 zecimale (ex: 1234.56)
 * Encoding: UTF-8 fără BOM (SAGA citește UTF-8 fără BOM)
 */

function escapeSagaField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Dacă conține virgulă, ghilimele sau newline → înconjurăm cu ghilimele
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface SagaEntry {
  date: string;
  accountCode: string;
  accountName: string | null;
  debitCents: number;
  creditCents: number;
  description: string | null;
}

/**
 * Generează CSV SAGA C din lista de înregistrări contabile.
 * Fiecare înregistrare cu debit > 0 → linie D; credit > 0 → linie C.
 */
export function generateSagaCsv(entries: SagaEntry[]): string {
  const HEADER = "Data,Cont,DenumireCont,Suma,TipOperatie,Descriere";
  const lines: string[] = [HEADER];

  for (const e of entries) {
    const base = [
      escapeSagaField(e.date),
      escapeSagaField(e.accountCode),
      escapeSagaField(e.accountName ?? ""),
    ];
    const desc = escapeSagaField(e.description ?? "");
    if (e.debitCents > 0) {
      lines.push([...base, fmtAmount(e.debitCents), "D", desc].join(","));
    }
    if (e.creditCents > 0) {
      lines.push([...base, fmtAmount(e.creditCents), "C", desc].join(","));
    }
  }

  return lines.join("\r\n");
}
