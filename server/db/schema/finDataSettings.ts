/**
 * TRUST-001/003: FinDesk Data Trust & Privacy Settings (FIN-CORE §1.16)
 *
 * One row per tenant. Controls how the FinDesk AI features handle personal data:
 * - pseudonymize_ai_prompts:    strip PII from prompts before sending to LLM (default: true)
 * - ai_log_retention_days:      purge ai_audit_log entries older than N days (default: 90)
 * - ai_opt_in:                  tenant explicitly opted in to AI processing (default: false)
 * - retention_days_students:    anonymize student PII older than N days (default: 1825 = 5 ani)
 *
 * Used by the PII anonymizer (server/lib/piiAnonymizer.ts) and the budget guard.
 */

import {
  pgTable,
  uuid,
  boolean,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";

export const finDataSettings = pgTable(
  "fin_data_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * When true (default), all PII fields (names, IDNO, IBAN, email, phone)
     * are replaced with tokens before being included in any LLM prompt.
     * Required for GDPR compliance in the default deployment.
     */
    pseudonymizeAiPrompts: boolean("pseudonymize_ai_prompts")
      .notNull()
      .default(true),

    /**
     * Number of days to keep ai_audit_log rows for this tenant.
     * A nightly job (or on-demand purge) deletes rows older than this.
     * Range: 1–365. Default: 90 days.
     */
    aiLogRetentionDays: integer("ai_log_retention_days").notNull().default(90),

    /**
     * Whether the tenant has explicitly opted in to AI data processing.
     * If false, AI features may be restricted to pseudonymized mode only.
     * Default: false.
     */
    aiOptIn: boolean("ai_opt_in").notNull().default(false),

    /**
     * TRUST-003: How long to keep student personal data before anonymisation.
     * After N days of inactivity, PII fields (name, email, phone, dateOfBirth)
     * are replaced with GDPR removal markers via POST /api/fin/gdpr/anonymize-old.
     * Default: 1825 days (5 years) — typical educational record retention.
     * Range: 365–3650 days.
     */
    retentionDaysStudents: integer("retention_days_students")
      .notNull()
      .default(1825),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantUniq: unique("fds_tenant_uniq").on(t.tenantId),
    tenantIdx: index("fds_tenant_idx").on(t.tenantId),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finDataSettingsRelations = relations(finDataSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [finDataSettings.tenantId],
    references: [tenants.id],
  }),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type FinDataSettings = typeof finDataSettings.$inferSelect;
export type InsertFinDataSettings = typeof finDataSettings.$inferInsert;

// ─── Default values (exported for use in upsert logic) ───────────────────────

export const FIN_DATA_SETTINGS_DEFAULTS = {
  pseudonymizeAiPrompts: true,
  aiLogRetentionDays: 90,
  aiOptIn: false,
  retentionDaysStudents: 1825,
} as const;
