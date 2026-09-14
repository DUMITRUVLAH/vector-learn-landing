/**
 * CRM — sursele de captare: formularele de pe site care pot crea leaduri, fără sesiune.
 *
 * Caietul de sarcini Ecosolar (cerința 68) cere integrare cu „website și formulare de lead
 * generation". Un endpoint public are nevoie de două lucruri pe care sesiunea le dădea gratis:
 * să știe ÎN CE workspace intră leadul, și dovada că are voie.
 *
 * De-aici cheia: fiecare formular primește un token propriu. Nu unul per workspace — dacă un
 * site e compromis sau un partener pleacă, se stinge doar formularul lui, fără să atingă restul.
 * Tokenul e PUBLIC prin natura lui (stă în JavaScriptul paginii), deci nu autorizează nimic în
 * afară de „creează un lead aici": nu citește, nu listează, nu șterge.
 *
 * `allowed_origins` limitează de pe ce domenii se acceptă cererea. Gol = orice origine — cazul
 * unui formular server-side, unde nu există `Origin`.
 *
 * Migrare: drizzle/0171_crm_capture_sources.sql
 */
import { pgTable, uuid, varchar, boolean, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const crmCaptureSources = pgTable(
  "crm_capture_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Numele în clar: „Formular cerere ofertă — ecosolar.md". */
    name: varchar("name", { length: 200 }).notNull(),
    /** Tokenul din pagina publică. Unic pe tot sistemul — el determină workspace-ul. */
    token: varchar("token", { length: 64 }).notNull(),
    /** Sursa cu care intră leadul (`leads.source`): webform, facebook_ad, google_ads… */
    defaultSource: varchar("default_source", { length: 40 }).notNull().default("webform"),
    /** Pâlnia în care aterizează; `null` = implicita workspace-ului. */
    pipelineId: uuid("pipeline_id"),
    /** Domeniile de pe care se acceptă cereri. `[]` = fără restricție de origine. */
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    /** Câte leaduri a adus — util ca să vezi care formular chiar funcționează. */
    leadsCaptured: integer("leads_captured").notNull().default(0),
    lastCaptureAt: timestamp("last_capture_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_capture_tenant_idx").on(t.tenantId), index("crm_capture_token_idx").on(t.token)]
);

export type CrmCaptureSource = typeof crmCaptureSources.$inferSelect;
export type NewCrmCaptureSource = typeof crmCaptureSources.$inferInsert;
