import { pgTable, uuid, varchar, timestamp, pgEnum, index, jsonb, integer, time } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "contacted",
  "trial",
  "paid",
  "lost",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "webform",
  "manual",
  "facebook_ad",
  "google_ads",
  "referral",
  "phone_in",
  "instagram",
  "import",
  "other",
]);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    phoneNormalized: varchar("phone_normalized", { length: 32 }),
    email: varchar("email", { length: 255 }),
    emailNormalized: varchar("email_normalized", { length: 255 }),
    interestCourse: varchar("interest_course", { length: 200 }),
    stage: leadStageEnum("stage").notNull().default("new"),
    source: leadSourceEnum("source").notNull().default("manual"),
    utmSource: varchar("utm_source", { length: 100 }),
    utmMedium: varchar("utm_medium", { length: 100 }),
    utmCampaign: varchar("utm_campaign", { length: 100 }),
    fbclid: varchar("fbclid", { length: 200 }),
    gclid: varchar("gclid", { length: 200 }),
    consentText: varchar("consent_text", { length: 500 }),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    ipAtConsent: varchar("ip_at_consent", { length: 64 }),
    notes: varchar("notes", { length: 2000 }),
    convertedToStudentId: uuid("converted_to_student_id").references(() => students.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    consentRevokedAt: timestamp("consent_revoked_at", { withTimezone: true }),
    lostReason: varchar("lost_reason", { length: 500 }),
    /** CRM-111: Lead score 0-100 derived from source signals — hot/warm/cold */
    score: integer("score"),
    /** CRM-113: Deal value in euro-cents (e.g. 36000 = €360.00) */
    valueCents: integer("value_cents").notNull().default(0),
    /** CRM-113: Remaining debt in euro-cents (shown on card only when > 0) */
    debtCents: integer("debt_cents").notNull().default(0),
    /** GAP-001: Preferred days of week (array of ints 1–7, Mon=1) */
    preferredDays: jsonb("preferred_days").$type<number[]>(),
    /** GAP-001: Preferred time window start (e.g. "17:00") */
    preferredTimeStart: time("preferred_time_start"),
    /** GAP-001: Preferred time window end (e.g. "19:00") */
    preferredTimeEnd: time("preferred_time_end"),
    /** CRM-114: Company name for B2B leads */
    company: varchar("company", { length: 300 }),
    /** CRM-114: Optional deal name — if set, used as title instead of full_name */
    dealName: varchar("deal_name", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("leads_tenant_idx").on(t.tenantId),
    stageIdx: index("leads_stage_idx").on(t.tenantId, t.stage),
    phoneIdx: index("leads_phone_idx").on(t.tenantId, t.phoneNormalized),
    emailIdx: index("leads_email_idx").on(t.tenantId, t.emailNormalized),
  })
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export const interactionTypeEnum = pgEnum("interaction_type", [
  "note",
  "call",
  "email",
  "whatsapp",
  "sms",
  "meeting",
  "stage_change",
  "system",
]);

export const interactionDirectionEnum = pgEnum("interaction_direction", [
  "inbound",
  "outbound",
  "internal",
]);

export const leadInteractions = pgTable(
  "lead_interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: interactionTypeEnum("type").notNull(),
    direction: interactionDirectionEnum("direction").notNull().default("internal"),
    body: varchar("body", { length: 2000 }),
    /** JSONB: { template_id, outcome, duration_seconds, recording_url } — CRM-109 */
    metadata: jsonb("metadata"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("li_tenant_idx").on(t.tenantId),
    leadIdx: index("li_lead_idx").on(t.leadId, t.occurredAt),
  })
);

export type LeadInteraction = typeof leadInteractions.$inferSelect;
export type NewLeadInteraction = typeof leadInteractions.$inferInsert;

// ─── CRM-114: Lead contacts (multiple contacts per B2B lead) ──────────────────

export const leadContacts = pgTable(
  "lead_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    role: varchar("role", { length: 100 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    isPrimary: integer("is_primary").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lc_tenant_idx").on(t.tenantId),
    leadIdx: index("lc_lead_idx").on(t.leadId),
  })
);

export type LeadContact = typeof leadContacts.$inferSelect;
export type NewLeadContact = typeof leadContacts.$inferInsert;

// ─── CRM-115: Lead tags ───────────────────────────────────────────────────────

export const leadTags = pgTable(
  "lead_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ltags_tenant_idx").on(t.tenantId),
    leadIdx: index("ltags_lead_idx").on(t.leadId),
    uniqueTag: index("ltags_unique_idx").on(t.leadId, t.tag),
  })
);

export type LeadTag = typeof leadTags.$inferSelect;

// ─── CRM-115: Custom fields (per tenant definition) ───────────────────────────

export const customFieldTypeEnum = pgEnum("custom_field_type", ["text", "select", "number"]);

export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),  // machine-readable slug
    label: varchar("label", { length: 200 }).notNull(),
    type: customFieldTypeEnum("type").notNull().default("text"),
    /** JSON array of strings for type=select, e.g. ["Ediție 1", "Ediție 2"] */
    options: jsonb("options").$type<string[]>(),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("cf_tenant_idx").on(t.tenantId),
    keyIdx: index("cf_key_idx").on(t.tenantId, t.key),
  })
);

export type CustomField = typeof customFields.$inferSelect;

// ─── CRM-115: Lead field values (per lead) ────────────────────────────────────

export const leadFieldValues = pgTable(
  "lead_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lfv_tenant_idx").on(t.tenantId),
    leadIdx: index("lfv_lead_idx").on(t.leadId),
    uniqueFieldLead: index("lfv_unique_idx").on(t.leadId, t.fieldId),
  })
);

export type LeadFieldValue = typeof leadFieldValues.$inferSelect;
