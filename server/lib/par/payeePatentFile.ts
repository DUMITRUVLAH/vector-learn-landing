/**
 * Copia patentei de întreprinzător — ce se acceptă și cum se servește.
 *
 * Patenta are două locuri în care trăiește: pe cerere (`par_requests.payee_patent_file_*`, un
 * snapshot, ca seria și termenul) și pe beneficiarul salvat (`par_vendors.patent_file_*`, ca
 * următoarea cerere către aceeași persoană s-o preia fără s-o mai ceară). Amândouă indică același
 * fel de obiect din bucket-ul atașamentelor, deci regulile stau aici o singură dată.
 */
import type { Context } from "hono";
import { downloadObject } from "../storage/objectStore";
import { contentDisposition } from "../http/contentDisposition";
import { PAR_ATTACHMENT_BUCKET } from "./attachmentStore";

/**
 * O patentă e un act scanat sau fotografiat: PDF ori imagine. Nu Word, nu arhivă — ce n-ar putea
 * fi deschis pe loc de aprobator nu e o copie a patentei. SVG lipsește înadins (conține script, iar
 * fișierul se servește inline).
 */
export const PATENT_FILE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export function isPatentFileMime(mime: string): boolean {
  return (PATENT_FILE_MIME_TYPES as readonly string[]).includes(mime);
}

/** Ce trebuie să știe ruta ca să servească fișierul. */
export interface PatentFileRef {
  path: string | null;
  name: string | null;
  mime: string | null;
}

/**
 * Servește copia patentei inline, cu aceleași antete ca previzualizarea atașamentelor: vizualizatorul
 * din aplicație o afișează într-un `<iframe>`/`<img>`, iar butonul lui de descărcare o salvează.
 */
export async function patentFileResponse(c: Context, file: PatentFileRef): Promise<Response> {
  if (!file.path) return c.json({ error: "no_patent_file" }, 404);
  let bytes: Buffer;
  try {
    bytes = await downloadObject(PAR_ATTACHMENT_BUCKET, file.path);
  } catch {
    return c.json({ error: "preview_unavailable" }, 422);
  }
  c.header("Content-Type", file.mime || "application/octet-stream");
  c.header("Content-Disposition", contentDisposition("inline", file.name || "patenta", "patenta"));
  // `no-store`, nu memorarea de o oră a atașamentelor: adresa rămâne aceeași când patenta se
  // înlocuiește cu cea prelungită, iar o copie veche din cache ar arăta exact actul expirat.
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
}
