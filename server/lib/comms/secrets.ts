/**
 * COMMS-301 — cheia HMAC a modulului (deep link, state OAuth). Fișier pur, fără bază de date,
 * ca adaptoarele și deep link-ul să poată fi testate izolat.
 */
/**
 * Cheia HMAC a modulului. În producție, fără ENCRYPTION_KEY → `null`, iar apelanții DEGRADEAZĂ
 * (fără link de invitație, OAuth refuzat cu mesaj clar) în loc să dea 500 — o pagină întreagă nu are
 * voie să cadă pentru o variabilă de mediu lipsă.
 */
export function commsHmacSecret(purpose: string): string | null {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    const prod = process.env.NODE_ENV === "production" && (process.env.VERCEL_ENV ?? "production") === "production";
    // Aceeași logică fail-closed ca server/lib/crypto.ts: cu cheia implicită din repo, oricine ar
    // putea fabrica un deep link spre alt lead sau un state OAuth valid.
    if (prod) return null;
    return `${purpose}:dev-key-do-not-use-in-production-32`;
  }
  return `${purpose}:${key}`;
}
