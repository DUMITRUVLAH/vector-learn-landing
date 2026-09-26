/**
 * COMMS-301 — regulile de trimitere, pure (fără bază de date), ca să poată fi testate izolat.
 * Explicațiile fiecărei reguli: server/lib/comms/send.ts și docs/comms/.
 */
import type { CommChannel, CommContact, CommConversation } from "../../db/schema/comms";
import { str } from "./util";

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;


/** Fereastra de serviciu WhatsApp e deschisă? (24h de la ultimul mesaj PRIMIT) */
export function windowOpen(lastInboundAt: Date | null | undefined, now = Date.now()): boolean {
  return Boolean(lastInboundAt && now - new Date(lastInboundAt).getTime() < WHATSAPP_WINDOW_MS);
}

export function sendRestrictions(
  channel: Pick<CommChannel, "kind" | "status">,
  conv: Pick<CommConversation, "lastInboundAt">,
  contact: Pick<CommContact, "blockedAt">,
  lastInboundMeta: Record<string, unknown> | null
): { canSendFreeform: boolean; needsTemplate: boolean; blocked: boolean; reason: string | null } {
  if (channel.status !== "active") {
    return {
      canSendFreeform: false,
      needsTemplate: false,
      blocked: true,
      reason:
        channel.status === "error"
          ? "Canalul are o eroare de conectare — verifică-l în Canale de mesaje."
          : "Canalul a fost deconectat. Istoricul rămâne; ca să răspunzi, reconectează-l din Canale de mesaje.",
    };
  }
  if (contact.blockedAt) {
    return {
      canSendFreeform: false,
      needsTemplate: false,
      blocked: true,
      reason: channel.kind === "viber" ? "Clientul s-a dezabonat de la bot." : "Clientul a blocat botul.",
    };
  }
  if (channel.kind === "whatsapp" && !windowOpen(conv.lastInboundAt)) {
    return {
      canSendFreeform: false,
      needsTemplate: true,
      blocked: false,
      reason: "Au trecut peste 24h de la ultimul mesaj al clientului — WhatsApp permite doar un template aprobat.",
    };
  }
  if (channel.kind === "telegram" && str(lastInboundMeta?.businessConnectionId) && !windowOpen(conv.lastInboundAt)) {
    return {
      canSendFreeform: false,
      needsTemplate: false,
      blocked: true,
      reason: "Prin Telegram Business se poate răspunde doar în 24h de la ultimul mesaj al clientului.",
    };
  }
  return { canSendFreeform: true, needsTemplate: false, blocked: false, reason: null };
}
