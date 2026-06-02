/**
 * AUTH-004: TOTP 2FA helpers.
 *
 * Secret encryption: AES-256-GCM with a key derived from ENCRYPTION_KEY env var.
 * If ENCRYPTION_KEY is not set we fall back to a deterministic dev key so unit
 * tests don't require env setup, but prod MUST have the env var.
 *
 * Recovery codes: 8 × 8-character alphanumeric codes stored as JSON
 * [{code: string, usedAt: string | null}].
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import * as OTPAuth from "otpauth";

// ── Key derivation ────────────────────────────────────────────────────────────
function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "dev-key-do-not-use-in-production-32";
  // SHA-256 of the raw key → 32 bytes (AES-256 needs 32-byte key)
  return createHash("sha256").update(raw).digest();
}

const ALG = "aes-256-gcm" as const;
const IV_LEN = 12; // GCM nonce (12 bytes / 24 hex chars)
// GCM auth tag length is 16 bytes — set automatically by getAuthTag()

// ── Encrypt / Decrypt TOTP secret ─────────────────────────────────────────────
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("invalid_ciphertext");
  const [ivHex, tagHex, encHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ── TOTP helpers ───────────────────────────────────────────────────────────────
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function generateQrCodeUri(secret: string, email: string, issuer = "Vector Learn"): string {
  const totp = new OTPAuth.TOTP({ issuer, label: email, algorithm: "SHA1", digits: 6, period: 30, secret });
  return totp.toString(); // otpauth:// URI
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret });
  // delta: allow ±1 window for clock skew
  const result = totp.validate({ token: code, window: 1 });
  return result !== null;
}

// ── Recovery codes ─────────────────────────────────────────────────────────────
export interface RecoveryCode {
  code: string;
  usedAt: string | null;
}

export function generateRecoveryCodes(count = 8): RecoveryCode[] {
  return Array.from({ length: count }, () => ({
    code: randomBytes(4).toString("hex").toUpperCase(), // 8-char hex code
    usedAt: null,
  }));
}

export function verifyRecoveryCode(
  codes: RecoveryCode[],
  inputCode: string
): { valid: boolean; updatedCodes: RecoveryCode[] } {
  const normalized = inputCode.trim().toUpperCase();
  let found = false;
  const updatedCodes = codes.map((c) => {
    if (c.code === normalized && c.usedAt === null) {
      found = true;
      return { ...c, usedAt: new Date().toISOString() };
    }
    return c;
  });
  return { valid: found, updatedCodes };
}
