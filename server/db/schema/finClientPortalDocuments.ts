/**
 * CLIENTPORTAL-003: Documents uploaded by a client through the financial portal.
 * Ține metadatele fișierului; conținutul stă în Supabase Storage, nu în Postgres.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { finClientPortalTokens } from "./finClientPortalTokens";

export const finClientPortalDocuments = pgTable(
  "fin_client_portal_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    portalTokenId: uuid("portal_token_id")
      .notNull()
      .references(() => finClientPortalTokens.id, { onDelete: "cascade" }),
    originalName: varchar("original_name", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /**
     * Moștenire: putea fi un data-URL base64 („data:<mime>;base64,…"), adică fișierul stătea în
     * Postgres. Din 2026-09-12 conține calea obiectului din Supabase Storage (bucket
     * `fin-client-portal`), iar conținutul nu mai atinge baza de date. Rândurile vechi rămân
     * base64 până le urcă backfill-ul; `objectPath` de mai jos spune care e care.
     */
    storagePath: text("storage_path").notNull(),
    /** true = `storagePath` e o cale de obiect în Storage; false/null = data-URL base64 vechi. */
    inObjectStore: boolean("in_object_store").notNull().default(false),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fcpd_tenant_idx").on(t.tenantId),
    tokenIdx: index("fcpd_token_idx").on(t.portalTokenId),
  })
);

export type FinClientPortalDocument = typeof finClientPortalDocuments.$inferSelect;
export type NewFinClientPortalDocument = typeof finClientPortalDocuments.$inferInsert;
