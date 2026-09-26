/**
 * CRM — clientul tipat pentru comunicarea cu lead-ul.
 *
 * Atenție la contractul lui `sendCrmEmail`: NU aruncă atunci când emailul n-a
 * plecat. Întoarce `status: "blocked" | "failed"` și un `detail` în română.
 * Motivul e că acțiunea s-a consumat oricum — a lăsat urmă în cronologie — iar
 * omul are nevoie să afle CE s-a întâmplat, nu să vadă un mesaj de eroare
 * generic care îl face să apese încă de trei ori.
 */
import { api } from "@/lib/api";

export type CrmChannel = "call" | "email" | "whatsapp" | "sms" | "meeting" | "note" | "telegram" | "viber";

export const CHANNEL_LABELS: Record<CrmChannel, string> = {
  call: "Apel",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  meeting: "Întâlnire",
  note: "Notiță",
  telegram: "Telegram",
  viber: "Viber",
};

export const DIRECTION_LABELS: Record<string, string> = {
  inbound: "primit",
  outbound: "trimis",
  internal: "intern",
};

export type EmailStatus = "sent" | "blocked" | "failed";

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  sent: "Trimis",
  blocked: "Nu a plecat (politica de trimitere)",
  failed: "Nu a plecat (eroare la trimitere)",
};

export interface CrmInteraction {
  id: string;
  leadId: string;
  type: CrmChannel | "stage_change" | "system";
  direction: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface SendEmailResult {
  status: EmailStatus;
  detail?: string;
  interaction: CrmInteraction;
}

export function sendCrmEmail(body: {
  leadId: string;
  subject: string;
  body: string;
  to?: string | null;
}): Promise<SendEmailResult> {
  return api<SendEmailResult>("/api/crm/comms/email", { method: "POST", body: JSON.stringify(body) });
}

export function logCrmTouch(body: {
  leadId: string;
  channel: CrmChannel;
  direction?: "inbound" | "outbound" | "internal";
  body?: string | null;
  durationSec?: number | null;
  outcome?: string | null;
}): Promise<CrmInteraction> {
  return api<CrmInteraction>("/api/crm/comms/log", { method: "POST", body: JSON.stringify(body) });
}

export interface CrmFeedItem {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string | null;
  type: CrmChannel;
  direction: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  userName: string | null;
}

export function listCrmFeed(params: { channel?: string | null; owner?: string | null } = {}): Promise<{
  items: CrmFeedItem[];
}> {
  const qs = new URLSearchParams();
  if (params.channel) qs.set("channel", params.channel);
  if (params.owner) qs.set("owner", params.owner);
  const suffix = qs.toString();
  return api<{ items: CrmFeedItem[] }>(`/api/crm/comms/feed${suffix ? `?${suffix}` : ""}`);
}

/**
 * Legătura WhatsApp pentru un număr. `wa.me` cere cifre curate, fără `+`,
 * spații sau paranteze — cu ele, linkul se deschide gol și pare că nu merge.
 * Numerele locale din Moldova primesc prefixul de țară: „069391979" fără 373
 * ar duce la un număr din altă țară sau la nimic.
 */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // 0XXXXXXXX local → 373XXXXXXXX
  if (digits.length === 9 && digits.startsWith("0")) digits = `373${digits.slice(1)}`;
  else if (digits.length === 8) digits = `373${digits}`;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${q}`;
}
