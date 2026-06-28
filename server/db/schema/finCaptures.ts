/**
 * CAPTURE-001: FinDesk — Capturi OCR AI (fin_captures)
 *
 * Tabelul stochează propunerile AI extrase din bonuri/facturi scanate.
 * Fiecare câmp extras are confidence score [0..1].
 *
 * Regulile FIN-CORE #4 și #5:
 *   - AI PROPUNE, omul CONFIRMĂ (status → confirmed).
 *   - AI nu inventează: dacă nu găsește câmpul → value: null, confidence: 0.
 *
 * Migration: drizzle/0120_fin_captures.sql
 *
 * Design decisions:
 * - extracted_fields JSONB: structură flexibilă cu confidence per câmp, fără
 *   migrări viitoare pentru câmpuri noi.
 * - expense_id NULLABLE FK → fin_expenses.id: null = captură neconfirmată încă.
 *   Se setează când utilizatorul confirmă + se creează cheltuiala.
 * - raw_text TEXT: textul OCR brut pentru debugging și audit.
 * - CapturedField<T> generic: tipizare strictă a câmpurilor extrase.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { finInvoices } from "./finInvoices";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Statusul procesării unui capture. */
export const finCaptureStatusEnum = pgEnum("fin_capture_status", [
  "pending",     // upload primit, procesare nu a început
  "processing",  // AI extrage câmpurile
  "extracted",   // extracție completă, așteaptă confirmare utilizator
  "confirmed",   // utilizatorul a confirmat → fin_expense creat
  "failed",      // eroare la extracție
]);

// ─── TypeScript types ─────────────────────────────────────────────────────────

/**
 * Câmp extras de AI cu grad de încredere.
 * T = tipul valorii (string | number | boolean | null).
 *
 * confidence = 0 → AI n-a găsit câmpul (value: null).
 * confidence < 0.7 → low_confidence: true → UI avertizează utilizatorul.
 */
export interface CapturedField<T = unknown> {
  value: T;
  confidence: number; // [0..1]
  low_confidence?: boolean; // true dacă confidence < 0.7
  /** Invoice Reporting: short RO explanation for the `reportable` verdict. */
  reason?: string;
}

/**
 * Structura completă a câmpurilor extrase din bon/factură.
 * Toate câmpurile sunt NULLABLE — AI poate eșua la oricare.
 */
export interface ExtractedFields {
  vendor_name?: CapturedField<string | null>;
  amount_cents?: CapturedField<number | null>;
  vat_amount_cents?: CapturedField<number | null>;
  vat_deductible?: CapturedField<boolean | null>;
  expense_date?: CapturedField<string | null>; // YYYY-MM-DD
  iban?: CapturedField<string | null>;
  category?: CapturedField<string | null>;
  reference?: CapturedField<string | null>;
  /** Team Docs: short "what was this for" summary the accountant reads at a glance. */
  purpose?: CapturedField<string | null>;
  /**
   * Invoice Reporting: AI verdict whether this item is reportable (VAT/declarations).
   * value: true | false | null (null = unsure). confidence drives the "review" status.
   */
  reportable?: CapturedField<boolean | null>;
  /**
   * Document Classification: AI verdict on WHAT KIND of document this is, BEFORE the
   * financial fields are trusted. Answers "is this even an invoice/receipt?" — so a
   * contract, a random photo, or a menu uploaded by mistake is flagged instead of
   * silently processed as an expense. value ∈ DocumentClass; `reason` is a short RO
   * explanation. This is distinct from `reportable` (which is "should it be reported
   * to the tax authority", a question that only makes sense once it IS an invoice).
   */
  document_class?: CapturedField<DocumentClass | null>;
  [key: string]: CapturedField<unknown> | undefined; // extensibil
}

/**
 * Document Classification: the kind of document the AI thinks was uploaded.
 * - "invoice"     → a tax invoice (factură fiscală, with vendor + VAT).
 * - "receipt"     → a simple receipt/bon (no fiscal code or simplified).
 * - "not_invoice" → not a financial document at all (contract, photo, screenshot…).
 * - null          → AI could not decide.
 */
export type DocumentClass = "invoice" | "receipt" | "not_invoice";

export const DOCUMENT_CLASS_LABELS: Record<DocumentClass, string> = {
  invoice: "Factură",
  receipt: "Bon / chitanță",
  not_invoice: "Nu pare factură",
};

/** Derived classification status used across the API + UI (mirrors ReportableStatus). */
export type DocumentClassStatus = DocumentClass | "review";

export const DOCUMENT_CLASS_STATUS_LABELS: Record<DocumentClassStatus, string> = {
  invoice: "Factură",
  receipt: "Bon / chitanță",
  not_invoice: "Nu pare factură",
  review: "De verificat",
};

/** Derived reportable status used across the API + UI. */
export type ReportableStatus = "yes" | "no" | "review";

export const REPORTABLE_STATUS_LABELS: Record<ReportableStatus, string> = {
  yes: "Pentru raportare",
  no: "Neraportabil",
  review: "De verificat",
};

/**
 * Team Docs: which team uploaded the document, for month-end grouping.
 * Lets non-finance teams (marketing, IT, ops…) drop invoices into one shared inbox.
 */
export const FIN_DOC_TEAMS = [
  "marketing",
  "sales",
  "it",
  "operations",
  "hr",
  "finance",
  "management",
  "other",
] as const;
export type FinDocTeam = (typeof FIN_DOC_TEAMS)[number];

export const FIN_DOC_TEAM_LABELS: Record<FinDocTeam, string> = {
  marketing: "Marketing",
  sales: "Vânzări",
  it: "IT",
  operations: "Operațiuni",
  hr: "HR",
  finance: "Finanțe",
  management: "Management",
  other: "Altele",
};

// ─── fin_captures ─────────────────────────────────────────────────────────────

/**
 * Capturi OCR AI — bonuri și facturi scanate de utilizatori.
 *
 * Flux tipic:
 * 1. POST /api/fin/captures → upload fișier → status: pending → processing
 * 2. AI extrage câmpurile → status: extracted, extracted_fields populat
 * 3. Utilizatorul verifică/corectează câmpurile
 * 4. POST /api/fin/captures/:id/confirm → status: confirmed, expense_id setat
 */
export const finCaptures = pgTable(
  "fin_captures",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține captura. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * FK → fin_expenses.id — NULLABLE.
     * null = captura nu a fost confirmată încă / cheltuiala nu a fost creată.
     * Se setează la /confirm.
     *
     * Notă: FK declarată ca UUID simplu fără Drizzle ref() pentru că
     * fin_expenses poate fi pe o migrare anterioară (SPEND-001 / 0119).
     * La deploy Supabase, FK-ul real este creat în migration SQL.
     */
    expenseId: uuid("expense_id"),

    /** Cheia fișierului în storage (Vercel Blob / S3). */
    fileKey: varchar("file_key", { length: 500 }).notNull(),

    /** Numele original al fișierului (bon.jpg, factură.pdf). */
    fileName: varchar("file_name", { length: 255 }).notNull(),

    /** MIME type: image/jpeg, image/png, application/pdf. */
    mimeType: varchar("mime_type", { length: 100 }).notNull(),

    /** Dimensiunea fișierului în octeți. */
    sizeBytes: integer("size_bytes").notNull(),

    /** Statusul procesării. */
    status: finCaptureStatusEnum("status").notNull().default("pending"),

    /**
     * Team Docs: echipa care a încărcat documentul (marketing, it, operations…).
     * Permite gruparea pe echipe la raportul de sfârșit de lună. Vezi FIN_DOC_TEAMS.
     */
    team: varchar("team", { length: 20 }).notNull().default("other"),

    /**
     * Câmpuri extrase de AI cu confidence score per câmp.
     * Structura: ExtractedFields (vezi mai sus).
     * null = extracția nu a rulat încă sau a eșuat.
     */
    extractedFields: jsonb("extracted_fields").$type<ExtractedFields>(),

    /** Textul OCR brut returnat de AI (pentru debugging și audit). */
    rawText: text("raw_text"),

    // ── Invoice Reporting (INVOICE-REPORTING): AI reportability verdict + human review ──
    /**
     * AI's reportability verdict: "yes" | "no" | "review".
     * "review" = AI unsure (null) or low confidence (<0.7) → needs a human.
     * A human review (PATCH /review) overwrites this with the reviewer's decision.
     */
    reportable: varchar("reportable", { length: 10 }).notNull().default("review"),

    /** AI's one-line RO reason for the verdict (e.g. "Factură cu TVA deductibil"). */
    reportableReason: text("reportable_reason"),

    /** AI confidence in the reportable verdict, in basis points (8500 = 0.85). */
    reportableConfidenceBp: integer("reportable_confidence_bp").notNull().default(0),

    // ── Document Classification (CAPTURE-DOCCLASS): is this even an invoice? ──
    /**
     * AI's document-class verdict: "invoice" | "receipt" | "not_invoice" | "review".
     * "review" = AI unsure (null) or low confidence (<0.7) → a human should look.
     * Lets the team/accountant spot a wrongly-uploaded file (contract, photo) at a
     * glance instead of it being silently treated as an expense. See DocumentClass.
     */
    documentClass: varchar("document_class", { length: 12 }).notNull().default("review"),

    /** AI's one-line RO reason for the document-class verdict. */
    documentClassReason: text("document_class_reason"),

    /** AI confidence in the document-class verdict, in basis points (9000 = 0.90). */
    documentClassConfidenceBp: integer("document_class_confidence_bp").notNull().default(0),

    /** Reviewer who confirmed/overrode the reportable verdict. */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),

    /** When the reviewer decided. */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    /** Optional reviewer note (e.g. why an item was marked not-reportable). */
    reviewNote: text("review_note"),

    /**
     * Invoice Reporting: document kind.
     * "document" = a single invoice/receipt (the original flow, fields on the capture itself).
     * "statement" = a bank statement holding many transactions → AI extracts child rows
     *   into fin_capture_lines, each reviewed individually.
     */
    kind: varchar("kind", { length: 20 }).notNull().default("document"),

    /** Motivul eșecului dacă status = 'failed'. */
    errorMessage: text("error_message"),

    /** Utilizatorul care a confirmat captura (după verificare). */
    confirmedBy: uuid("confirmed_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Timestamp confirmare utilizator. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

    /** Utilizatorul care a creat captura (a făcut upload). */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_captures_tenant_idx").on(t.tenantId),
    index("fin_captures_tenant_status_idx").on(t.tenantId, t.status),
    index("fin_captures_expense_idx").on(t.expenseId),
    index("fin_captures_tenant_team_idx").on(t.tenantId, t.team),
  ]
);

// ─── fin_capture_lines (Invoice Reporting: bank-statement transactions) ─────────

/**
 * One transaction extracted from a bank-statement capture (kind = "statement").
 * The accountant uploads ONE statement PDF/CSV; AI extracts every transaction as a
 * line here, each with its own reportable verdict that the accountant filters/approves.
 */
export const finCaptureLines = pgTable(
  "fin_capture_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Parent statement capture. */
    captureId: uuid("capture_id")
      .notNull()
      .references(() => finCaptures.id, { onDelete: "cascade" }),

    /** Transaction date (YYYY-MM-DD). */
    txDate: varchar("tx_date", { length: 10 }),

    /** Raw transaction description from the statement (e.g. "FACEBK *5KBSL2RWA2"). */
    description: text("description").notNull(),

    /** Vendor/counterparty the AI inferred from the description (e.g. "Meta / Facebook Ads"). */
    counterparty: varchar("counterparty", { length: 300 }),

    /** Amount in the account currency, minor units (cents). Always positive. */
    amountCents: integer("amount_cents").notNull().default(0),

    /** "in" (intrare) or "out" (ieșire). */
    direction: varchar("direction", { length: 4 }).notNull().default("out"),

    /** Account currency (MDL). */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Original transaction amount + currency, if different (e.g. "250.35 EUR"). */
    origAmount: varchar("orig_amount", { length: 40 }),

    /** Reportable verdict for THIS transaction: "yes" | "no" | "review". */
    reportable: varchar("reportable", { length: 10 }).notNull().default("review"),

    /** AI's reason for the verdict. */
    reportableReason: text("reportable_reason"),

    /** AI confidence in basis points. */
    reportableConfidenceBp: integer("reportable_confidence_bp").notNull().default(0),

    // ─── Invoice ↔ transaction matching (Invoice Reporting) ──────────────────
    /** Has an invoice for this transaction been found? "matched" | "missing" | "review" (not run). */
    matchStatus: varchar("match_status", { length: 10 }).notNull().default("review"),

    /** The single-document capture (invoice/receipt) this line was matched to, if any. */
    matchedCaptureId: uuid("matched_capture_id").references(() => finCaptures.id, {
      onDelete: "set null",
    }),

    /** Matcher confidence in basis points (0..10000). 10000 = manual link. */
    matchScoreBp: integer("match_score_bp").notNull().default(0),

    /** STMT-003: fin_invoice created when submitting this line to e-Factura SFS. */
    linkedFinInvoiceId: uuid("linked_fin_invoice_id").references(() => finInvoices.id, {
      onDelete: "set null",
    }),

    /** Reviewer who confirmed/overrode this line. */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_capture_lines_capture_idx").on(t.captureId),
    index("fin_capture_lines_tenant_idx").on(t.tenantId),
    index("fin_capture_lines_tenant_reportable_idx").on(t.tenantId, t.reportable),
    index("fin_capture_lines_tenant_match_idx").on(t.tenantId, t.matchStatus),
  ]
);

// ─── Inference types ──────────────────────────────────────────────────────────

export type FinCapture = typeof finCaptures.$inferSelect;
export type InsertFinCapture = typeof finCaptures.$inferInsert;
export type FinCaptureStatus = typeof finCaptureStatusEnum.enumValues[number];
export type FinCaptureLine = typeof finCaptureLines.$inferSelect;
export type InsertFinCaptureLine = typeof finCaptureLines.$inferInsert;

// ─── Status labels (Romanian) ─────────────────────────────────────────────────

export const FIN_CAPTURE_STATUS_LABELS: Record<FinCaptureStatus, string> = {
  pending: "În așteptare",
  processing: "Se procesează",
  extracted: "Extras — verificați câmpurile",
  confirmed: "Confirmat",
  failed: "Eroare extracție",
};
