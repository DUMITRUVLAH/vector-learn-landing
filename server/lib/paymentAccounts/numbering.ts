/**
 * CONTPLATA-faza-1 / CP-02 — numărul contului de plată.
 *
 * Owner-ul, 26.09.2026: „să fie automat, să ia numărul de ordine, și dacă vreau, doar manual să
 * schimb". Deci: numărul următor se propune singur, iar cel scris de mână e respectat — dar niciodată
 * duplicat, fiindcă două conturi cu același număr sunt o problemă la prima reconciliere.
 *
 * Pur (fără DB) ca să poată fi testat exhaustiv; ruta aduce doar numerele deja folosite.
 */

export const DEFAULT_NUMBER_PATTERN = "{serie}-{an}-{nr}";

export interface NumberingSettings {
  series: string;
  pattern: string;
  pad: number;
  start: number;
}

/** Șablonul fără `{nr}` ar produce același număr pentru toate conturile — îl completăm. */
export function normalizePattern(pattern: string | null | undefined): string {
  const p = (pattern ?? "").trim() || DEFAULT_NUMBER_PATTERN;
  return p.includes("{nr}") ? p : `${p}-{nr}`;
}

function clampPad(pad: number): number {
  return Number.isFinite(pad) ? Math.min(10, Math.max(1, Math.round(pad))) : 4;
}

export function formatDocumentNumber(settings: NumberingSettings, n: number, year: number): string {
  return normalizePattern(settings.pattern)
    .replaceAll("{serie}", settings.series)
    .replaceAll("{an}", String(year))
    .replaceAll("{nr}", String(n).padStart(clampPad(settings.pad), "0"));
}

/**
 * Următorul număr din secvență: peste cel mai mare folosit în serie și cel puțin `start`.
 * `usedNumbers` = coloana `number` a conturilor emise din seria asta (null-urile ignorate).
 */
export function nextSequenceNumber(usedNumbers: Array<number | null>, start: number): number {
  const max = usedNumbers.reduce<number>((m, n) => (n != null && n > m ? n : m), 0);
  const floor = Number.isFinite(start) && start > 1 ? Math.round(start) : 1;
  return Math.max(max + 1, floor);
}

/**
 * Primul număr liber începând de la `n`: sare peste cele luate de mână (un „CP-2026-0005" scris
 * manual nu trebuie să ciocnească al cincilea număr automat).
 */
export function firstFreeNumber(
  settings: NumberingSettings,
  n: number,
  year: number,
  takenDocumentNumbers: ReadonlySet<string>,
): { number: number; documentNumber: string } {
  let candidate = n;
  // Plafon generos: n-ai cum să ai 10.000 de numere manuale consecutive în cale.
  for (let i = 0; i < 10_000; i++, candidate++) {
    const documentNumber = formatDocumentNumber(settings, candidate, year);
    if (!takenDocumentNumbers.has(documentNumber)) return { number: candidate, documentNumber };
  }
  return { number: candidate, documentNumber: formatDocumentNumber(settings, candidate, year) };
}

/**
 * Numărul scris de mână face parte din secvență dacă are exact forma șablonului — atunci îi
 * păstrăm și partea numerică, iar următorul automat continuă de la el (ai sărit la 300 → urmează
 * 301). Altfel (ex. „Avans-mai") e un număr în afara secvenței și nu o influențează.
 */
export function parseManualNumber(
  settings: NumberingSettings,
  documentNumber: string,
  year: number,
): number | null {
  const pattern = normalizePattern(settings.pattern);
  const escaped = pattern
    .replaceAll("{serie}", "\u0000S")
    .replaceAll("{an}", "\u0000A")
    .replaceAll("{nr}", "\u0000N")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("\u0000S", escapeRe(settings.series))
    .replaceAll("\u0000A", String(year))
    .replaceAll("\u0000N", "(\\d+)");
  // Fără diferență de majuscule: „cp-2026-0300” e același număr cu „CP-2026-0300”.
  const m = new RegExp(`^${escaped}$`, "i").exec(documentNumber.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
