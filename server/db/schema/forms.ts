/**
 * FORMS-001 — Motor de formulare generice cu mapare câmp→lead
 *
 * Flow: manager creează formular (draft) → adaugă câmpuri tipizate →
 *       publică → vizitator submitează prin API public → lead creat/actualizat în CRM.
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { leads } from "./leads";

// ─── Enum: tipuri de câmpuri ──────────────────────────────────────────────────

export const formFieldTypeEnum = pgEnum("form_field_type", [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "rating",
  "yes_no",
  "date",
  "consent",
  "hidden",
]);

// ─── Enum: starea formularului ────────────────────────────────────────────────

export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "closed",
]);

// ─── Enum: starea submisiei ───────────────────────────────────────────────────

export const formSubmissionStatusEnum = pgEnum("form_submission_status", [
  "partial",
  "complete",
]);

// ─── Tabel: formulare ─────────────────────────────────────────────────────────

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: formStatusEnum("status").notNull().default("draft"),
    description: varchar("description", { length: 1000 }),
    thankYouMessage: varchar("thank_you_message", { length: 500 }),
    redirectUrl: varchar("redirect_url", { length: 1000 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** FORMS-005: contoare analytics per formular */
    views: integer("views").notNull().default(0),
    starts: integer("starts").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("forms_tenant_idx").on(t.tenantId),
    slugIdx: index("forms_slug_tenant_idx").on(t.tenantId, t.slug),
  })
);

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;

// ─── Tabel: câmpuri formular ──────────────────────────────────────────────────

export const formFields = pgTable(
  "form_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    type: formFieldTypeEnum("type").notNull(),
    label: varchar("label", { length: 500 }).notNull(),
    placeholder: varchar("placeholder", { length: 500 }),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
    /** Pentru câmpuri single_choice / multiple_choice / dropdown: lista de opțiuni */
    options: jsonb("options").$type<string[]>(),
    /** Mapare câmp→lead: fullName | phone | email | interestCourse | tag | none */
    leadMapping: varchar("lead_mapping", { length: 50 }),
    /** Câmp ascuns (ex: source din UTM) — nu apare în renderer public */
    hidden: boolean("hidden").notNull().default(false),
    /** Param din URL populat automat în câmpuri hidden */
    hiddenSourceParam: varchar("hidden_source_param", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantFormIdx: index("form_fields_tenant_form_idx").on(t.tenantId, t.formId),
  })
);

export type FormField = typeof formFields.$inferSelect;
export type NewFormField = typeof formFields.$inferInsert;

// ─── Tabel: submisii formular ─────────────────────────────────────────────────

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    /** Răspunsurile vizitatorului: { [fieldId]: value } */
    answers: jsonb("answers").notNull().$type<Record<string, unknown>>(),
    /** Lead creat sau actualizat din această submisie */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** UTM params transmiși la submit */
    utm: jsonb("utm").$type<{
      source?: string;
      medium?: string;
      campaign?: string;
      fbclid?: string;
      gclid?: string;
    }>(),
    status: formSubmissionStatusEnum("status").notNull().default("complete"),
    ip: varchar("ip", { length: 64 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("form_submissions_tenant_idx").on(t.tenantId),
    formIdx: index("form_submissions_form_idx").on(t.formId),
    leadIdx: index("form_submissions_lead_idx").on(t.leadId),
  })
);

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;

// ─── Tabel: reguli de logică condițională ─────────────────────────────────────

/**
 * FORMS-004 — Reguli de salt condițional.
 *
 * `condition`: { operator: "eq"|"neq"|"contains"|"gt"|"lt"|"is_empty"|"is_not_empty", value?: string|number }
 * `action`: "jump_to_field" (targetFieldId obligatoriu) | "jump_to_end"
 * `targetFieldId`: null când action="jump_to_end"
 */
export const formLogic = pgTable(
  "form_logic",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    fromFieldId: uuid("from_field_id")
      .notNull()
      .references(() => formFields.id, { onDelete: "cascade" }),
    condition: jsonb("condition")
      .notNull()
      .$type<{ operator: "eq" | "neq" | "contains" | "gt" | "lt" | "is_empty" | "is_not_empty"; value?: string | number }>(),
    action: varchar("action", { length: 50 }).notNull(),
    targetFieldId: uuid("target_field_id").references(() => formFields.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    formIdx: index("form_logic_form_idx").on(t.formId),
    tenantIdx: index("form_logic_tenant_idx").on(t.tenantId),
    fromFieldIdx: index("form_logic_from_field_idx").on(t.fromFieldId),
  })
);

export type FormLogicRule = typeof formLogic.$inferSelect;
export type NewFormLogicRule = typeof formLogic.$inferInsert;
