/**
 * COMMS-301 — trimiterea unui mesaj dintr-o conversație sau către un lead.
 *
 * Regulile se verifică ÎNAINTE de apelul la furnizor, ca omul să afle de ce nu merge în română,
 * nu printr-un cod Meta:
 *  - consimțământul retras al leadului (GDPR, CRM-101) blochează orice canal;
 *  - contactul care a blocat botul / s-a dezabonat nu poate primi;
 *  - WhatsApp: în afara ferestrei de 24h de la ultimul mesaj al clientului doar template aprobat
 *    (altfel Meta răspunde 131047);
 *  - Telegram Business: tot 24h (drepturile `can_reply` ale conexiunii);
 *  - Gmail: garda de trimitere (server/lib/emailGuard.ts) — mediile de test nu trimit emailuri reale.
 *
 * Un mesaj care NU a plecat rămâne în conversație cu status `failed` și motivul — aceeași regulă ca
 * la emailul din fișă (crmComms.ts): o trimitere ratată care nu lasă urmă e mai rea decât una netrimisă.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  commChannels,
  commContacts,
  commConversations,
  commMessages,
  type CommChannel,
  type CommConversation,
  type CommMessage,
} from "../../db/schema/comms";
import { leads, leadInteractions } from "../../db/schema/leads";
import { emailSendDecision } from "../emailGuard";
import { adapterContext, isMockChannel } from "./channelStore";
import { freshGmailCreds } from "./gmailService";
import { getAdapter, INTERACTION_TYPE } from "./registry";
import { CommsError, type CommChannelKind, type OutboundMessage, type SendResult } from "./types";
import { preview } from "./util";
import { sendRestrictions } from "./rules";

export { WHATSAPP_WINDOW_MS, windowOpen, sendRestrictions } from "./rules";

export interface ComposeInput {
  text?: string | null;
  subject?: string | null;
  media?: OutboundMessage["media"];
  template?: OutboundMessage["template"];
  replyToMessageId?: string | null;
}

/**
 * Gmail e cutia PERSONALĂ a agentului: din ea scrie doar el. Altfel un coleg ar putea trimite, prin
 * tokenul OAuth al directorului, un email „de la director" oricui — iar mesajul ar apărea și în
 * „Trimise"-ul directorului. Citirea rămâne comună: sunt doar emailurile leadurilor, pe care
 * cronologia leadului le arată oricum întregii echipe.
 */
export function assertMailboxOwner(channel: Pick<CommChannel, "kind" | "connectedBy">, userId: string): void {
  if (channel.kind === "gmail" && channel.connectedBy !== userId) {
    throw new CommsError("not_mailbox_owner", "Din această cutie Gmail poate scrie doar omul care a conectat-o.", 403);
  }
}

async function lastInboundMeta(conversationId: string): Promise<Record<string, unknown> | null> {
  const [m] = await db
    .select({ meta: commMessages.meta })
    .from(commMessages)
    .where(and(eq(commMessages.conversationId, conversationId), eq(commMessages.direction, "inbound")))
    .orderBy(desc(commMessages.createdAt))
    .limit(1);
  return (m?.meta as Record<string, unknown> | null) ?? null;
}

async function dispatch(channel: CommChannel, msg: OutboundMessage): Promise<SendResult> {
  if (isMockChannel(channel)) {
    // Canal simulat: nimic nu pleacă din server; mesajul se comportă ca trimis.
    return { ok: true, externalId: `mock-${crypto.randomUUID()}`, threadId: msg.threadId ?? (channel.kind === "gmail" ? `mock-thread-${crypto.randomUUID()}` : null) };
  }
  const adapter = getAdapter(channel.kind);
  if (!adapter) return { ok: false, errorCode: "unknown_channel", errorMessage: `Canal necunoscut: ${channel.kind}` };
  const ctx = adapterContext(channel, channel.kind === "gmail" ? await freshGmailCreds(channel) : undefined);
  try {
    return await adapter.send(ctx, msg);
  } catch (err) {
    return { ok: false, errorCode: "network", errorMessage: err instanceof Error ? err.message : "Furnizorul nu a răspuns." };
  }
}

export interface SendOutcome {
  message: CommMessage;
  conversationId: string;
}

/** Trimite într-o conversație existentă. Aruncă `CommsError` pentru ce se poate spune omului înainte. */
export async function sendInConversation(
  tenantId: string,
  userId: string,
  conversationId: string,
  input: ComposeInput
): Promise<SendOutcome> {
  const [row] = await db
    .select({ conv: commConversations, channel: commChannels, contact: commContacts })
    .from(commConversations)
    .innerJoin(commChannels, eq(commChannels.id, commConversations.channelId))
    .innerJoin(commContacts, eq(commContacts.id, commConversations.contactId))
    .where(and(eq(commConversations.id, conversationId), eq(commConversations.tenantId, tenantId)));
  if (!row) throw new CommsError("not_found", "Conversația nu există.", 404);
  const { conv, channel, contact } = row;

  const text = input.text?.trim() ?? "";
  if (!text && !input.media && !input.template) throw new CommsError("empty", "Mesajul e gol.", 400);
  assertMailboxOwner(channel, userId);

  if (conv.leadId) {
    const [lead] = await db.select({ revoked: leads.consentRevokedAt }).from(leads).where(eq(leads.id, conv.leadId));
    if (lead?.revoked) throw new CommsError("consent_revoked", "Leadul și-a retras consimțământul — nu i se mai pot trimite mesaje.", 403);
  }

  const meta = await lastInboundMeta(conv.id);
  const r = sendRestrictions(channel, conv, contact, meta);
  if (r.blocked) throw new CommsError("blocked", r.reason ?? "Trimiterea nu e posibilă.", 409);
  if (r.needsTemplate && !input.template) throw new CommsError("window_closed", r.reason ?? "E nevoie de un template.", 409);

  if (channel.kind === "gmail" && !isMockChannel(channel)) {
    const decision = emailSendDecision(contact.externalUserId);
    if (!decision.allowed) {
      throw new CommsError(
        "email_blocked",
        decision.reason?.includes("non-production")
          ? "Mediul acesta nu trimite emailuri reale (protecție anti-trimitere din teste)."
          : "Adresa e blocată de politica de trimitere (domeniu demo sau nelivrabil).",
        409
      );
    }
  }

  let replyToExternalId: string | null = null;
  if (input.replyToMessageId) {
    const [q] = await db
      .select({ externalId: commMessages.externalId })
      .from(commMessages)
      .where(and(eq(commMessages.id, input.replyToMessageId), eq(commMessages.conversationId, conv.id)));
    replyToExternalId = q?.externalId ?? null;
  }

  const subject = channel.kind === "gmail" ? input.subject?.trim() || conv.subject || "(fără subiect)" : null;
  const templateText = input.template ? `[Template ${input.template.name}] ${input.template.params.join(" · ")}`.trim() : null;
  const body = text || templateText;

  const [queued] = await db
    .insert(commMessages)
    .values({
      tenantId,
      conversationId: conv.id,
      channelId: channel.id,
      direction: "outbound",
      kind: input.template ? "template" : input.media ? input.media.type : "text",
      body,
      subject,
      media: input.media ? [{ type: input.media.type, url: input.media.url, name: input.media.name ?? null }] : null,
      status: "queued",
      senderUserId: userId,
      templateName: input.template?.name ?? null,
    })
    .returning();

  const result = await dispatch(channel, {
    to: contact.externalUserId,
    text: text || null,
    subject,
    media: input.media ?? null,
    template: input.template ?? null,
    replyToExternalId,
    // „new:…" = fir Gmail care încă nu există la Google; primește threadId-ul real după trimitere.
    threadId: conv.externalThreadId && !conv.externalThreadId.startsWith("new:") ? conv.externalThreadId : null,
    lastInboundMeta: meta,
  });

  const now = new Date();
  const [message] = await db
    .update(commMessages)
    .set(
      result.ok
        ? { status: "sent", externalId: result.externalId ?? null, sentAt: now, meta: result.meta ?? null }
        : {
            status: "failed",
            errorCode: result.errorCode?.slice(0, 40) ?? null,
            errorMessage: result.errorMessage?.slice(0, 1000) ?? null,
          }
    )
    .where(eq(commMessages.id, queued.id))
    .returning();

  await db
    .update(commConversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview(body, "Mesaj"),
      lastMessageDirection: "outbound",
      unreadCount: 0,
      ...(subject && !conv.subject ? { subject } : {}),
      ...(conv.assignedTo ? {} : { assignedTo: userId }),
      updatedAt: now,
    })
    .where(eq(commConversations.id, conv.id));
  // Gmail: primul mesaj dintr-un fir nou primește threadId-ul real abia în răspunsul la trimitere.
  if (result.ok && result.threadId && (!conv.externalThreadId || conv.externalThreadId.startsWith("new:"))) {
    try {
      await db.update(commConversations).set({ externalThreadId: result.threadId }).where(eq(commConversations.id, conv.id));
    } catch {
      // firul există deja ca altă conversație a aceluiași contact — rămâne cheia temporară
    }
  }

  if (conv.leadId) {
    await db.insert(leadInteractions).values({
      tenantId,
      leadId: conv.leadId,
      type: INTERACTION_TYPE[channel.kind as CommChannelKind] ?? "note",
      direction: "outbound",
      body: ((subject ? `${subject}\n\n` : "") + (body ?? "")).slice(0, 2000),
      metadata: {
        commMessageId: message.id,
        conversationId: conv.id,
        channelId: channel.id,
        via: channel.kind,
        status: result.ok ? "sent" : "failed",
        detail: result.ok ? null : result.errorMessage ?? null,
      },
      userId,
    });
  }

  return { message, conversationId: conv.id };
}

/**
 * Pornește o conversație cu un lead pe un canal (sau o refolosește pe cea existentă).
 *
 * WhatsApp și Gmail pot scrie primii (WhatsApp doar cu template). Telegram și Viber NU: dacă omul
 * n-a scris niciodată botului, întoarcem `needsOptIn` + linkul de trimis leadului.
 */
export async function startConversation(
  tenantId: string,
  userId: string,
  leadId: string,
  channelId: string,
  input: ComposeInput & { to?: string | null }
): Promise<SendOutcome | { needsOptIn: true; reason: string }> {
  const [channel] = await db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.id, channelId), eq(commChannels.tenantId, tenantId)));
  if (!channel) throw new CommsError("not_found", "Canalul nu există.", 404);
  assertMailboxOwner(channel, userId);
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  if (!lead) throw new CommsError("not_found", "Leadul nu există.", 404);

  // Contact existent al leadului pe canalul ăsta?
  let [contact] = await db
    .select()
    .from(commContacts)
    .where(and(eq(commContacts.channelId, channel.id), eq(commContacts.leadId, lead.id)))
    .limit(1);

  if (!contact) {
    let externalUserId: string | null = null;
    if (channel.kind === "whatsapp") {
      const digits = (input.to ?? lead.phone ?? "").replace(/\D+/g, "");
      if (digits.length < 8) throw new CommsError("no_address", "Leadul nu are un număr de telefon valid (cu prefixul țării).", 400);
      externalUserId = digits;
    } else if (channel.kind === "gmail") {
      const email = (input.to ?? lead.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CommsError("no_address", "Leadul nu are o adresă de email validă.", 400);
      externalUserId = email;
    } else {
      return {
        needsOptIn: true,
        reason:
          channel.kind === "telegram"
            ? "Telegram nu permite botului să scrie primul. Trimite-i leadului linkul de mai jos; după ce îl deschide, conversația apare în inbox."
            : "Viber permite mesaje doar abonaților botului. Trimite-i leadului linkul de mai jos; după ce îl deschide, conversația apare în inbox.",
      };
    }
    await db
      .insert(commContacts)
      .values({
        tenantId,
        channelId: channel.id,
        externalUserId,
        displayName: lead.fullName,
        phone: channel.kind === "whatsapp" ? `+${externalUserId}` : lead.phone,
        email: channel.kind === "gmail" ? externalUserId : lead.email,
        leadId: lead.id,
      })
      .onConflictDoNothing();
    [contact] = await db
      .select()
      .from(commContacts)
      .where(and(eq(commContacts.channelId, channel.id), eq(commContacts.externalUserId, externalUserId)));
    if (contact && contact.leadId !== lead.id) {
      await db.update(commContacts).set({ leadId: lead.id }).where(eq(commContacts.id, contact.id));
    }
  }

  // Gmail: un subiect nou = un fir nou; mesagerii: o singură conversație per contact.
  const threadKey = channel.kind === "gmail" ? `new:${crypto.randomUUID()}` : "";
  let conv: CommConversation | undefined;
  if (channel.kind !== "gmail") {
    [conv] = await db
      .select()
      .from(commConversations)
      .where(and(eq(commConversations.channelId, channel.id), eq(commConversations.contactId, contact.id), eq(commConversations.externalThreadId, "")));
  }
  if (!conv) {
    [conv] = await db
      .insert(commConversations)
      .values({
        tenantId,
        channelId: channel.id,
        contactId: contact.id,
        leadId: lead.id,
        externalThreadId: threadKey,
        subject: input.subject?.slice(0, 500) ?? null,
        assignedTo: userId,
      })
      .returning();
  }
  return sendInConversation(tenantId, userId, conv.id, input);
}
