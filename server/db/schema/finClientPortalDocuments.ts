/**
 * CLIENTPORTAL-003: Documents uploaded by a client through the financial portal.
 * Stores file metadata + content (base64 in storagePath for Vercel serverless compatibility).
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
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
    /** Base64 data URL (data:<mime>;base64,<content>) or a filesystem path */
    storagePath: text("storage_path").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fcpd_tenant_idx").on(t.tenantId),
    tokenIdx: index("fcpd_token_idx").on(t.portalTokenId),
  })
);

export type FinClientPortalDocument = typeof finClientPortalDocuments.$inferSelect;
export type NewFinClientPortalDocument = typeof finClientPortalDocuments.$inferInsert;
