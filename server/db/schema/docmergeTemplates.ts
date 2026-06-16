/**
 * DOCMERGE-001: Document Merge Templates schema.
 *
 * Stores HTML/text template bodies with auto-detected {{placeholder}} tags.
 * Used by the Document Merge / Mass-PDF module to generate N PDFs from one template + Excel.
 */
import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const docmergeTemplates = pgTable(
  "docmerge_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** Source format: "html" (text/HTML with {{placeholders}}) — future: "docx" */
    sourceFormat: varchar("source_format", { length: 20 }).notNull().default("html"),
    /** The template body as HTML with {{placeholder}} tags inline */
    bodyHtml: text("body_html").notNull(),
    /** JSON array of placeholder names detected: '["name","amount","date"]' */
    placeholders: text("placeholders").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("docmerge_templates_tenant_idx").on(t.tenantId),
  ]
);

export type DocmergeTemplate = typeof docmergeTemplates.$inferSelect;
export type NewDocmergeTemplate = typeof docmergeTemplates.$inferInsert;
