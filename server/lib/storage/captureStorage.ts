/**
 * INVOICE-REPORTING — direct-to-storage uploads (Supabase Storage).
 *
 * Why: large/real receipts (e.g. Meta-ads PDFs) sent as multipart THROUGH the Vercel function
 * hit the platform's ~4.5MB request-body limit / edge protections and failed with http_4xx.
 * Instead, the browser uploads the binary DIRECTLY to Supabase Storage via a short-lived signed
 * URL, and only tiny JSON requests touch our function (sign-urls + finalize). The server then
 * downloads the object to extract its text/fields. Reuses the project's existing Supabase
 * credentials (the same store backing Postgres) — no new infra/billing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bySuffix } from "../../db/env";

/** Private bucket holding uploaded invoice/receipt files. */
export const CAPTURE_BUCKET = "fin-captures";

let client: SupabaseClient | null = null;

/** Service-role Supabase client (server only). Null when creds are absent (local/test). */
export function getStorageClient(): SupabaseClient | null {
  if (client) return client;
  const url = bySuffix("SUPABASE_URL");
  // Prefer the full-access service role key; fall back to the secret key alias.
  const key = bySuffix("SUPABASE_SERVICE_ROLE_KEY") ?? bySuffix("SUPABASE_SECRET_KEY");
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function isStorageConfigured(): boolean {
  return getStorageClient() !== null;
}

/** Make sure the bucket exists (private). Safe to call repeatedly. */
async function ensureBucket(sb: SupabaseClient): Promise<void> {
  const { data } = await sb.storage.listBuckets();
  if (!data?.some((b) => b.name === CAPTURE_BUCKET)) {
    await sb.storage.createBucket(CAPTURE_BUCKET, { public: false });
  }
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
  const sb = getStorageClient();
  if (!sb) throw new Error("storage_not_configured");
  await ensureBucket(sb);
  const out: SignedUpload[] = [];
  for (const f of files) {
    const safe = f.fileName.replace(/[^\w.-]+/g, "_").slice(-120);
    const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { data, error } = await sb.storage.from(CAPTURE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "sign_failed");
    out.push({ fileName: f.fileName, path, signedUrl: data.signedUrl });
  }
  return out;
}

/** Download an uploaded object's bytes (server side, for extraction). */
export async function downloadCapture(path: string): Promise<Buffer> {
  const sb = getStorageClient();
  if (!sb) throw new Error("storage_not_configured");
  const { data, error } = await sb.storage.from(CAPTURE_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "download_failed");
  return Buffer.from(await data.arrayBuffer());
}

/** Best-effort delete of stored objects (e.g. after a capture row is removed). */
export async function removeCaptureObjects(paths: string[]): Promise<void> {
  const sb = getStorageClient();
  if (!sb || paths.length === 0) return;
  await sb.storage.from(CAPTURE_BUCKET).remove(paths).catch(() => {});
}
