/**
 * COMMS-301 — deep link care leagă un om de pe Telegram/Viber de un lead din CRM.
 *
 * Botul nu poate scrie primul (nici Telegram, nici Viber). Agentul trimite leadului un link
 * (SMS, email, WhatsApp, QR); când omul îl deschide, furnizorul ne dă payload-ul înapoi
 * (`/start <p>` la Telegram, `context` la Viber) și știm exact cu ce lead vorbim.
 *
 * Payload-ul NU conține date personale și nu poate fi fabricat: `l` + id-ul leadului fără cratime
 * (32 hex) + 16 hex de semnătură HMAC legată de workspace. 49 de caractere, sub limita de 64 a
 * Telegram, doar [a-z0-9] (permis de ambii furnizori).
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "./util";

function key(): string {
  return `comms-deeplink:${process.env.ENCRYPTION_KEY ?? "dev-key-do-not-use-in-production-32"}`;
}

function sign(tenantId: string, leadHex: string): string {
  return createHmac("sha256", key()).update(`${tenantId}:${leadHex}`).digest("hex").slice(0, 16);
}

export function leadLinkPayload(tenantId: string, leadId: string): string {
  const hex = leadId.replace(/-/g, "").toLowerCase();
  return `l${hex}${sign(tenantId, hex)}`;
}

/** Id-ul leadului din payload, doar dacă semnătura se potrivește workspace-ului. */
export function parseLeadLinkPayload(tenantId: string, payload: string | null | undefined): string | null {
  const m = (payload ?? "").match(/^l([0-9a-f]{32})([0-9a-f]{16})$/);
  if (!m) return null;
  if (!safeEqual(m[2], sign(tenantId, m[1]))) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function telegramDeepLink(botUsername: string, payload: string): string {
  return `https://t.me/${botUsername}?start=${payload}`;
}

export function viberDeepLink(botUri: string, payload: string): string {
  return `viber://pa?chatURI=${encodeURIComponent(botUri)}&context=${encodeURIComponent(payload)}`;
}
