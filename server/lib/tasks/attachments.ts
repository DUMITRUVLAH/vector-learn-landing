/**
 * Atașamentele comentariilor: ce se acceptă, unde stau și cum se servesc înapoi.
 *
 * SECURITY (revizuirea adversarială din 26.09.2026, ADV-TASKS-01 și -11): tipul unui atașament
 * ajungea la server pe DOUĂ drumuri — `finalize`, care citește octeții, și corpul comentariului,
 * care nu-i vede. Comentariul primea orice `type`, iar fișierul se servea cu acel `Content-Type`
 * și `inline`: un `text/html` urcat direct în Storage (sărind peste finalize) rula JavaScript pe
 * domeniul aplicației, cu sesiunea celui care îl deschidea. Separat, `finalize` putea șterge
 * orice obiect al workspace-ului, fiindcă nu lega calea de task. Regulile de aici le închid:
 *   1. calea unui atașament poartă id-ul task-ului, iar fiecare drum verifică legătura;
 *   2. tipul trebuie să fie din lista permisă și la comentariu, nu doar la finalize;
 *   3. la servire tipul salvat NU e crezut: `inline` doar pentru imagini/PDF/text ai căror octeți
 *      confirmă tipul; orice altceva pleacă drept descărcare.
 */
import { isSafeTenantObjectPath } from "../storage/safePath";

/** Bucket propriu: fișierele task-urilor n-au ce căuta lângă dosarele de plată. */
export const TASK_ATTACHMENT_BUCKET = "task-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

/** Ce poate arăta browserul direct, fără să execute nimic din fișier. */
const INLINE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
]);

/**
 * Numele cerut la semnare: id-ul task-ului în față. Numele original se taie la 80 de caractere
 * fiindcă `safeObjectName` păstrează doar ULTIMELE 120 — altfel un nume lung ar tăia chiar id-ul.
 */
export function taskUploadName(taskId: string, fileName: string): string {
  return `${taskId}-${fileName.slice(-80)}`;
}

/**
 * A fost calea semnată pentru ACEST task? Forma scrisă de `buildObjectPath`:
 * `<tenant>/<timestamp>-<aleator>-<taskId>-<nume>`. Ancorată la început: un nume de fișier care
 * conține id-ul ALTUI task (`<ts>-<r>-<task-ul meu>-<id străin>-x.pdf`) nu se potrivește cu el.
 */
export function isTaskAttachmentPath(path: string, tenantId: string, taskId: string): boolean {
  if (!isSafeTenantObjectPath(path, tenantId)) return false;
  const name = path.slice(tenantId.length + 1);
  return new RegExp(`^\\d+-[a-z0-9]*-${taskId.toLowerCase()}-`).test(name);
}

export interface ServedAttachment {
  contentType: string;
  disposition: "inline" | "attachment";
  /** `Content-Security-Policy: sandbox` — documentul primește o origine opacă, fără scripturi. */
  sandbox: boolean;
}

const DOWNLOAD: ServedAttachment = { contentType: "application/octet-stream", disposition: "attachment", sandbox: true };

/**
 * Cum se servește un atașament, decis din tipul declarat ȘI din octeții reali (`matches` =
 * semnăturile de fișier din PAR). PDF-ul autentic nu primește `sandbox`: vizualizatorul de PDF
 * al Chrome refuză să pornească într-un document sandboxat, iar un PDF nu rulează scripturi pe
 * domeniul nostru.
 */
export function servingFor(
  declared: string,
  bytes: Buffer,
  matches: (bytes: Buffer, mime: string) => boolean,
): ServedAttachment {
  if (!ALLOWED_ATTACHMENT_TYPES.has(declared)) return DOWNLOAD;
  const textual = declared.startsWith("text/");
  if (!textual && !matches(bytes, declared)) return DOWNLOAD;
  if (!INLINE_TYPES.has(declared)) return { contentType: declared, disposition: "attachment", sandbox: true };
  return {
    contentType: textual ? `${declared}; charset=utf-8` : declared,
    disposition: "inline",
    sandbox: declared !== "application/pdf",
  };
}
