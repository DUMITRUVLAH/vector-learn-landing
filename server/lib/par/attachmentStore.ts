/**
 * Unde stau octeții unui atașament PAR — și de unde se citesc.
 *
 * Până în 2026-09-12 conținutul stătea ca data-URL base64 în `par_attachments.file_url`, adică
 * fișierele locuiau în Postgres. Trei consecințe, toate rele: base64 umflă fiecare fișier cu
 * +33%, cele 500 MB de bază de date se consumau în câteva zeci de dosare, iar orice listare de
 * atașamente trăgea conținutul integral din DB chiar dacă omul nu deschidea niciun document.
 *
 * Acum conținutul stă în bucket-ul privat `par-attachments` din Supabase Storage, iar baza de
 * date păstrează doar calea. Rândurile vechi rămân pe base64 până le mută backfill-ul, așa că
 * orice citire trece prin `loadAttachmentBytes`, care alege sursa după rând — nu există moment în
 * care un dosar existent să nu poată fi deschis.
 *
 * DOCUMENTE SEMNATE ELECTRONIC (MSign): totul aici e byte-cu-byte. Nu recomprimăm, nu rescriem și
 * nu normalizăm niciodată conținutul unui fișier — o singură rescriere a structurii PDF-ului
 * invalidează `/ByteRange`-ul semnăturii. Storage-ul primește exact octeții semnatarului.
 */
import { buildObjectPath, downloadObject, uploadObject } from "../storage/objectStore";

/** Bucket privat cu atașamentele dosarelor PAR și dovezile de plată. */
export const PAR_ATTACHMENT_BUCKET = "par-attachments";

/** Rândul minim din care se pot scoate octeții unui atașament, oricare ar fi generația lui. */
export interface AttachmentBytesSource {
  storagePath: string | null;
  fileUrl: string | null;
  mimeType?: string | null;
}

export interface AttachmentBytes {
  bytes: Buffer;
  mime: string;
}

/** Desparte un data-URL în tip + octeți. `null` dacă șirul nu e un data-URL base64. */
export function parseDataUrl(value: string): AttachmentBytes | null {
  const match = value.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  return { bytes: Buffer.from(match[2], "base64"), mime: match[1] };
}

/**
 * Octeții unui atașament, din Storage sau — pentru rândurile încă nemutate — din base64-ul vechi.
 * Aruncă dacă rândul nu are nicio sursă utilizabilă (ex. un URL extern, care se servește prin
 * redirect, nu prin citire).
 */
export async function loadAttachmentBytes(att: AttachmentBytesSource): Promise<AttachmentBytes> {
  if (att.storagePath) {
    const bytes = await downloadObject(PAR_ATTACHMENT_BUCKET, att.storagePath);
    return { bytes, mime: att.mimeType || "application/octet-stream" };
  }
  const legacy = att.fileUrl ? parseDataUrl(att.fileUrl) : null;
  if (legacy) return legacy;
  throw new Error("attachment_bytes_unavailable");
}

export interface StoredAttachment {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/** Urcă octeții în Storage sub folderul tenantului și întoarce ce se scrie în baza de date. */
export async function storeAttachmentBytes(
  tenantId: string,
  fileName: string,
  bytes: Buffer,
  mime: string,
): Promise<StoredAttachment> {
  const storagePath = buildObjectPath(tenantId, fileName);
  await uploadObject(PAR_ATTACHMENT_BUCKET, storagePath, bytes, mime);
  return { storagePath, mimeType: mime, sizeBytes: bytes.byteLength };
}
