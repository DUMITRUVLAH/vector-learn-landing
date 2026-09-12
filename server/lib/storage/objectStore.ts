/**
 * Supabase Storage, generic peste bucket-uri.
 *
 * De ce există: `captureStorage.ts` rezolvase deja problema pentru bonurile din INVOICE-REPORTING
 * (upload direct din browser prin URL semnat, ca să nu treacă binarul prin funcția Vercel), dar
 * logica era legată de un singur bucket. Atașamentele PAR au exact aceeași nevoie, așa că
 * mecanismul trăiește aici o singură dată și primește bucket-ul ca parametru — `captureStorage`
 * devine un apelant, nu o a doua implementare (regula COMPETING_SYSTEM din CLAUDE.md §3.5.1).
 *
 * Motivul mutării atașamentelor PAR aici (2026-09-12): erau ținute ca data-URL base64 în
 * `par_attachments.file_url`, adică fișierele stăteau în Postgres. Base64 umflă orice fișier cu
 * +33%, planul Supabase free are 500 MB de bază de date, iar listarea unui dosar trăgea tot
 * conținutul din DB chiar dacă omul nu deschidea niciun document. Fișierele stau în Storage,
 * baza de date păstrează doar calea.
 *
 * IMPORTANT pentru documentele semnate electronic (MSign): transferul e byte-cu-byte. Nu
 * recomprimăm și nu rescriem niciodată conținutul unui PDF — asta ar invalida `/ByteRange`-ul
 * semnăturii. Storage-ul primește exact octeții pe care i-a produs semnatarul.
 *
 * Se apelează REST-ul Supabase cu `fetch`, NU `@supabase/supabase-js`: clientul JS construiește
 * un client Realtime/WebSocket la import, care aruncă pe runtime-ul Node 20 de pe Vercel
 * ("Node.js 20 detected without native WebSocket support"). REST-ul are nevoie doar de cheia
 * service-role.
 */
import { bySuffix } from "../../db/env";

export interface StorageCreds {
  url: string;
  key: string;
}

function creds(): StorageCreds | null {
  const url = bySuffix("SUPABASE_URL");
  const key = bySuffix("SUPABASE_SERVICE_ROLE_KEY") ?? bySuffix("SUPABASE_SECRET_KEY");
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

export function isStorageConfigured(): boolean {
  return creds() !== null;
}

function headers(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

const bucketsEnsured = new Set<string>();

/** Creează bucket-ul privat dacă lipsește (idempotent; „already exists" e succes). */
async function ensureBucket(bucket: string, c: StorageCreds): Promise<void> {
  if (bucketsEnsured.has(bucket)) return;
  const r = await fetch(`${c.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers(c.key), "content-type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  // 200 = creat; 400/409 = există deja → ambele sunt în regulă.
  if (r.ok || r.status === 400 || r.status === 409) bucketsEnsured.add(bucket);
  else throw new Error(`bucket_ensure_${r.status}`);
}

/** Numele de fișier, redus la forma pe care `isSafeTenantObjectPath` o acceptă. */
export function safeObjectName(fileName: string): string {
  return fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || "fisier";
}

/** Cale unică sub folderul tenantului: `<tenantId>/<timestamp>-<random>-<nume>`. */
export function buildObjectPath(tenantId: string, fileName: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${tenantId}/${Date.now()}-${rand}-${safeObjectName(fileName)}`;
}

export interface SignedUpload {
  fileName: string;
  /** Calea obiectului în storage (sub folderul tenantului). */
  path: string;
  /** URL-ul complet la care browserul face PUT cu corpul fișierului. */
  signedUrl: string;
}

/** URL-uri semnate de upload pentru un lot de fișiere, sub folderul tenantului. */
export async function signUploads(
  bucket: string,
  tenantId: string,
  files: Array<{ fileName: string }>,
): Promise<SignedUpload[]> {
  const c = creds();
  if (!c) throw new Error("storage_not_configured");
  await ensureBucket(bucket, c);

  const out: SignedUpload[] = [];
  for (const f of files) {
    const path = buildObjectPath(tenantId, f.fileName);
    const r = await fetch(`${c.url}/storage/v1/object/upload/sign/${bucket}/${path}`, {
      method: "POST",
      // Fără content-type JSON: endpoint-ul respinge un corp JSON gol („Body cannot be empty").
      headers: headers(c.key),
    });
    if (!r.ok) throw new Error(`sign_failed_${r.status}`);
    const body = (await r.json()) as { url?: string };
    if (!body.url) throw new Error("sign_no_url");
    // body.url arată ca „/object/upload/sign/<bucket>/<path>?token=<jwt>"
    out.push({ fileName: f.fileName, path, signedUrl: `${c.url}/storage/v1${body.url}` });
  }
  return out;
}

/**
 * Urcă octeții direct de pe server (folosit de backfill și de calea veche de upload, unde
 * conținutul ajunge oricum la noi). Byte-cu-byte: nu atinge conținutul.
 */
export async function uploadObject(
  bucket: string,
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const c = creds();
  if (!c) throw new Error("storage_not_configured");
  await ensureBucket(bucket, c);
  const r = await fetch(`${c.url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      ...headers(c.key),
      "content-type": contentType || "application/octet-stream",
      // Suprascrie dacă un backfill se reia peste o cale deja urcată.
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!r.ok) throw new Error(`upload_failed_${r.status}`);
}

/** Descarcă octeții unui obiect (server-side: preview, extragere de text, analiză). */
export async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const c = creds();
  if (!c) throw new Error("storage_not_configured");
  const r = await fetch(`${c.url}/storage/v1/object/${bucket}/${path}`, {
    headers: headers(c.key),
  });
  if (!r.ok) throw new Error(`download_failed_${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Ștergere best-effort a unor obiecte (după ce rândul din DB a dispărut). */
export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  const c = creds();
  if (!c || paths.length === 0) return;
  await fetch(`${c.url}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { ...headers(c.key), "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => {});
}
