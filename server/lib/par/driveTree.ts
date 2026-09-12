/**
 * Traducerea arborelui de mape din aplicație în căi de foldere Google Drive.
 *
 * În aplicație, dosarele se navighează exact ca într-un drive (src/lib/par/folders.ts):
 *
 *     Proiecte → (Evenimente) → Statusuri → Cereri
 *
 * Oglinda din Drive păstrează ACEEAȘI formă, ca omul care deschide Drive-ul să regăsească
 * mapele pe care le știe din aplicație. Sincronizăm doar cererile plătite, deci mapa de status
 * e mereu „Plătite" — dar rămâne în cale, altfel arborele ar fi altul decât cel din ecran.
 *
 * Totul aici e pur (date în → cale afară), ca să fie testabil fără Drive și fără DB.
 */

/** Mapa pentru cererile fără proiect — aceeași etichetă ca în ecranul de foldere. */
export const NO_PROJECT_LABEL = "Fără proiect";
export const PAID_FOLDER_LABEL = "Plătite";

/** Drive acceptă aproape orice în nume; noi tăiem ce face mapele ilizibile sau ambigue. */
export function sanitizeFolderName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    // Bara de directoare într-un nume de mapă se citește ca o ierarhie care nu există.
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > 120 ? `${cleaned.slice(0, 119)}…` : cleaned;
}

export interface DriveFolderPath {
  /** Cheia stabilă sub care ținem minte folderul în `par_drive_folders`. */
  pathKey: string;
  /** Numele mapelor, de la rădăcină în jos (rădăcina însăși NU e inclusă). */
  segments: string[];
}

export interface ParFolderInput {
  projectId: string | null;
  projectName: string | null;
  eventId: string | null;
  eventName: string | null;
}

/**
 * Calea unei cereri plătite.
 *
 * Cheia e construită din ID-uri, nu din nume: dacă cineva redenumește proiectul „Erasmus" în
 * „Erasmus+ 2026", vrem SĂ REGĂSIM aceeași mapă (și eventual s-o redenumim), nu să creăm una nouă
 * și să spargem dosarul în două.
 */
export function driveFolderPathFor(par: ParFolderInput): DriveFolderPath {
  const segments: string[] = [
    par.projectId
      ? sanitizeFolderName(par.projectName, `Proiect ${par.projectId.slice(0, 8)}`)
      : NO_PROJECT_LABEL,
  ];
  if (par.eventId) {
    segments.push(sanitizeFolderName(par.eventName, `Eveniment ${par.eventId.slice(0, 8)}`));
  }
  segments.push(PAID_FOLDER_LABEL);

  const pathKey = [
    `proj:${par.projectId ?? "none"}`,
    `ev:${par.eventId ?? "none"}`,
    "bucket:paid",
  ].join("|");

  return { pathKey, segments };
}

/** Cheile părinte ale unei căi, de la primul nivel în jos — fiecare mapă se caută în cache separat. */
export function ancestorKeys(path: DriveFolderPath): string[] {
  const [projPart, evPart] = path.pathKey.split("|");
  const keys = [projPart];
  if (!evPart.endsWith("none")) keys.push(`${projPart}|${evPart}`);
  keys.push(path.pathKey);
  return keys;
}
