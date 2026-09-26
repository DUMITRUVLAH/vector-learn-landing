/**
 * COMMS-301 — ce se întâmplă când un client ne scrie, pe orice canal.
 *
 *  1. Omul devine (sau e deja) un `comm_contacts` al canalului.
 *  2. Contactul se leagă de un LEAD: deep link semnat → leadul din link; altfel după telefon /
 *     email normalizat (aceeași regulă de dedup ca la captare, server/lib/crm/normalize.ts);
 *     altfel se creează un lead nou (dezactivabil per canal cu `config.autoCreateLead = false`).
 *  3. Mesajul intră în conversație O SINGURĂ DATĂ: furnizorii re-livrează webhook-urile (Meta
 *     până la 7 zile, Viber de 10 ori, Telegram „de un număr rezonabil de ori"), iar indexul unic
 *     (channel_id, external_id) + `onConflictDoNothing` face re-livrarea inofensivă.
 *  4. Mesajul se oglindește în `lead_interactions` — cronologia leadului rămâne una singură.
 *  5. Un răspuns de la client oprește cadențele (ca apelul primit din crmComms).
 *  6. Responsabilul primește notificare la PRIMUL mesaj necitit, nu la fiecare.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { commChannels, commContacts, commConversations, commMessages, type CommChannel, type CommContact } from "../../db/schema/comms";
import { leads, leadInteractions, type NewLead } from "../../db/schema/leads";
import { normalizeEmail, normalizePhone } from "../crm/normalize";
import { ensureTenantPipeline } from "../crm/pipelines";
import { stopCadencesOnReply } from "../crm/cadences";
import { logCrmAudit } from "../crm/audit";
import { createNotification, notifyManagersAndOwners } from "../createNotification";
import { assignLeadAutomatically } from "../../routes/crmAssignment";
import { runAutomations } from "../../routes/crmAutomations";
import { parseLeadLinkPayload } from "./deepLink";
import { patchChannelConfig } from "./channelStore";
import { CHANNEL_LABEL, INTERACTION_TYPE } from "./registry";
import type { CommChannelKind, ContactEvent, InboundMessageEvent, NormalizedEvent, StatusEvent } from "./types";
import { preview } from "./util";

export interface IngestResult {
  messages: number;
  duplicates: number;
  statuses: number;
  leadsCreated: number;
  /** Mesaje Gmail care nu țin de niciun lead — nestocate intenționat. */
  skipped: number;
}

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, received: 3, failed: 1 };

const KIND_FALLBACK: Record<string, string> = {
  image: "📷 Imagine",
  video: "🎬 Video",
  audio: "🎤 Mesaj vocal",
  document: "📎 Document",
  sticker: "Sticker",
  location: "📍 Locație",
  contact: "👤 Contact",
};

async function upsertContact(
  channel: CommChannel,
  ev: Pick<InboundMessageEvent, "externalUserId" | "displayName" | "phone" | "email" | "username" | "avatarUrl">
): Promise<CommContact> {
  const where = and(eq(commContacts.channelId, channel.id), eq(commContacts.externalUserId, ev.externalUserId));
  const [existing] = await db.select().from(commContacts).where(where);
  if (existing) {
    const patch: Partial<CommContact> = {};
    if (ev.displayName && ev.displayName !== existing.displayName) patch.displayName = ev.displayName.slice(0, 200);
    if (ev.phone && !existing.phone) patch.phone = ev.phone.slice(0, 32);
    if (ev.email && !existing.email) patch.email = ev.email.slice(0, 255);
    if (ev.username && ev.username !== existing.username) patch.username = ev.username.slice(0, 120);
    if (ev.avatarUrl && ev.avatarUrl !== existing.avatarUrl) patch.avatarUrl = ev.avatarUrl.slice(0, 1000);
    if (Object.keys(patch).length === 0) return existing;
    const [updated] = await db
      .update(commContacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(commContacts.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  await db
    .insert(commContacts)
    .values({
      tenantId: channel.tenantId,
      channelId: channel.id,
      externalUserId: ev.externalUserId,
      displayName: ev.displayName?.slice(0, 200) ?? null,
      phone: ev.phone?.slice(0, 32) ?? null,
      email: ev.email?.slice(0, 255) ?? (channel.kind === "gmail" ? ev.externalUserId : null),
      username: ev.username?.slice(0, 120) ?? null,
      avatarUrl: ev.avatarUrl?.slice(0, 1000) ?? null,
    })
    .onConflictDoNothing();
  const [row] = await db.select().from(commContacts).where(where);
  return row;
}

async function leadInTenant(tenantId: string, leadId: string) {
  const [lead] = await db
    .select({ id: leads.id, assignedTo: leads.assignedTo, fullName: leads.fullName })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return lead ?? null;
}

/** Găsește sau creează leadul contactului. Întoarce și dacă l-a creat acum. */
async function resolveLead(
  channel: CommChannel,
  contact: CommContact,
  startPayload: string | null | undefined,
  firstText: string | null | undefined
): Promise<{ leadId: string | null; assignedTo: string | null; created: boolean }> {
  const tenantId = channel.tenantId;

  // 1. Deep link semnat — cea mai sigură legătură: omul a deschis linkul trimis de agent.
  const linked = parseLeadLinkPayload(tenantId, startPayload);
  if (linked) {
    const lead = await leadInTenant(tenantId, linked);
    if (lead) {
      if (contact.leadId !== lead.id) {
        await db.update(commContacts).set({ leadId: lead.id, updatedAt: new Date() }).where(eq(commContacts.id, contact.id));
      }
      return { leadId: lead.id, assignedTo: lead.assignedTo, created: false };
    }
  }

  // 2. Legătura existentă.
  if (contact.leadId) {
    const lead = await leadInTenant(tenantId, contact.leadId);
    if (lead) return { leadId: lead.id, assignedTo: lead.assignedTo, created: false };
  }

  // 3. Potrivire după telefon / email — aceeași regulă ca dedup-ul de la captare.
  const phoneN = normalizePhone(contact.phone);
  const emailN = normalizeEmail(contact.email);
  const ids = [];
  if (phoneN) ids.push(eq(leads.phoneNormalized, phoneN));
  if (emailN) ids.push(eq(leads.emailNormalized, emailN));
  if (ids.length) {
    const [match] = await db
      .select({ id: leads.id, assignedTo: leads.assignedTo })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), ids.length === 1 ? ids[0] : or(...ids)))
      .limit(1);
    if (match) {
      await db.update(commContacts).set({ leadId: match.id, updatedAt: new Date() }).where(eq(commContacts.id, contact.id));
      return { leadId: match.id, assignedTo: match.assignedTo, created: false };
    }
  }

  // 4. Om nou → lead nou. Un mesaj de la un necunoscut e exact definiția unui lead.
  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  if (cfg.autoCreateLead === false || (channel.kind === "gmail" && cfg.autoCreateLead !== true)) {
    return { leadId: null, assignedTo: null, created: false };
  }

  const label = CHANNEL_LABEL[channel.kind as CommChannelKind] ?? channel.kind;
  const pipeline = await ensureTenantPipeline(tenantId);
  const values: NewLead = {
    tenantId,
    fullName: (contact.displayName || contact.phone || contact.email || contact.username || `Contact ${label}`).slice(0, 200),
    phone: contact.phone,
    phoneNormalized: phoneN,
    email: contact.email,
    emailNormalized: emailN,
    source: "other",
    pipelineId: pipeline?.id ?? null,
    notes: `Primul contact pe ${label}${firstText ? `: ${firstText.slice(0, 500)}` : "."}`,
  };
  const [lead] = await db.insert(leads).values(values).returning();
  await db.update(commContacts).set({ leadId: lead.id, updatedAt: new Date() }).where(eq(commContacts.id, contact.id));

  // Ca la captarea din formular: distribuirea, apoi automatizările. Niciuna nu are voie să piardă mesajul.
  let assignedTo: string | null = lead.assignedTo ?? null;
  try {
    const assigned = await assignLeadAutomatically(tenantId, lead);
    assignedTo = assigned?.userId ?? assignedTo;
    const [afterAssign] = await db.select().from(leads).where(eq(leads.id, lead.id));
    await runAutomations({
      tenantId,
      userId: null,
      lead: afterAssign ?? lead,
      kind: "lead.created",
      assignFn: async (l) => (await assignLeadAutomatically(tenantId, l))?.userId ?? null,
    });
  } catch (e) {
    console.warn("[comms] distribuire/automatizări eșuate pentru leadul nou", e instanceof Error ? e.message : e);
  }
  await logCrmAudit({
    tenantId,
    actorId: null,
    action: "lead.captured",
    target: "crm_lead",
    targetId: lead.id,
    after: { source: `comms:${channel.kind}`, channelId: channel.id },
  });
  return { leadId: lead.id, assignedTo, created: true };
}

async function upsertConversation(channel: CommChannel, contact: CommContact, threadId: string, subject: string | null, leadId: string | null) {
  const where = and(
    eq(commConversations.channelId, channel.id),
    eq(commConversations.contactId, contact.id),
    eq(commConversations.externalThreadId, threadId)
  );
  const [existing] = await db.select().from(commConversations).where(where);
  if (existing) {
    if (leadId && existing.leadId !== leadId) {
      await db.update(commConversations).set({ leadId }).where(eq(commConversations.id, existing.id));
      existing.leadId = leadId;
    }
    return existing;
  }
  await db
    .insert(commConversations)
    .values({
      tenantId: channel.tenantId,
      channelId: channel.id,
      contactId: contact.id,
      leadId,
      externalThreadId: threadId,
      subject: subject?.slice(0, 500) ?? null,
    })
    .onConflictDoNothing();
  const [row] = await db.select().from(commConversations).where(where);
  return row;
}

async function notifyResponsible(
  tenantId: string,
  userId: string | null,
  title: string,
  body: string,
  leadId: string | null
): Promise<void> {
  const payload = { type: "comms.message", title, body, metadata: { leadId: leadId ?? undefined } };
  if (userId) await createNotification({ tenantId, userId, ...payload });
  else await notifyManagersAndOwners(tenantId, payload);
}

/**
 * Gmail e cutia PERSONALĂ a agentului: newsletter-e, facturi, mesaje de la prieteni. Implicit
 * intră în CRM doar ce ține de un lead — expeditor care e deja lead, contact deja legat, sau
 * răspuns într-un fir pornit din CRM. Restul nu se stochează deloc (nici măcar contactul).
 * `config.autoCreateLead = true` pe canal schimbă regula (cutie comună de tip office@).
 */
async function gmailShouldIngest(channel: CommChannel, ev: InboundMessageEvent): Promise<boolean> {
  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  if (cfg.autoCreateLead === true) return true;
  const [contact] = await db
    .select({ leadId: commContacts.leadId, id: commContacts.id })
    .from(commContacts)
    .where(and(eq(commContacts.channelId, channel.id), eq(commContacts.externalUserId, ev.externalUserId)));
  if (contact?.leadId) return true;
  if (ev.threadId) {
    const [conv] = await db
      .select({ id: commConversations.id })
      .from(commConversations)
      .where(and(eq(commConversations.channelId, channel.id), eq(commConversations.externalThreadId, ev.threadId)))
      .limit(1);
    if (conv) return true;
  }
  const emailN = normalizeEmail(ev.email ?? ev.externalUserId);
  if (!emailN) return false;
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, channel.tenantId), eq(leads.emailNormalized, emailN)))
    .limit(1);
  return Boolean(lead);
}

async function ingestMessage(channel: CommChannel, ev: InboundMessageEvent, result: IngestResult): Promise<void> {
  if (channel.kind === "gmail" && !(await gmailShouldIngest(channel, ev))) {
    result.skipped++;
    return;
  }
  const contact = await upsertContact(channel, ev);
  if (contact.blockedAt) {
    // Omul ne scrie din nou → evident nu ne mai blochează.
    await db.update(commContacts).set({ blockedAt: null }).where(eq(commContacts.id, contact.id));
  }
  const { leadId, assignedTo, created } = await resolveLead(channel, contact, ev.startPayload, ev.body);
  if (created) result.leadsCreated++;
  const conv = await upsertConversation(channel, contact, ev.threadId ?? "", ev.subject ?? null, leadId);

  const inserted = await db
    .insert(commMessages)
    .values({
      tenantId: channel.tenantId,
      conversationId: conv.id,
      channelId: channel.id,
      direction: "inbound",
      kind: ev.kind,
      body: ev.body ?? null,
      subject: ev.subject?.slice(0, 500) ?? null,
      media: ev.media ?? null,
      externalId: ev.externalId,
      status: "received",
      meta: ev.meta ?? null,
      sentAt: ev.timestamp,
      createdAt: ev.timestamp,
    })
    .onConflictDoNothing()
    .returning({ id: commMessages.id });
  if (inserted.length === 0) {
    result.duplicates++;
    return;
  }
  result.messages++;

  const text = preview(ev.body, KIND_FALLBACK[ev.kind] ?? "Mesaj nou");
  const wasRead = conv.unreadCount === 0;
  await db
    .update(commConversations)
    .set({
      lastMessageAt: ev.timestamp,
      lastInboundAt: ev.timestamp,
      lastMessagePreview: text,
      lastMessageDirection: "inbound",
      unreadCount: sql`${commConversations.unreadCount} + 1`,
      // Un client care revine redeschide discuția închisă.
      status: "open",
      updatedAt: new Date(),
    })
    .where(eq(commConversations.id, conv.id));

  if (leadId) {
    const label = CHANNEL_LABEL[channel.kind as CommChannelKind] ?? channel.kind;
    await db.insert(leadInteractions).values({
      tenantId: channel.tenantId,
      leadId,
      type: INTERACTION_TYPE[channel.kind as CommChannelKind] ?? "note",
      direction: "inbound",
      body: (ev.subject ? `${ev.subject}\n\n` : "") + (ev.body ?? KIND_FALLBACK[ev.kind] ?? `[${label}]`),
      metadata: { commMessageId: inserted[0].id, conversationId: conv.id, channelId: channel.id, via: channel.kind },
      occurredAt: ev.timestamp,
    });
    await stopCadencesOnReply(channel.tenantId, leadId, null);
  }

  if (wasRead) {
    const who = contact.displayName ?? contact.phone ?? contact.email ?? "Un client";
    await notifyResponsible(
      channel.tenantId,
      conv.assignedTo ?? assignedTo,
      `Mesaj nou pe ${CHANNEL_LABEL[channel.kind as CommChannelKind] ?? channel.kind} de la ${who}`,
      text,
      leadId
    );
  }
}

async function ingestContact(channel: CommChannel, ev: ContactEvent): Promise<void> {
  const contact = await upsertContact(channel, ev);
  if (!ev.startPayload) return;
  // Viber: omul a deschis chatul din linkul trimis de agent. Îl legăm de lead chiar dacă n-a scris încă.
  const { leadId } = await resolveLead(channel, contact, ev.startPayload, null);
  const conv = await upsertConversation(channel, contact, "", null, leadId);
  if (!conv.lastMessageAt) {
    await db
      .update(commConversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: "A deschis conversația din linkul trimis", updatedAt: new Date() })
      .where(eq(commConversations.id, conv.id));
  }
}

async function applyStatus(channel: CommChannel, ev: StatusEvent): Promise<boolean> {
  const [msg] = await db
    .select({ id: commMessages.id, status: commMessages.status })
    .from(commMessages)
    .where(and(eq(commMessages.channelId, channel.id), eq(commMessages.externalId, ev.externalId)));
  if (!msg) return false;
  // Statusurile vin în orice ordine (Meta o spune explicit): „delivered" după „read" nu coboară.
  if (msg.status === "read" || (ev.status !== "failed" && STATUS_RANK[ev.status] <= (STATUS_RANK[msg.status] ?? 0))) {
    return false;
  }
  await db
    .update(commMessages)
    .set({
      status: ev.status,
      ...(ev.status === "delivered" ? { deliveredAt: ev.timestamp } : {}),
      ...(ev.status === "read" ? { readAt: ev.timestamp } : {}),
      ...(ev.status === "failed"
        ? { errorCode: ev.errorCode?.slice(0, 40) ?? null, errorMessage: ev.errorMessage?.slice(0, 1000) ?? null }
        : {}),
    })
    .where(eq(commMessages.id, msg.id));
  return true;
}

export async function ingestEvents(channel: CommChannel, events: NormalizedEvent[]): Promise<IngestResult> {
  const result: IngestResult = { messages: 0, duplicates: 0, statuses: 0, leadsCreated: 0, skipped: 0 };
  for (const ev of events) {
    if (ev.type === "message") await ingestMessage(channel, ev, result);
    else if (ev.type === "contact") await ingestContact(channel, ev);
    else if (ev.type === "status") {
      if (await applyStatus(channel, ev)) result.statuses++;
    } else if (ev.type === "blocked") {
      await db
        .update(commContacts)
        .set({ blockedAt: ev.blocked ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(commContacts.channelId, channel.id), eq(commContacts.externalUserId, ev.externalUserId)));
    } else if (ev.type === "config") {
      await patchChannelConfig(channel, ev.patch);
    }
  }
  if (events.length) {
    await db.update(commChannels).set({ lastEventAt: new Date() }).where(eq(commChannels.id, channel.id));
  }
  return result;
}
