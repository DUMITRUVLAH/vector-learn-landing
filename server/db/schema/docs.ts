/**
 * DOCGEN-101 — Registrul de acte (acte de primire-predare, contracte, procese-verbale).
 *
 * De ce există: până acum actele se făceau în Word, pe un fișier copiat de la actul precedent.
 * Rechizitele furnizorului se retastau, numerotarea se ținea minte, iar PDF-ul semnat nu exista
 * nicăieri în sistem — deci nimeni nu putea răspunde la „ce acte avem cu furnizorul X pe proiectul
 * Y și cât din ele e plătit". Aici fiecare act are un rând, cu proiect, contraparte, sumă și stare.
 *
 * Decizii care se văd în schemă (backlog/docgen/DOCGEN-BACKLOG.md §6):
 * - Șabloanele NU au tabel propriu: refolosim `docmerge_templates` (extins cu kind/category/
 *   is_system/fields_json/version). Un singur depozit de șabloane pentru generarea unu-la-unu și
 *   pentru cea în masă — altfel ar diverge două biblioteci.
 * - `counterparty_snapshot` îngheață rechizitele la finalizare: dacă furnizorul își schimbă IBAN-ul
 *   mâine, actul semnat anul trecut rămâne cum a fost semnat. Registrul (par_vendors) rămâne sursa
 *   pentru actele viitoare.
 * - Contrapartea e polimorfă (par_vendors | fin_parties | inline), deci `counterparty_id` NU are FK.
 * - `body_hash` face actul finalizat imutabil, exact ca `par_requests.body_hash`.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { parProjects, parEvents, parPayers, parRequests } from "./par";
import { docmergeTemplates } from "./docmergeTemplates";

/** Actele generate. Stări: draft → final → cancelled (semnarea se marchează pe `final`). */
export const docDocuments = pgTable(
  "doc_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Șablonul din care s-a născut actul; `set null` ca ștergerea șablonului să nu piardă actul. */
    templateId: uuid("template_id").references(() => docmergeTemplates.id, { onDelete: "set null" }),
    /** Versiunea șablonului la momentul generării — actul nu se schimbă când șablonul evoluează. */
    templateVersion: integer("template_version").notNull().default(1),
    /** act_primire_predare | contract_servicii | proces_verbal | act_aditional | … */
    kind: varchar("kind", { length: 50 }).notNull().default("act_primire_predare"),
    /** Rezervat la finalizare (DG-113), nu la ciornă. Null cât timp e ciornă. */
    docNumber: varchar("doc_number", { length: 50 }),
    /** Anul de numerotare — ținut separat ca unicitatea să nu depindă de fusul orar al datei. */
    docYear: integer("doc_year"),
    docDate: timestamp("doc_date", { withTimezone: true }).notNull().defaultNow(),
    title: varchar("title", { length: 300 }).notNull(),
    /** draft | final | cancelled */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    projectId: uuid("project_id").references(() => parProjects.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => parEvents.id, { onDelete: "set null" }),
    /** Organizația „noastră" (partea care emite actul). */
    payerId: uuid("payer_id").references(() => parPayers.id, { onDelete: "set null" }),
    /** vendor | fin_party | inline */
    counterpartyKind: varchar("counterparty_kind", { length: 20 }).notNull().default("vendor"),
    /** Fără FK: sursa diferă după `counterparty_kind`. */
    counterpartyId: uuid("counterparty_id"),
    counterpartyName: varchar("counterparty_name", { length: 300 }),
    /** JSON cu rechizitele înghețate: idno, iban, banca, bic, adresa, administrator, cod TVA. */
    counterpartySnapshot: text("counterparty_snapshot"),
    /** JSON cu valorile completate pentru câmpurile șablonului. */
    context: text("context").notNull().default("{}"),
    /** Corpul randat (HTML), fără `{{...}}` rămase. */
    bodyHtml: text("body_html").notNull().default(""),
    totalCents: integer("total_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    /** SHA-256 peste corp + părți + poziții, calculat la finalizare (DG-114). */
    bodyHash: varchar("body_hash", { length: 64 }),
    /** PDF-ul stocat: actul descărcat peste un an arată identic cu cel semnat (DG-112). */
    pdfUrl: text("pdf_url"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("doc_documents_tenant_idx").on(t.tenantId),
    statusIdx: index("doc_documents_status_idx").on(t.tenantId, t.status),
    projectIdx: index("doc_documents_project_idx").on(t.projectId),
    counterpartyIdx: index("doc_documents_counterparty_idx").on(t.counterpartyId),
    /** Numerele emise nu se pot repeta în același an, pentru același tip de act. */
    numberUniq: uniqueIndex("doc_documents_number_uniq").on(t.tenantId, t.kind, t.docYear, t.docNumber),
  })
);

/** Obiectul actului: ce se predă/primește, cu cantități și preț. */
export const docDocumentLines = pgTable(
  "doc_document_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => docDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(1),
    description: text("description").notNull(),
    unit: varchar("unit", { length: 50 }).notNull().default("buc"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    /** Calculat pe server (qty × preț); niciodată preluat din client. */
    lineTotalCents: integer("line_total_cents").notNull().default(0),
    vatPercent: integer("vat_percent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index("doc_document_lines_document_idx").on(t.documentId),
    tenantIdx: index("doc_document_lines_tenant_idx").on(t.tenantId),
  })
);

/**
 * Legăturile dintre acte și restul lumii: contract → act de primire-predare, act → PAR.
 * De aici iese „traseul actului" (DG-119): contract → act → PAR → plată.
 */
export const docDocumentLinks = pgTable(
  "doc_document_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromDocumentId: uuid("from_document_id")
      .notNull()
      .references(() => docDocuments.id, { onDelete: "cascade" }),
    /** document | par */
    toKind: varchar("to_kind", { length: 20 }).notNull(),
    toDocumentId: uuid("to_document_id").references(() => docDocuments.id, { onDelete: "cascade" }),
    toParId: uuid("to_par_id").references(() => parRequests.id, { onDelete: "cascade" }),
    /** derived_from | payment_request | annex | … */
    relation: varchar("relation", { length: 50 }).notNull().default("derived_from"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index("doc_document_links_from_idx").on(t.fromDocumentId),
    toDocIdx: index("doc_document_links_to_doc_idx").on(t.toDocumentId),
    toParIdx: index("doc_document_links_to_par_idx").on(t.toParId),
    tenantIdx: index("doc_document_links_tenant_idx").on(t.tenantId),
  })
);

/** Numerotarea per tip de act și an (DG-113). Un rând = un contor. */
export const docNumberSequences = pgTable(
  "doc_number_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 50 }).notNull(),
    year: integer("year").notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull().default("ACT"),
    lastNumber: integer("last_number").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqUniq: uniqueIndex("doc_number_sequences_uniq").on(t.tenantId, t.kind, t.year),
  })
);

/** Jurnalul actului: cine, ce, când — în limbaj omenesc la afișare (DG-123). */
export const docAudit = pgTable(
  "doc_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => docDocuments.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** created | updated | finalized | cancelled | downloaded | emailed | converted_to_par */
    action: varchar("action", { length: 50 }).notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index("doc_audit_document_idx").on(t.documentId),
    tenantIdx: index("doc_audit_tenant_idx").on(t.tenantId),
  })
);

export type DocDocument = typeof docDocuments.$inferSelect;
export type NewDocDocument = typeof docDocuments.$inferInsert;
export type DocDocumentLine = typeof docDocumentLines.$inferSelect;
export type NewDocDocumentLine = typeof docDocumentLines.$inferInsert;
export type DocDocumentLink = typeof docDocumentLinks.$inferSelect;
export type DocNumberSequence = typeof docNumberSequences.$inferSelect;
export type DocAuditEntry = typeof docAudit.$inferSelect;
