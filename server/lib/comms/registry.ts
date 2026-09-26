/**
 * COMMS-301 — adaptorul fiecărui canal. Un canal nou = o intrare aici + un fișier în adapters/.
 */
import type { ChannelAdapter, CommChannelKind } from "./types";
import { whatsappAdapter } from "./adapters/whatsapp";
import { telegramAdapter } from "./adapters/telegram";
import { viberAdapter } from "./adapters/viber";
import { gmailAdapter } from "./adapters/gmail";

export const ADAPTERS: Record<CommChannelKind, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  telegram: telegramAdapter,
  viber: viberAdapter,
  gmail: gmailAdapter,
};

export function getAdapter(kind: string): ChannelAdapter | null {
  return (ADAPTERS as Record<string, ChannelAdapter>)[kind] ?? null;
}

/** Tipul de atingere din cronologia leadului pentru fiecare canal. */
export const INTERACTION_TYPE: Record<CommChannelKind, "whatsapp" | "telegram" | "viber" | "email"> = {
  whatsapp: "whatsapp",
  telegram: "telegram",
  viber: "viber",
  gmail: "email",
};

export const CHANNEL_LABEL: Record<CommChannelKind, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  viber: "Viber",
  gmail: "Gmail",
};
