/**
 * PAR-DRIVE — regulile arhivei, fără Drive și fără bază de date.
 *
 * Separate de `driveArchive.ts` pentru că acela importă clientul de DB la încărcarea modulului:
 * un test pe „a trecut intervalul?" nu are de ce să pornească un Postgres în WASM. Aici stă doar
 * ce se poate verifica cu date în mână — cadența arhivării și forma manifestului.
 */

/** Mapa care ține toate arhivele, sub rădăcina aleasă de organizație. */
export const ARCHIVES_FOLDER = "Arhive";
/** Câte fișiere copiem într-o singură rulare, ca invocarea să nu atingă limita de 60s a Vercel. */
export const ARCHIVE_BATCH_LIMIT = 40;

export interface ArchiveCadence {
  archiveEnabled: boolean;
  archiveIntervalDays: number;
  lastArchiveAt: Date | null;
}

export interface ManifestRow {
  name: string;
  sourceFileId: string;
  copyFileId: string;
  size: number | null;
  md5: string | null;
  locked: boolean;
}

/** Eticheta mapei: data rulării, în ordine sortabilă. */
export function archiveLabel(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** A trecut intervalul de la ultima arhivă? Prima arhivă se face imediat ce există ce arhiva. */
export function archiveDue(conn: ArchiveCadence, now: Date): boolean {
  if (!conn.archiveEnabled) return false;
  if (!conn.lastArchiveAt) return true;
  const days = (now.getTime() - conn.lastArchiveAt.getTime()) / 86_400_000;
  return days >= conn.archiveIntervalDays;
}

/** Manifestul e text simplu, ca să se poată citi direct în Drive, fără descărcare. */
export function renderManifest(params: {
  label: string;
  generatedAt: Date;
  rootFolderName: string;
  rows: ManifestRow[];
}): string {
  const lines: string[] = [
    `MANIFEST ARHIVĂ — ${params.label}`,
    `Generat: ${params.generatedAt.toISOString()}`,
    `Sursa: ${params.rootFolderName}`,
    `Fișiere: ${params.rows.length} · blocate la scriere: ${params.rows.filter((r) => r.locked).length}`,
    "",
    "Copiile din această mapă sunt înghețate: modificarea ulterioară a dosarului viu nu le atinge,",
    "iar conținutul lor e blocat la scriere prin Google Drive (contentRestrictions).",
    "",
    "ATENȚIE: nicio aplicație nu poate împiedica proprietarul unui Drive să șteargă fișiere.",
    "Amprentele MD5 de mai jos există tocmai pentru ca o ștergere sau o înlocuire să fie dovedibilă.",
    "",
    "─".repeat(78),
    "",
  ];
  for (const r of params.rows) {
    lines.push(
      r.name,
      `  copie   : ${r.copyFileId}`,
      `  sursă   : ${r.sourceFileId}`,
      `  mărime  : ${r.size ?? "necunoscută"} octeți`,
      `  MD5     : ${r.md5 ?? "indisponibil"}`,
      `  blocat  : ${r.locked ? "da" : "nu"}`,
      ""
    );
  }
  return lines.join("\n");
}
