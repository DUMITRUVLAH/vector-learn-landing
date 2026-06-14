import { pgTable, uuid, varchar, timestamp, pgEnum, boolean, integer, jsonb } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "growth", "pro", "enterprise"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  /**
   * INST-001: Institution type — drives which modules show in the cabinet.
   * "gradinita" → kindergarten modules only · "scoala" → school modules only
   * "mixt" → everything (default, so existing tenants keep seeing all modules).
   * Stored as varchar (not a pg enum) so the deploy-time self-heal in
   * sync-schema.ts can ADD COLUMN it without first creating a Postgres enum type.
   */
  institutionType: varchar("institution_type", { length: 20 }).notNull().default("mixt"),
  /** COMM-205: Tenant timezone for quiet hours (IANA, e.g. "Europe/Bucharest") */
  timezone: varchar("timezone", { length: 60 }).notNull().default("Europe/Bucharest"),
  /** CRM-135: Round-robin auto-assign — enable/disable */
  rrEnabled: boolean("rr_enabled").notNull().default(false),
  /** CRM-135: Ordered list of user IDs in the round-robin rotation */
  rrUserIds: jsonb("rr_user_ids").$type<string[]>().notNull().default([]),
  /** CRM-135: Pointer to next user in rotation (incrementing counter) */
  rrIndex: integer("rr_index").notNull().default(0),
  /** CRM-124: SLA threshold for "hot" leads in minutes (default 15) */
  slaHotMinutes: integer("sla_hot_minutes").notNull().default(15),
  /** CRM-124: Default SLA threshold for all leads in hours (default 24) */
  slaDefaultHours: integer("sla_default_hours").notNull().default(24),
  /** CRM-124: Days until a lead is considered "rotting" (default 7) */
  rotDays: integer("rot_days").notNull().default(7),
  // The following columns are created by migrations (0047/0055/0108) but were never declared in
  // this schema file — so `tenants.invoicePrefix` etc. resolved to `undefined` and 500'd every
  // route that selected them (tenantSettings, aiSettings, branding). Declared here to match the DB.
  /** SET-803: branding logo URL (migration 0055) */
  logoUrl: varchar("logo_url", { length: 500 }),
  /** SET-803: branding config blob (migration 0055) */
  brandingJson: jsonb("branding_json").$type<Record<string, unknown>>(),
  /** AI-A04: monthly AI budget cap in USD cents (migration 0047) */
  aiMonthlyBudgetUsdCents: integer("ai_monthly_budget_usd_cents"),
  /** PAY/CONT-PLATA: invoice number prefix (migration 0108) */
  invoicePrefix: varchar("invoice_prefix", { length: 20 }).notNull().default("VECT"),
  /** CONT-PLATA: tenant bank IBAN (migration 0108) */
  iban: varchar("iban", { length: 34 }),
  /** CONT-PLATA: tenant bank BIC/SWIFT (migration 0108) */
  bic: varchar("bic", { length: 11 }),
  /**
   * SPLIT-001: Application kind — separates the two apps in this repo.
   * 'learn'    → CRM Educațional (/app/*, /app/login, AppShell)
   * 'business' → Business Suite (/business/*, /business/login, BusinessShell)
   * Default 'learn' keeps all existing tenants in the CRM app.
   * Migration 0144 adds this column with ADD COLUMN IF NOT EXISTS.
   */
  appKind: varchar("app_kind", { length: 20 }).notNull().default("learn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
