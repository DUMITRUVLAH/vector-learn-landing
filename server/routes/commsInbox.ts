/**
 * COMMS-301 — inboxul omnicanal. Montat la /api/comms/inbox.
 *
 *   GET   /summary                         necitite pe canal (insigna din meniu)
 *   GET   /conversations                   lista (filtre: channelId, kind, status, mine, unread, q, leadId)
 *   GET   /conversations/:id               conversația + mesajele + ce se poate trimite acum
 *   POST  /conversations/:id/messages      trimite (text / fișier prin link / template WhatsApp)
 *   POST  /conversations/:id/read          marchează citit (și bifele albastre pe WhatsApp)
 *   PATCH /conversations/:id               închide/redeschide, atribuie, leagă de alt lead
 *   GET   /leads/:leadId                   conversațiile leadului + canalele pe care i se poate scrie
 *   POST  /start                           prima scriere către un lead pe un canal
 *   GET   /channels/:id/templates          template-urile WhatsApp aprobate
 *   GET   /media/:messageId/:index         descărcarea unui fișier primit (proxy — tokenul rămâne pe server)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gt, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { commChannels, commContacts, commConversations, commMessages, type CommMediaItem } from "../db/schema/comms";
import { leads } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { adapterContext, isMockChannel } from "../lib/comms/channelStore";
import { freshGmailCreds } from "../lib/comms/gmailService";
import { getAdapter } from "../lib/comms/registry";
import { markWhatsappRead, listWhatsappTemplates } from "../lib/comms/adapters/whatsapp";
import { sendInConversation, sendRestrictions, startConversation, WHATSAPP_WINDOW_MS } from "../lib/comms/send";
import { leadLinkPayload, telegramDeepLink, viberDeepLink } from "../lib/comms/deepLink";
import { CommsError } from "../lib/comms/types";
import { str } from "../lib/comms/util";

export const commsInboxRoutes = new Hono<{ Variables: AuthVariables }>();
commsInboxRoutes.use("/*", requireAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(c: { json: (b: unknown, s: number) => Response }, err: unknown) {
  if (err instanceof CommsError) return c.json({ error: err.code, message: err.message }, err.httpStatus);
  throw err;
}

function isMissingSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|undefined_table/i.test(msg);
}

const composeSchema = z.object({
  text: z.string().max(20_000).nullish(),
  subject: z.string().max(500).nullish(),
  media: z
    .object({
      type: z.enum(["image", "document", "video", "audio"]),
      url: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Linkul trebuie să fie https"),
      name: z.string().max(256).nullish(),
    })
    .nullish(),
  template: z
    .object({
      name: z.string().min(1).max(200),
      language: z.string().min(2).max(15),
      params: z.array(z.string().max(1000)).max(20).default([]),
    })
    .nullish(),
  replyToMessageId: z.string().uuid().nullish(),
});

// ─── rezumat ─────────────────────────────────────────────────────────────────

commsInboxRoutes.get("/summary", async (c) => {
  const user = c.get("user");
  try {
    const rows = await db
      .select({
        kind: commChannels.kind,
        unread: sql<number>`coalesce(sum(${commConversations.unreadCount}), 0)`,
        conversations: sql<number>`count(*)`,
      })
      .from(commConversations)
      .innerJoin(commChannels, eq(commChannels.id, commConversations.channelId))
      .where(and(eq(commConversations.tenantId, user.tenantId), eq(commConversations.status, "open")))
      .groupBy(commChannels.kind);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, { unread: Number(r.unread), conversations: Number(r.conversations) }]));
    const unread = rows.reduce((s, r) => s + Number(r.unread), 0);
    return c.json({ unread, byKind });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ unread: 0, byKind: {} });
    throw err;
  }
});

// ─── lista ───────────────────────────────────────────────────────────────────

commsInboxRoutes.get("/conversations", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const filters: SQL[] = [eq(commConversations.tenantId, user.tenantId)];
  if (q.channelId && UUID.test(q.channelId)) filters.push(eq(commConversations.channelId, q.channelId));
  if (q.kind) filters.push(eq(commChannels.kind, q.kind));
  if (q.status === "open" || q.status === "closed") filters.push(eq(commConversations.status, q.status));
  if (q.mine === "1") filters.push(eq(commConversations.assignedTo, user.id));
  if (q.unread === "1") filters.push(gt(commConversations.unreadCount, 0));
  if (q.leadId && UUID.test(q.leadId)) filters.push(eq(commConversations.leadId, q.leadId));
  if (q.q?.trim()) {
    const term = `%${q.q.trim().slice(0, 100)}%`;
    filters.push(
      or(
        ilike(commContacts.displayName, term),
        ilike(commContacts.phone, term),
        ilike(commContacts.email, term),
        ilike(commContacts.username, term),
        ilike(leads.fullName, term),
        ilike(commConversations.subject, term),
        ilike(commConversations.lastMessagePreview, term)
      )!
    );
  }
  const limit = Math.min(Number(q.limit) || 100, 200);
  try {
    const items = await db
      .select({
        id: commConversations.id,
        status: commConversations.status,
        subject: commConversations.subject,
        unreadCount: commConversations.unreadCount,
        lastMessageAt: commConversations.lastMessageAt,
        lastMessagePreview: commConversations.lastMessagePreview,
        lastMessageDirection: commConversations.lastMessageDirection,
        lastInboundAt: commConversations.lastInboundAt,
        assignedTo: commConversations.assignedTo,
        assignedName: users.name,
        channelId: commChannels.id,
        channelKind: commChannels.kind,
        channelName: commChannels.name,
        contactId: commContacts.id,
        contactName: commContacts.displayName,
        contactPhone: commContacts.phone,
        contactEmail: commContacts.email,
        contactUsername: commContacts.username,
        contactAvatar: commContacts.avatarUrl,
        contactBlocked: commContacts.blockedAt,
        leadId: commConversations.leadId,
        leadName: leads.fullName,
      })
      .from(commConversations)
      .innerJoin(commChannels, eq(commChannels.id, commConversations.channelId))
      .innerJoin(commContacts, eq(commContacts.id, commConversations.contactId))
      .leftJoin(leads, eq(leads.id, commConversations.leadId))
      .leftJoin(users, eq(users.id, commConversations.assignedTo))
      .where(and(...filters))
      .orderBy(sql`${commConversations.lastMessageAt} desc nulls last`)
      .limit(limit);
    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});

async function loadConversation(tenantId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ conv: commConversations, channel: commChannels, contact: commContacts })
    .from(commConversations)
    .innerJoin(commChannels, eq(commChannels.id, commConversations.channelId))
    .innerJoin(commContacts, eq(commContacts.id, commConversations.contactId))
    .where(and(eq(commConversations.id, id), eq(commConversations.tenantId, tenantId)));
  return row ?? null;
}

// ─── o conversație ───────────────────────────────────────────────────────────

commsInboxRoutes.get("/conversations/:id", async (c) => {
  const user = c.get("user");
  const row = await loadConversation(user.tenantId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  const { conv, channel, contact } = row;

  const msgs = await db
    .select({
      id: commMessages.id,
      direction: commMessages.direction,
      kind: commMessages.kind,
      body: commMessages.body,
      subject: commMessages.subject,
      media: commMessages.media,
      status: commMessages.status,
      errorCode: commMessages.errorCode,
      errorMessage: commMessages.errorMessage,
      templateName: commMessages.templateName,
      senderUserId: commMessages.senderUserId,
      senderName: users.name,
      meta: commMessages.meta,
      sentAt: commMessages.sentAt,
      deliveredAt: commMessages.deliveredAt,
      readAt: commMessages.readAt,
      createdAt: commMessages.createdAt,
    })
    .from(commMessages)
    .leftJoin(users, eq(users.id, commMessages.senderUserId))
    .where(eq(commMessages.conversationId, conv.id))
    .orderBy(desc(commMessages.createdAt))
    .limit(300);
  msgs.reverse();

  const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
  const r = sendRestrictions(channel, conv, contact, (lastInbound?.meta as Record<string, unknown> | null) ?? null);
  const [lead] = conv.leadId
    ? await db
        .select({ id: leads.id, fullName: leads.fullName, phone: leads.phone, email: leads.email, stage: leads.stage, consentRevokedAt: leads.consentRevokedAt })
        .from(leads)
        .where(eq(leads.id, conv.leadId))
    : [];

  return c.json({
    conversation: {
      id: conv.id,
      status: conv.status,
      subject: conv.subject,
      assignedTo: conv.assignedTo,
      unreadCount: conv.unreadCount,
      lastInboundAt: conv.lastInboundAt,
      leadId: conv.leadId,
    },
    channel: { id: channel.id, kind: channel.kind, name: channel.name, status: channel.status, mock: isMockChannel(channel) },
    contact: {
      id: contact.id,
      externalUserId: contact.externalUserId,
      displayName: contact.displayName,
      phone: contact.phone,
      email: contact.email,
      username: contact.username,
      avatarUrl: contact.avatarUrl,
      blockedAt: contact.blockedAt,
    },
    lead: lead ?? null,
    messages: msgs.map(({ meta: _meta, ...m }) => m),
    compose: {
      ...r,
      consentRevoked: Boolean(lead?.consentRevokedAt),
      windowExpiresAt:
        channel.kind === "whatsapp" && conv.lastInboundAt ? new Date(new Date(conv.lastInboundAt).getTime() + WHATSAPP_WINDOW_MS) : null,
    },
  });
});

commsInboxRoutes.post("/conversations/:id/messages", zValidator("json", composeSchema), async (c) => {
  const user = c.get("user");
  if (!UUID.test(c.req.param("id"))) return c.json({ error: "not_found" }, 404);
  try {
    const out = await sendInConversation(user.tenantId, user.id, c.req.param("id"), c.req.valid("json"));
    return c.json({ message: out.message }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

commsInboxRoutes.post("/conversations/:id/read", async (c) => {
  const user = c.get("user");
  const row = await loadConversation(user.tenantId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  await db.update(commConversations).set({ unreadCount: 0 }).where(eq(commConversations.id, row.conv.id));
  // Bifele albastre pe WhatsApp: marcarea ultimului mesaj le marchează și pe cele dinainte.
  if (row.channel.kind === "whatsapp" && row.conv.unreadCount > 0 && !isMockChannel(row.channel) && row.channel.status === "active") {
    const [last] = await db
      .select({ externalId: commMessages.externalId })
      .from(commMessages)
      .where(and(eq(commMessages.conversationId, row.conv.id), eq(commMessages.direction, "inbound"), isNotNull(commMessages.externalId)))
      .orderBy(desc(commMessages.createdAt))
      .limit(1);
    if (last?.externalId) await markWhatsappRead(adapterContext(row.channel), last.externalId);
  }
  return c.json({ ok: true });
});

const patchConv = z.object({
  status: z.enum(["open", "closed"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
});

commsInboxRoutes.patch("/conversations/:id", zValidator("json", patchConv), async (c) => {
  const user = c.get("user");
  const row = await loadConversation(user.tenantId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  if (body.assignedTo) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, body.assignedTo), eq(users.tenantId, user.tenantId)));
    if (!u) return c.json({ error: "invalid_user" }, 400);
  }
  if (body.leadId) {
    const [l] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, body.leadId), eq(leads.tenantId, user.tenantId)));
    if (!l) return c.json({ error: "invalid_lead" }, 400);
    // Legătura e a OMULUI, nu doar a conversației: mesajele viitoare de la el merg la același lead.
    await db.update(commContacts).set({ leadId: body.leadId, updatedAt: new Date() }).where(eq(commContacts.id, row.contact.id));
  }
  const [conv] = await db
    .update(commConversations)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
      ...(body.leadId !== undefined ? { leadId: body.leadId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(commConversations.id, row.conv.id))
    .returning();
  return c.json({ conversation: conv });
});

// ─── din fișa leadului ───────────────────────────────────────────────────────

commsInboxRoutes.get("/leads/:leadId", async (c) => {
  const user = c.get("user");
  const leadId = c.req.param("leadId");
  if (!UUID.test(leadId)) return c.json({ error: "not_found" }, 404);
  const [lead] = await db
    .select({ id: leads.id, phone: leads.phone, email: leads.email })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);
  try {
    const conversations = await db
      .select({
        id: commConversations.id,
        channelId: commChannels.id,
        channelKind: commChannels.kind,
        channelName: commChannels.name,
        subject: commConversations.subject,
        unreadCount: commConversations.unreadCount,
        lastMessageAt: commConversations.lastMessageAt,
        lastMessagePreview: commConversations.lastMessagePreview,
        status: commConversations.status,
      })
      .from(commConversations)
      .innerJoin(commChannels, eq(commChannels.id, commConversations.channelId))
      .where(and(eq(commConversations.tenantId, user.tenantId), eq(commConversations.leadId, leadId)))
      .orderBy(sql`${commConversations.lastMessageAt} desc nulls last`);
    const channels = await db
      .select()
      .from(commChannels)
      .where(and(eq(commChannels.tenantId, user.tenantId), eq(commChannels.status, "active")))
      .orderBy(asc(commChannels.createdAt));
    const payload = leadLinkPayload(user.tenantId, leadId);
    return c.json({
      conversations,
      channels: channels.map((ch) => {
        const cfg = (ch.config ?? {}) as Record<string, unknown>;
        const botUsername = str(cfg.botUsername);
        const botUri = str(cfg.botUri);
        return {
          id: ch.id,
          kind: ch.kind,
          name: ch.name,
          // Ce poate face agentul de aici: să scrie direct, sau să trimită leadului linkul de abonare.
          canStart: ch.kind === "whatsapp" ? Boolean(lead.phone) : ch.kind === "gmail" ? Boolean(lead.email) : false,
          optInLink:
            ch.kind === "telegram" && botUsername
              ? telegramDeepLink(botUsername, payload)
              : ch.kind === "viber" && botUri
                ? viberDeepLink(botUri, payload)
                : null,
          needsTemplate: ch.kind === "whatsapp",
        };
      }),
    });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ conversations: [], channels: [] });
    throw err;
  }
});

commsInboxRoutes.post(
  "/start",
  zValidator("json", composeSchema.extend({ leadId: z.string().uuid(), channelId: z.string().uuid(), to: z.string().max(255).nullish() })),
  async (c) => {
    const user = c.get("user");
    const { leadId, channelId, to, ...compose } = c.req.valid("json");
    try {
      const out = await startConversation(user.tenantId, user.id, leadId, channelId, { ...compose, to });
      if ("needsOptIn" in out) return c.json({ error: "needs_opt_in", message: out.reason }, 409);
      return c.json({ message: out.message, conversationId: out.conversationId }, 201);
    } catch (err) {
      return fail(c, err);
    }
  }
);

// ─── template-uri WhatsApp ───────────────────────────────────────────────────

commsInboxRoutes.get("/channels/:id/templates", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
  const [ch] = await db.select().from(commChannels).where(and(eq(commChannels.id, id), eq(commChannels.tenantId, user.tenantId)));
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.kind !== "whatsapp") return c.json({ templates: [] });
  if (isMockChannel(ch)) {
    return c.json({
      templates: [
        { name: "salut_revenire", language: "ro", category: "UTILITY", status: "APPROVED", body: "Bună, {{1}}! Revin la discuția noastră despre {{2}}.", paramCount: 2 },
        { name: "confirmare_programare", language: "ro", category: "UTILITY", status: "APPROVED", body: "Programarea ta e confirmată pentru {{1}}.", paramCount: 1 },
      ],
    });
  }
  try {
    const all = await listWhatsappTemplates(adapterContext(ch));
    return c.json({ templates: all.filter((t) => t.status === "APPROVED") });
  } catch (err) {
    return fail(c, err);
  }
});

// ─── fișiere primite ─────────────────────────────────────────────────────────

commsInboxRoutes.get("/media/:messageId/:index", async (c) => {
  const user = c.get("user");
  const id = c.req.param("messageId");
  const index = Number(c.req.param("index"));
  if (!UUID.test(id) || !Number.isInteger(index) || index < 0) return c.json({ error: "not_found" }, 404);
  const [row] = await db
    .select({ msg: commMessages, channel: commChannels })
    .from(commMessages)
    .innerJoin(commChannels, eq(commChannels.id, commMessages.channelId))
    .where(and(eq(commMessages.id, id), eq(commMessages.tenantId, user.tenantId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  const item = ((row.msg.media ?? []) as CommMediaItem[])[index];
  if (!item) return c.json({ error: "not_found" }, 404);
  // Un link trimis de noi (outbound) e public oricum — redirecționăm.
  if (row.msg.direction === "outbound" && item.url) return c.redirect(item.url, 302);
  if (isMockChannel(row.channel)) return c.json({ error: "mock_media", message: "Canal simulat — nu există fișier real." }, 404);
  const adapter = getAdapter(row.channel.kind);
  const ref = item.providerFileId ?? item.url;
  if (!adapter?.fetchMedia || !ref) return c.json({ error: "not_found" }, 404);
  try {
    const ctx = adapterContext(row.channel, row.channel.kind === "gmail" ? await freshGmailCreds(row.channel) : undefined);
    const file = await adapter.fetchMedia(ctx, ref);
    const name = (item.name ?? `fisier-${index}`).replace(/[^\w.\- ]+/g, "_");
    return new Response(file.body, {
      headers: {
        "Content-Type": file.mime ?? item.mime ?? "application/octet-stream",
        // attachment + nosniff: un fișier trimis de un străin nu se execută în originea aplicației.
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});
