/**
 * Shared symmetric encryption for secrets at rest (AES-256-GCM).
 *
 * Single source of truth so we never hand-roll crypto per feature (the Stripe helper used to
 * store keys as plain base64 — security C-2 / IMPROVEMENTS #3). Key is derived from ENCRYPTION_KEY;
 * a deterministic dev key is used when unset so tests don't need env, but prod MUST set it.
 *
 * Ciphertext format: `iv(hex):tag(hex):ciphertext(hex)` — identical to server/auth/twoFactor.ts
 * (which should be migrated to import from here; see IMPROVEMENTS).
 */
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const ALG = "aes-256-gcm" as const;
const IV_LEN = 12; // GCM nonce

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "dev-key-do-not-use-in-production-32";
  return createHash("sha256").update(raw).digest(); // 32 bytes for AES-256
}

/** AES-256-GCM encrypt → `iv:tag:ciphertext` (all hex). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** True when `s` is in our `iv:tag:ciphertext` hex format (vs a legacy base64 blob). */
export function isEncrypted(s: string): boolean {
  const parts = s.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p) && p.length > 0);
}

/** AES-256-GCM decrypt. Throws on tampered/invalid ciphertext (GCM auth tag check). */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("invalid_ciphertext");
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv(ALG, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}
