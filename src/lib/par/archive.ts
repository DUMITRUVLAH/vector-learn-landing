/**
 * PAR-ARH — arhivarea unei cereri (2026-09-22).
 *
 * De ce există: cererile pe care nimeni nu le mai duce la capăt rămân în lista de lucru și induc
 * în eroare. Utilizatoarea care a cerut-o a descris exact asta: „nu puteam să finalizez această
 * cerere, am renunțat la ea și am făcut alta de pe foaie curată. Ca urmare acest PAR nefinalizat
 * a rămas ca «ciornă», care rămâne în toată lista cereri."
 *
 * Arhivarea NU șterge și NU schimbă statusul: cererea iese din listele de lucru și intră în lista
 * „Arhivă", de unde poate fi restaurată. Numărul ei rămâne emis, jurnalul rămâne întreg.
 *
 * Ce se poate arhiva: doar cererile care NU sunt în mijlocul unui flux. O cerere trimisă spre
 * aprobare, aprobată sau ajunsă la finanțe stă în lista altcuiva — dacă ar putea fi ascunsă de
 * autor, aprobatorul ar rămâne cu o decizie invizibilă. Pentru acelea calea e retragerea
 * (`/withdraw`) sau anularea (`DELETE /:id`), apoi arhivarea.
 */

/** Statusurile din care o cerere poate fi arhivată — toate „în repaus". */
export const ARCHIVABLE_STATUSES = ["draft", "rejected", "cancelled", "paid"] as const;

export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];

export function isArchivableStatus(status: string): status is ArchivableStatus {
  return (ARCHIVABLE_STATUSES as readonly string[]).includes(status);
}

/** Ce scrie serverul în `par_audit.event` la arhivare / restaurare. */
export const PAR_ARCHIVE_EVENT = "archived";
export const PAR_UNARCHIVE_EVENT = "unarchived";

/**
 * Explicația dată omului când încearcă să arhiveze o cerere aflată în flux. Spune și ce are de
 * făcut în schimb — altfel „conflict" e un zid, nu un răspuns.
 */
export function archiveBlockedReason(status: string): string {
  if (status === "pending_approval") {
    return "Cererea e la aprobare. Retrage-o mai întâi (butonul „Retrage și editează”), apoi o poți arhiva.";
  }
  if (status === "changes_requested" || status === "reapproval_required") {
    return "Cererea așteaptă o corectură din partea ta. Anuleaz-o mai întâi, apoi o poți arhiva.";
  }
  if (status === "approved" || status === "in_finance") {
    return "Cererea e aprobată și în lucru la finanțe. Arhivarea e posibilă după plată sau după anulare.";
  }
  return `Cererea nu poate fi arhivată din statusul '${status}'.`;
}

/** Nota de arhivare e opțională — arhivarea e curățenie, nu un refuz care cere justificare. */
export function normalizeArchiveNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.trim().slice(0, 500);
  return note || null;
}
