/**
 * INVOICE-REPORTING — direct-to-storage uploads (Supabase Storage, REST).
 *
 * Why: large/real receipts (e.g. Meta-ads PDFs) sent as multipart THROUGH the Vercel function
 * hit the platform's ~4.5MB request-body limit / edge protections and failed with http_4xx.
 * Instead, the browser uploads the binary DIRECTLY to Supabase Storage via a short-lived signed
 * URL, and only tiny JSON requests touch our function (sign-urls + finalize). The server then
 * downloads the object to extract its text/fields.
 *
 * We call the Supabase Storage REST API with plain fetch (NOT @supabase/supabase-js): the JS
 * client eagerly constructs a Realtime/WebSocket client, which throws on Vercel's Node 20 runtime
 * ("Node.js 20 detected without native WebSocket support"). REST needs only the service-role key.
 * Reuses the project's existing Supabase credentials — no new infra/billing.
 */
import { bySuffix } from "../../db/env";

/** Private bucket holding uploaded invoice/receipt files. */
export const CAPTURE_BUCKET = "fin-captures";

function creds(): { url: string; key: string } | null {
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

let bucketEnsured = false;
/** Create the private bucket if missing (idempotent; ignores "already exists"). */
async function ensureBucket(url: string, key: string): Promise<void> {
  if (bucketEnsured) return;
  const r = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers(key), "content-type": "application/json" },
    body: JSON.stringify({ id: CAPTURE_BUCKET, name: CAPTURE_BUCKET, public: false }),
  });
  // 200 = created; 400/409 = already exists → both fine.
  if (r.ok || r.status === 400 || r.status === 409) bucketEnsured = true;
  else throw new Error(`bucket_ensure_${r.status}`);
}

export interface SignedUpload {
  fileName: string;
  /** Storage object path (tenant-scoped). */
  path: string;
  /** Full signed URL the browser PUTs the file body to. */
  signedUrl: string;
}

/** Create signed upload URLs for a batch of files, scoped under the tenant's folder. */
export async function signCaptureUploads(
  tenantId: string,
  files: Array<{ fileName: string }>,
): Promise<SignedUpload[]> {
  const c = creds();
  if (!c) throw new Error("storage_not_configured");
  await ensureBucket(c.url, c.key);

  const out: SignedUpload[] = [];
  for (const f of files) {
    const safe = f.fileName.replace(/[^\w.-]+/g, "_").slice(-120);
    const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const r = await fetch(`${c.url}/storage/v1/object/upload/sign/${CAPTURE_BUCKET}/${path}`, {
      method: "POST",
      // No JSON content-type: this endpoint rejects an empty JSON body ("Body cannot be empty").
      headers: headers(c.key),
    });
    if (!r.ok) throw new Error(`sign_failed_${r.status}`);
    const body = (await r.json()) as { url?: string };
    if (!body.url) throw new Error("sign_no_url");
    // body.url is like "/object/upload/sign/<bucket>/<path>?token=<jwt>"
    out.push({ fileName: f.fileName, path, signedUrl: `${c.url}/storage/v1${body.url}` });
  }
  return out;
}

/** Download an uploaded object's bytes (server side, for extraction). */
export async function downloadCapture(path: string): Promise<Buffer> {
  const c = creds();
  if (!c) throw new Error("storage_not_configured");
  const r = await fetch(`${c.url}/storage/v1/object/${CAPTURE_BUCKET}/${path}`, {
    headers: headers(c.key),
  });
  if (!r.ok) throw new Error(`download_failed_${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Best-effort delete of stored objects (e.g. after a capture row is removed). */
export async function removeCaptureObjects(paths: string[]): Promise<void> {
  const c = creds();
  if (!c || paths.length === 0) return;
  await fetch(`${c.url}/storage/v1/object/${CAPTURE_BUCKET}`, {
    method: "DELETE",
    headers: { ...headers(c.key), "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => {});
}
