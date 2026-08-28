/**
 * Motive de urgență pentru o cerere PAR — o singură sursă de adevăr pentru coduri, etichete
 * formale și validare, folosită atât de server (server/routes/par.ts) cât și de client
 * (formularul PAR, badge-urile din liste/dashboard, rapoartele).
 *
 * DE CE varchar, nu enum Postgres: un enum nou trebuie creat înainte ca sync-schema să poată
 * vindeca coloana care îl referă (vezi comentariul din server/db/schema/par.ts) — cu prod-ul
 * care nu aplică fiabil migrări (docs/solutions prod-migration-tracking-desynced), fereastra de
 * întârziere ar lăsa "urgent_reason" lipsă până aterizează migrarea reală. Un varchar validat
 * aici, în cod, se vindecă generic prin ADD COLUMN IF NOT EXISTS, fără nicio dependință de ordine.
 *
 * Fără import cu alias "@/" — fișierul e importat direct de server (cale relativă), care nu
 * rezolvă alias-ul de Vite. Vezi src/lib/par/iban.ts pentru aceeași convenție.
 */

export const URGENT_REASON_CODES = [
  "late_request",
  "vendor_requested",
  "contract_deadline",
  "instant_service_type",
  "penalty_risk",
  "service_interruption_risk",
  "donor_deadline",
  "management_request",
  "other",
] as const;

export type UrgentReasonCode = (typeof URGENT_REASON_CODES)[number];

/** Ordinea în care apar în dropdown-ul formularului. */
export const URGENT_REASON_ORDER: UrgentReasonCode[] = [
  "contract_deadline",
  "penalty_risk",
  "service_interruption_risk",
  "donor_deadline",
  "vendor_requested",
  "instant_service_type",
  "management_request",
  "late_request",
  "other",
];

/** Text formal, gata de citit pe cerere/raport — nu jargonul scurt din formular. */
export const URGENT_REASON_LABELS: Record<UrgentReasonCode, string> = {
  contract_deadline: "Termen contractual de plată din proiect se apropie sau a expirat",
  penalty_risk: "Risc de penalizări sau dobânzi de întârziere conform contractului",
  service_interruption_risk: "Risc de întrerupere a unui serviciu esențial dacă plata nu se face la timp",
  donor_deadline: "Termen de raportare sau cheltuire impus de finanțator (donor)",
  vendor_requested: "Prestatorul a solicitat urgentarea plății",
  instant_service_type: "Tipul serviciului prestat necesită plată instantă",
  management_request: "Solicitare directă din partea conducerii/managementului",
  late_request: "Cererea a fost depusă cu întârziere față de termenul optim de procesare",
  other: "Alt motiv",
};

export function isUrgentReasonCode(value: string): value is UrgentReasonCode {
  return (URGENT_REASON_CODES as readonly string[]).includes(value);
}

/** Eticheta afișată pentru un motiv. Pentru „other" arată exact ce a scris utilizatorul. */
export function urgentReasonLabel(reason: string | null | undefined, note?: string | null): string {
  if (!reason) return "";
  if (reason === "other" && note?.trim()) return note.trim();
  return isUrgentReasonCode(reason) ? URGENT_REASON_LABELS[reason] : reason;
}

/** Lungimea maximă a notiței libere (motiv „other" sau context suplimentar). */
export const URGENT_REASON_NOTE_MAX_LEN = 500;
