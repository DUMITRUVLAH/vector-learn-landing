/**
 * COMMS-301 — modulul de comunicare omnicanal: WhatsApp, Telegram, Viber, Gmail.
 *
 * DE CE TABELE NOI și nu `messages` (COMM-201): `messages` e jurnalul trimiterilor AUTOMATE ale
 * aplicației (notificări, digesturi) — un singur sens, fără conversație, fără contact extern.
 * Aici e o discuție în ambele sensuri cu un om din afară, pe un canal care are propriul
 * identificator (wa_id, chat_id Telegram, id Viber, adresă de email) și propriile reguli
 * (fereastra de 24h WhatsApp, abonarea Viber, /start la Telegram). Amestecarea lor ar fi făcut
 * fiecare interogare din inbox să filtreze notificările aplicației.
 *
 * Cronologia leadului rămâne UNA: fiecare mesaj de aici se oglindește și în `lead_interactions`
 * (vezi server/lib/comms/ingest.ts), exact ca emailul trimis din fișă (crmComms.ts).
 *
 * Detaliile tehnice și documentația oficială per canal: docs/comms/.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { leads } from "./leads";

/** Canalele suportate. Varchar, nu enum: un canal nou nu trebuie să ceară `ALTER TYPE` pe prod. */
export const COMM_CHANNEL_KINDS = ["whatsapp", "telegram", "viber", "gmail"] as const;
export type CommChannelKind = (typeof COMM_CHANNEL_KINDS)[number];

/**
 * Un cont conectat: un număr WhatsApp Business, un bot Telegram, un bot Viber, o cutie Gmail.
 * Un workspace poate avea mai multe din același fel (două numere, doi agenți cu Gmail propriu).
 */
export const commChannels = pgTable(
  "comm_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    /** Numele pe care îl vede echipa („WhatsApp vânzări", „Gmail Ion"). */
    name: varchar("name", { length: 120 }).notNull(),
    /** active | disabled | error | pending (Gmail înainte de OAuth). */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    /**
     * Id-ul contului LA FURNIZOR: phone_number_id (WA), id-ul botului (TG), uri-ul botului (Viber),
     * adresa de email (Gmail). Unic pe tip — același bot nu poate fi legat de două workspace-uri,
     * altfel un mesaj primit n-ar ști în ce inbox să intre.
     */
    externalId: varchar("external_id", { length: 255 }),
    /** Secretele (tokenuri, app secret, refresh token), JSON criptat AES-256-GCM (server/lib/crypto.ts). */
    credentialsEnc: text("credentials_enc"),
    /** Setări fără secrete: wabaId, botUsername, displayPhone, historyId Gmail, autoCreateLead… */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Segmentul aleator din URL-ul de webhook (`/api/comms/webhooks/<kind>/<secret>`). Identifică
     * canalul fără sesiune și e prima barieră; a doua e semnătura furnizorului.
     * Pentru WhatsApp e și `verify_token`-ul din handshake-ul Meta.
     */
    webhookSecret: varchar("webhook_secret", { length: 64 }).notNull(),
    /** Omul care a conectat canalul. La Gmail, e proprietarul cutiei. */
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    lastError: varchar("last_error", { length: 1000 }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("comm_channels_tenant_idx").on(t.tenantId, t.kind),
    externalUniq: uniqueIndex("comm_channels_kind_external_uniq").on(t.kind, t.externalId),
    secretUniq: uniqueIndex("comm_channels_webhook_secret_uniq").on(t.webhookSecret),
  })
);

/** Un om din afară, așa cum îl vede UN canal (același client pe WhatsApp și pe Gmail = 2 rânduri). */
export const commContacts = pgTable(
  "comm_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => commChannels.id, { onDelete: "cascade" }),
    /** wa_id (E.164 fără +), chat_id Telegram, id Viber, adresa de email (lowercase). */
    externalUserId: varchar("external_user_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 200 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    username: varchar("username", { length: 120 }),
    avatarUrl: varchar("avatar_url", { length: 1000 }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** Omul a blocat botul / s-a dezabonat — trimiterea spre el ar da oricum eroare. */
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelUserUniq: uniqueIndex("comm_contacts_channel_user_uniq").on(t.channelId, t.externalUserId),
    leadIdx: index("comm_contacts_lead_idx").on(t.leadId),
    tenantIdx: index("comm_contacts_tenant_idx").on(t.tenantId),
  })
);

/**
 * O discuție. Pe mesagerii = una per contact. Pe Gmail = una per fir (threadId), fiindcă un client
 * poate avea trei subiecte deschise în paralel și a le amesteca ar rupe răspunsurile din fir.
 */
export const commConversations = pgTable(
  "comm_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => commChannels.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => commContacts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** threadId Gmail; șir gol pe mesagerii (NOT NULL ca indexul unic să funcționeze). */
    externalThreadId: varchar("external_thread_id", { length: 255 }).notNull().default(""),
    subject: varchar("subject", { length: 500 }),
    /** open | closed */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: varchar("last_message_preview", { length: 300 }),
    lastMessageDirection: varchar("last_message_direction", { length: 10 }),
    /** Ultimul mesaj PRIMIT — de aici se calculează fereastra de 24h WhatsApp. */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadUniq: uniqueIndex("comm_conversations_thread_uniq").on(t.channelId, t.contactId, t.externalThreadId),
    tenantLastIdx: index("comm_conversations_tenant_last_idx").on(t.tenantId, t.lastMessageAt),
    leadIdx: index("comm_conversations_lead_idx").on(t.leadId),
    assignedIdx: index("comm_conversations_assigned_idx").on(t.tenantId, t.assignedTo),
  })
);

export interface CommMediaItem {
  /** image | video | audio | document | sticker */
  type: string;
  /** Id-ul fișierului la furnizor (media id WA, file_id TG, attachmentId Gmail). */
  providerFileId?: string | null;
  /** URL direct, când furnizorul îl dă (Viber, link trimis de noi). */
  url?: string | null;
  mime?: string | null;
  name?: string | null;
  size?: number | null;
}

export const commMessages = pgTable(
  "comm_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => commConversations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => commChannels.id, { onDelete: "cascade" }),
    /** inbound | outbound */
    direction: varchar("direction", { length: 10 }).notNull(),
    /** text | image | video | audio | document | sticker | location | contact | template | other */
    kind: varchar("kind", { length: 20 }).notNull().default("text"),
    body: text("body"),
    subject: varchar("subject", { length: 500 }),
    media: jsonb("media").$type<CommMediaItem[]>(),
    /**
     * Id-ul mesajului la furnizor (wamid, message_id TG, message_token Viber, id Gmail).
     * Unic pe canal: furnizorii re-livrează webhook-urile, iar fără indexul ăsta același mesaj
     * ar apărea de două ori în conversație.
     */
    externalId: varchar("external_id", { length: 255 }),
    /** queued | sent | delivered | read | failed | received */
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    errorCode: varchar("error_code", { length: 40 }),
    errorMessage: varchar("error_message", { length: 1000 }),
    /** Agentul care a scris (outbound). */
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Numele template-ului WhatsApp, când mesajul e unul aprobat. */
    templateName: varchar("template_name", { length: 200 }),
    /** Headere Gmail necesare pentru a răspunde în fir (Message-ID, References). */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    convIdx: index("comm_messages_conv_idx").on(t.conversationId, t.createdAt),
    externalUniq: uniqueIndex("comm_messages_channel_external_uniq").on(t.channelId, t.externalId),
    tenantIdx: index("comm_messages_tenant_idx").on(t.tenantId, t.createdAt),
  })
);

/**
 * Jurnalul brut al webhook-urilor. Când un client spune „mi-a scris pe WhatsApp și nu apare",
 * aici se vede dacă Meta a trimis ceva, dacă semnătura a trecut și ce eroare a dat procesarea.
 */
export const commWebhookEvents = pgTable(
  "comm_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id").references(() => commChannels.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    signatureOk: boolean("signature_ok").notNull().default(false),
    payload: jsonb("payload"),
    error: varchar("error", { length: 1000 }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelIdx: index("comm_webhook_events_channel_idx").on(t.channelId, t.receivedAt),
  })
);

export type CommChannel = typeof commChannels.$inferSelect;
export type CommContact = typeof commContacts.$inferSelect;
export type CommConversation = typeof commConversations.$inferSelect;
export type CommMessage = typeof commMessages.$inferSelect;
