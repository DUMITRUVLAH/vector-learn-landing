import { pgTable, uuid, varchar, timestamp, pgEnum, index, jsonb, integer, time } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";
import { courses } from "./courses";

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
    fullNameNormalized: varchar("full_name_normalized", { length: 200 }),  // [CRM-102]
    phone: varchar("phone", { length: 32 }),
    phoneNormalized: varchar("phone_normalized", { length: 32 }),
    email: varchar("email", { length: 255 }),
    emailNormalized: varchar("email_normalized", { length: 255 }),
    interestCourse: varchar("interest_course", { length: 200 }),
    /** Produsul/serviciul vândut, din catalogul `crm_products` (migrarea 0171).
     *  Până acum „produsul" unui lead era textul liber din `interest_course`, iar raportul „pe
     *  produs" grupa după ce a tastat fiecare — „Panouri 10kW", „panouri 10 kw" și „PV 10" erau
     *  trei produse diferite. `interest_course` rămâne, ca notă a ce a cerut clientul; deciziile
     *  și rapoartele se sprijină pe legătura asta. FK-ul e declarat în migrare, nu aici, ca
     *  schema să nu depindă de ordinea importurilor între fișiere. */
    productId: uuid("product_id"),
    /** Câte bucăți acoperă oportunitatea (migrarea 0177). La câștig, atâtea se scad din stocul
     *  produsului. 1 = cazul implicit, ca lead-urile de dinainte să nu-și schimbe înțelesul. */
    productQty: integer("product_qty").notNull().default(1),
    /** Mișcarea de ieșire (`fin_stock_movements`) care a consumat stocul pentru acest lead.
     *  E ancora de idempotență: cât timp e setată, o nouă intrare în etapa „câștigat" NU mai
     *  scade nimic, iar ieșirea din etapă știe exact ce mișcare să compenseze. */
    stockMovementId: uuid("stock_movement_id"),
    /** Probabilitatea de câștig A ACESTEI oportunități, 0-100. `null` = se moștenește de la
     *  etapă (`crm_pipeline_stages.probability_pct`). Caietul de sarcini (cerința 10) o cere per
     *  oportunitate, nu doar per etapă: două afaceri în aceeași etapă nu au aceeași șansă. */
    probabilityPct: integer("probability_pct"),
    /** Câte apeluri s-au dat pe leadul ăsta (migrarea 0181). Rezultatele terminale („număr
     *  greșit", „refuz ferm") NU cresc contorul: o regulă de tipul „după 5 încercări renunțăm"
     *  n-are voie să se consume pe un număr greșit, lăsând firma nesunată cu adevărat. */
    callAttempts: integer("call_attempts").notNull().default(0),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    /** Ultimul rezultat, din vocabularul din `server/lib/crm/callOutcomes.ts`. */
    lastCallOutcome: varchar("last_call_outcome", { length: 40 }),
    /** Când a primit leadul responsabilul actual (migrarea 0182). Fără data asta, „repartizat de
     *  N zile și neatins" ar trebui dedus din cronologie, la fiecare rulare a cronului, pentru
     *  toată baza. `null` = leaduri de dinainte de coloană; ele nu se întorc automat în rezervă,
     *  fiindcă nu știm de când stau. */
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Pâlnia în care stă leadul (migrarea 0166). `null` = pâlnia implicită a workspace-ului —
     *  așa migrarea nu trebuie să rescrie fiecare lead existent ca produsul să fie corect. */
    pipelineId: uuid("pipeline_id"),
    /** Cheia etapei din `crm_pipeline_stages`. Varchar, nu enum: etapele sunt
     *  proces comercial per workspace, nu constante de produs (migrarea 0162).
     *  `leadStageEnum` rămâne exportat — alt cod încă îl referențiază. */
    stage: varchar("stage", { length: 64 }).notNull().default("new"),
    source: leadSourceEnum("source").notNull().default("manual"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),  // [CRM-103]
    utmSource: varchar("utm_source", { length: 100 }),
    utmMedium: varchar("utm_medium", { length: 100 }),
    utmCampaign: varchar("utm_campaign", { length: 100 }),
    fbclid: varchar("fbclid", { length: 200 }),
    gclid: varchar("gclid", { length: 200 }),
    leadgenId: varchar("leadgen_id", { length: 200 }),  // [CRM-104] Facebook leadgen_id for idempotency
    metaFormId: varchar("meta_form_id", { length: 200 }),  // [CRM-104] Facebook form ID
    metaAdId: varchar("meta_ad_id", { length: 200 }),     // [CRM-104] Facebook ad ID
    consentText: varchar("consent_text", { length: 500 }),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    ipAtConsent: varchar("ip_at_consent", { length: 64 }),
    userAgentAtConsent: varchar("user_agent_at_consent", { length: 512 }),  // [CRM-101]
    consentRevokedAt: timestamp("consent_revoked_at", { withTimezone: true }),  // [CRM-101]
    notes: varchar("notes", { length: 2000 }),
    mergedIntoId: uuid("merged_into_id"),  // [CRM-102] audit pointer
    convertedToStudentId: uuid("converted_to_student_id").references(() => students.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    lostReason: varchar("lost_reason", { length: 500 }),
    /** CRM-111: Lead score 0-100 derived from source signals — hot/warm/cold */
    score: integer("score"),
    /** AI-A03: AI qualification bucket — hot | warm | cold (rule-based, cached) */
    qualification: varchar("qualification", { length: 10 }),
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
    /** Legătura către baza unică de firme (`crm_companies`, migrarea 0164).
     *  `company` (textul) rămâne afișarea de rezervă pentru lead-urile vechi —
     *  nu-l rescriem, doar adăugăm legătura. FK-ul e declarat în migrare, nu
     *  aici, ca schema să nu depindă de ordinea importurilor între fișiere. */
    companyId: uuid("company_id"),
    /** CRM-114: Optional deal name — if set, used as title instead of full_name */
    dealName: varchar("deal_name", { length: 300 }),
    /** INTEG-101: FK to courses — curs de interes structural (selectat din lista de cursuri reale) */
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    /** INTEG-101: FK to branches — filiale (UUID, FK constraint added when branches table is on main) */
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("leads_tenant_idx").on(t.tenantId),
    stageIdx: index("leads_stage_idx").on(t.tenantId, t.stage),
    phoneIdx: index("leads_phone_idx").on(t.tenantId, t.phoneNormalized),
    emailIdx: index("leads_email_idx").on(t.tenantId, t.emailNormalized),
    dedupIdx: index("leads_dedup_idx").on(t.tenantId, t.phoneNormalized, t.emailNormalized),
    nameIdx: index("leads_name_idx").on(t.tenantId, t.fullNameNormalized),
    assignedIdx: index("leads_assigned_idx").on(t.tenantId, t.assignedTo),
    leadgenIdx: index("leads_leadgen_idx").on(t.tenantId, t.leadgenId),  // [CRM-104]
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
export type NewCustomField = typeof customFields.$inferInsert;

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
export type NewLeadFieldValue = typeof leadFieldValues.$inferInsert;

// ─── Fișiere atașate unui lead (Faza 9) ──────────────────────────────────────

/**
 * Tabela există din migrarea 0002, dar n-a fost niciodată declarată în schema drizzle — deci
 * codul n-o putea interoga. Faza 9 o aduce în cod și îi adaugă `storage_path`: conținutul stă în
 * Supabase Storage (bucket `crm-lead-files`), nu în Postgres.
 *
 * De ce nu data-URL base64 în `file_url`, cum făcea crm-vector la început: base64 umflă fișierul
 * cu +33%, iar listarea fișierelor unui lead ar trage tot conținutul din bază chiar dacă nimeni
 * nu deschide nimic. Exact motivul pentru care atașamentele PAR au fost mutate în Storage
 * (server/lib/storage/objectStore.ts). `file_url` rămâne, nullable, pentru rândurile vechi.
 */
export const leadAttachments = pgTable(
  "lead_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 300 }).notNull(),
    /** Calea obiectului în bucket-ul `crm-lead-files`. Sursa adevărului pentru fișierele noi. */
    storagePath: varchar("storage_path", { length: 512 }),
    /** Doar pentru rândurile vechi (data-URL sau link extern). Nullable de la migrarea 0168. */
    fileUrl: varchar("file_url", { length: 1000 }),
    mime: varchar("mime", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("la_tenant_idx").on(t.tenantId),
    leadIdx: index("la_lead_idx").on(t.leadId),
  })
);

export type LeadAttachment = typeof leadAttachments.$inferSelect;
export type NewLeadAttachment = typeof leadAttachments.$inferInsert;
