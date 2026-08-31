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
const DEV_KEY = "dev-key-do-not-use-in-production-32";

/**
 * SECURITY (audit 2026-08-29) — în producție cheia lipsă e FATALĂ la scriere, nu doar un avertisment.
 *
 * Vechiul comportament (warn + continuă pe `DEV_KEY`) însemna că, atâta timp cât `ENCRYPTION_KEY`
 * nu era setată — și pe 29 august 2026 nu era, verificat cu `vercel env ls production` — orice
 * secret „la rest" (2FA, credențiale SFS, chei Stripe) era criptat cu un șir aflat în acest fișier,
 * iar cookie-ul `vl_g_pending`, singura autentificare pentru /google/create-workspace, /google/join
 * și /google/accept-matched-invite, putea fi fabricat de oricine citește repo-ul.
 *
 * Acum: `encrypt` refuză să scrie cu cheia implicită în producție (fail-closed), iar `decrypt`
 * încearcă întâi cheia curentă și abia apoi cea veche, ca secretele scrise ÎNAINTE de rotație să
 * rămână citibile. Fiecare astfel de citire lasă un avertisment: sunt datele care mai trebuie
 * re-criptate.
 */
const usingDefaultKeyInProd = () => {
  if (process.env.ENCRYPTION_KEY) return false;
  if (process.env.NODE_ENV !== "production") return false;
  // Pe Vercel, NODE_ENV e "production" și în preview. Fail-closed se aplică DOAR deployment-ului
  // de producție (clientul plătitor); un preview fără cheie rămâne pe cheia implicită, cu
  // avertismentul de mai jos — altfel ar trebui să dublăm secretul în fiecare mediu, iar un
  // secret scris în preview cu ALTĂ cheie ar deveni ilizibil în producție (aceeași bază de date).
  return (process.env.VERCEL_ENV ?? "production") === "production";
};

if (usingDefaultKeyInProd()) {
  console.error(
    "[crypto] SECURITY: ENCRYPTION_KEY is unset in production — encryption is DISABLED (fail-closed). " +
      "Set ENCRYPTION_KEY now; until then every write of a secret at rest will throw."
  );
}

function deriveKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest(); // 32 bytes for AES-256
}

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? DEV_KEY;
  return deriveKey(raw);
}

/**
 * Cheile încercate la decriptare, în ordine: cea curentă, apoi cea implicită veche.
 * A doua e acolo DOAR pentru datele scrise înainte de a fi setată `ENCRYPTION_KEY`.
 */
function decryptionKeys(): Array<{ key: Buffer; legacy: boolean }> {
  const configured = process.env.ENCRYPTION_KEY;
  if (!configured) return [{ key: deriveKey(DEV_KEY), legacy: false }];
  return [
    { key: deriveKey(configured), legacy: false },
    { key: deriveKey(DEV_KEY), legacy: true },
  ];
}

/** AES-256-GCM encrypt → `iv:tag:ciphertext` (all hex). */
export function encrypt(plaintext: string): string {
  if (usingDefaultKeyInProd()) {
    throw new Error(
      "encryption_key_missing: refuz să scriu un secret cu cheia implicită în producție. Setează ENCRYPTION_KEY."
    );
  }
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
  let lastErr: unknown;
  for (const { key, legacy } of decryptionKeys()) {
    try {
      const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      const out = Buffer.concat([
        decipher.update(Buffer.from(encHex, "hex")),
        decipher.final(),
      ]).toString("utf8");
      if (legacy) {
        console.warn(
          "[crypto] secret citit cu cheia implicită veche — a fost scris înainte de ENCRYPTION_KEY. " +
            "Re-salvează-l ca să fie re-criptat cu cheia curentă."
        );
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("invalid_ciphertext");
}
