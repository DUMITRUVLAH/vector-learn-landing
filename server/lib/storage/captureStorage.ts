/**
 * INVOICE-REPORTING — upload direct în storage pentru bonurile/facturile capturate.
 *
 * De ce: chitanțele reale (ex. PDF-uri Meta-ads) trimise ca multipart PRIN funcția Vercel lovesc
 * limita de ~4,5 MB pe corpul cererii și pică cu http_4xx. În schimb, browserul urcă binarul
 * DIRECT în Supabase Storage printr-un URL semnat de scurtă durată, iar prin funcția noastră trec
 * doar cereri JSON mici (sign-urls + finalize). Serverul descarcă apoi obiectul ca să-i extragă
 * textul/câmpurile.
 *
 * Mecanismul propriu-zis (REST cu fetch, ensure-bucket, căi per tenant) trăiește în
 * `objectStore.ts` și e împărțit cu atașamentele PAR. Fișierul ăsta rămâne doar legarea lui de
 * bucket-ul `fin-captures`, ca să nu existe două implementări ale aceluiași lucru.
 */
import {
  downloadObject,
  isStorageConfigured as storageConfigured,
  removeObjects,
  signUploads,
  type SignedUpload,
} from "./objectStore";

/** Bucket privat cu fișierele de facturi/bonuri încărcate. */
export const CAPTURE_BUCKET = "fin-captures";

export type { SignedUpload };

export function isStorageConfigured(): boolean {
  return storageConfigured();
}

/** Create signed upload URLs for a batch of files, scoped under the tenant's folder. */
export function signCaptureUploads(
  tenantId: string,
  files: Array<{ fileName: string }>,
): Promise<SignedUpload[]> {
  return signUploads(CAPTURE_BUCKET, tenantId, files);
}

/** Download an uploaded object's bytes (server side, for extraction). */
export function downloadCapture(path: string): Promise<Buffer> {
  return downloadObject(CAPTURE_BUCKET, path);
}

/** Best-effort delete of stored objects (e.g. after a capture row is removed). */
export function removeCaptureObjects(paths: string[]): Promise<void> {
  return removeObjects(CAPTURE_BUCKET, paths);
}
