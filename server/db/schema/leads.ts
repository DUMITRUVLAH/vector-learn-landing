import { pgTable, uuid, varchar, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
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
    fullNameNormalized: varchar("full_name_normalized", { length: 200 }),  // [CRM-102] dedup
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
    userAgentAtConsent: varchar("user_agent_at_consent", { length: 512 }),  // [CRM-101]
    consentRevokedAt: timestamp("consent_revoked_at", { withTimezone: true }),  // [CRM-101]
    notes: varchar("notes", { length: 2000 }),
    mergedIntoId: uuid("merged_into_id"),  // [CRM-102] archived lead points to surviving lead
    convertedToStudentId: uuid("converted_to_student_id").references(() => students.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    lostReason: varchar("lost_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("leads_tenant_idx").on(t.tenantId),
    stageIdx: index("leads_stage_idx").on(t.tenantId, t.stage),
    phoneIdx: index("leads_phone_idx").on(t.tenantId, t.phoneNormalized),
    emailIdx: index("leads_email_idx").on(t.tenantId, t.emailNormalized),
    // [CRM-102] composite dedup index
    dedupIdx: index("leads_dedup_idx").on(t.tenantId, t.phoneNormalized, t.emailNormalized),
    nameIdx: index("leads_name_idx").on(t.tenantId, t.fullNameNormalized),
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
