/**
 * CAPTURE-002/003: FinDesk — Capturi OCR AI (fin_captures)
 *
 * Mounted at /api/fin (shared cu finExpenses).
 *
 * Routes (specifice ÎNAINTE de /:id — regula hono-specific-route-before-param):
 *   GET    /api/fin/captures              — lista capturi paginate (CAPTURE-003)
 *   POST   /api/fin/captures              — upload + creare capture (multipart)
 *   GET    /api/fin/captures/:id          — detaliu capture cu extracted_fields
 *   POST   /api/fin/captures/:id/confirm  — confirmă + creează fin_expense (mai specific → montat înainte de /:id)
 *
 * Regulile FIN-CORE #4 și #5:
 *   - AI propune câmpuri cu confidence score.
 *   - Omul confirmă (sau corectează) la /confirm.
 *   - AI nu inventează: câmpuri negăsite → null, confidence: 0.
 *
 * Tenant safety: TOATE rutele filtrează strict după user.tenantId.
 * Niciun cross-tenant leak — capture din alt tenant → 404 (nu 403, nu date).
 *
 * Mock mode: dacă AI_API_KEY lipsește, callAi returnează stub JSON.
 * Extracția funcționează complet fără API key (demo/test safe).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, desc, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { finCaptures, finCaptureLines, type ExtractedFields, FIN_DOC_TEAMS } from "../db/schema/finCaptures";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { extractCaptureFields } from "../lib/ai/captureExtractor";
import { extractStatementTransactions } from "../lib/ai/statementExtractor";
import {
  assignInvoicesToLines,
  type LineCandidate,
  type InvoiceForMatch,
} from "../lib/fin/invoiceLineMatch";
import { extractPdfText } from "../lib/ai/pdfText";
import { sanitizePgText } from "../lib/fin/money";
import {
  signCaptureUploads,
  downloadCapture,
  isStorageConfigured,
} from "../lib/storage/captureStorage";

export const finCapturesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finCapturesRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

/** Schema pentru confirmarea câmpurilor de către utilizator. */
const confirmCaptureSchema = z.object({
  /** Câmpurile editate de utilizator (pot diferi de cele extrase de AI). */
  fields: z.object({
    vendor_name: z.string().max(200).optional(),
    amount_cents: z.number().int().positive(),
    vat_amount_cents: z.number().int().min(0).optional().default(0),
    /** OBLIGATORIU — FIN-CORE regula #1. */
    vat_deductible: z.boolean({
      required_error: "vat_deductible_required",
      invalid_type_error: "vat_deductible must be boolean",
    }),
    expense_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD required"),
    category: z
      .enum([
        "rent",
        "utilities",
        "salaries",
        "marketing",
        "supplies",
        "software",
        "maintenance",
        "other",
      ])
      .optional()
      .default("other"),
    reference: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
  }),
});

// Invoice Reporting: reviewer's reportable decision (yes/no) + optional note.
const reviewCaptureSchema = z.object({
  decision: z.enum(["yes", "no"]),
  note: z.string().max(1000).optional(),
});

// Invoice ↔ transaction matching: manually link a line to an invoice, or clear the link.
// `captureId: null` marks the line "missing" (no invoice in the system).
const matchLineSchema = z.object({
  captureId: z.string().uuid().nullable(),
});

// ─── Serialize helper ─────────────────────────────────────────────────────────

function serializeCapture(c: typeof finCaptures.$inferSelect) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    expenseId: c.expenseId,
    fileKey: c.fileKey,
    fileName: c.fileName,
    mimeType: c.mimeType,
    sizeBytes: c.sizeBytes,
    status: c.status,
    team: c.team,
    kind: c.kind,
    extractedFields: c.extractedFields,
    rawText: c.rawText,
    errorMessage: c.errorMessage,
    // Invoice Reporting verdict + review
    reportable: c.reportable,
    reportableReason: c.reportableReason,
    reportableConfidenceBp: c.reportableConfidenceBp,
    // Document Classification verdict
    documentClass: c.documentClass,
    documentClassReason: c.documentClassReason,
    documentClassConfidenceBp: c.documentClassConfidenceBp,
    reviewedBy: c.reviewedBy,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    reviewNote: c.reviewNote,
    confirmedBy: c.confirmedBy,
    confirmedAt: c.confirmedAt?.toISOString() ?? null,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ─── GET /api/fin/captures — lista capturi (CAPTURE-003) ─────────────────────

finCapturesRoutes.get("/captures", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  // Team Docs filters: ?team=marketing & ?month=YYYY-MM (by upload date).
  const team = c.req.query("team");
  const month = c.req.query("month"); // YYYY-MM

  const conditions = [eq(finCaptures.tenantId, user.tenantId)];
  if (team && FIN_DOC_TEAMS.includes(team as never)) {
    conditions.push(eq(finCaptures.team, team));
  }
  // Invoice Reporting: filter by reportable status (yes | no | review).
  const reportable = c.req.query("reportable");
  if (reportable && ["yes", "no", "review"].includes(reportable)) {
    conditions.push(eq(finCaptures.reportable, reportable));
  }
  // Document Classification: filter by document class (invoice | receipt | not_invoice | review).
  const documentClass = c.req.query("documentClass");
  if (documentClass && ["invoice", "receipt", "not_invoice", "review"].includes(documentClass)) {
    conditions.push(eq(finCaptures.documentClass, documentClass));
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    conditions.push(gte(finCaptures.createdAt, start));
    conditions.push(lte(finCaptures.createdAt, end));
  }

  const rows = await db.query.finCaptures.findMany({
    where: and(...conditions),
    orderBy: [desc(finCaptures.createdAt)],
    limit,
    offset,
  });

  return c.json({ captures: rows.map(serializeCapture), total: rows.length });
});

// ─── GET /api/fin/captures/summary — raport sfârșit de lună (Team Docs) ───────
// Grupează documentele lunii pe echipă și pe categorie, cu total pe fiecare.
// Montat ÎNAINTE de /:id (regula hono: rută specifică > param).
// Query: ?month=YYYY-MM (implicit luna curentă).
finCapturesRoutes.get("/captures/summary", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month") ?? new Date().toISOString().slice(0, 7); // YYYY-MM
  const valid = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);

  const start = new Date(`${valid}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const rows = await db.query.finCaptures.findMany({
    where: and(
      eq(finCaptures.tenantId, user.tenantId),
      gte(finCaptures.createdAt, start),
      lte(finCaptures.createdAt, end),
    ),
    orderBy: [desc(finCaptures.createdAt)],
  });

  const amountOf = (r: typeof finCaptures.$inferSelect): number => {
    const v = r.extractedFields?.amount_cents?.value;
    return typeof v === "number" ? v : 0;
  };

  const byTeam: Record<string, { count: number; totalCents: number }> = {};
  const byCategory: Record<string, { count: number; totalCents: number }> = {};
  let totalCents = 0;
  let pendingReview = 0;
  // Invoice Reporting: how many items are reportable / not / awaiting review.
  const reportableCounts = { yes: 0, no: 0, review: 0 };

  for (const r of rows) {
    const amt = amountOf(r);
    totalCents += amt;
    if (r.status !== "confirmed") pendingReview += 1;
    const rep = (r.reportable ?? "review") as "yes" | "no" | "review";
    if (rep in reportableCounts) reportableCounts[rep] += 1;

    byTeam[r.team] ??= { count: 0, totalCents: 0 };
    byTeam[r.team].count += 1;
    byTeam[r.team].totalCents += amt;

    const cat = (r.extractedFields?.category?.value as string | null) ?? "other";
    byCategory[cat] ??= { count: 0, totalCents: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].totalCents += amt;
  }

  return c.json({
    month: valid,
    totalDocuments: rows.length,
    totalCents,
    pendingReview,
    reportableCounts,
    byTeam: Object.entries(byTeam).map(([team, v]) => ({ team, ...v })),
    byCategory: Object.entries(byCategory).map(([category, v]) => ({ category, ...v })),
  });
});

// ─── PATCH /api/fin/captures/:id/review — reviewer approves/overrides reportable ──
// Mounted before GET /:id (specific route > param). The reviewer's decision is final
// and recorded (reviewedBy/At). decision: "yes" | "no"; optional note.
finCapturesRoutes.patch(
  "/captures/:id/review",
  zValidator("json", reviewCaptureSchema),
  async (c) => {
    const user = c.get("user");
    const captureId = c.req.param("id");
    const { decision, note } = c.req.valid("json");

    const capture = await db.query.finCaptures.findFirst({
      where: and(eq(finCaptures.id, captureId), eq(finCaptures.tenantId, user.tenantId)),
    });
    if (!capture) {
      return c.json({ error: "not_found", message: "Captura nu există." }, 404);
    }

    const [updated] = await db
      .update(finCaptures)
      .set({
        reportable: decision,
        reviewNote: note ?? null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(finCaptures.id, captureId))
      .returning();

    return c.json({ capture: serializeCapture(updated) });
  },
);

// ─── Invoice Reporting: bank-statement child lines ──────────────────────────────

function serializeLine(l: typeof finCaptureLines.$inferSelect) {
  return {
    id: l.id,
    captureId: l.captureId,
    txDate: l.txDate,
    description: l.description,
    counterparty: l.counterparty,
    amountCents: l.amountCents,
    direction: l.direction,
    currency: l.currency,
    origAmount: l.origAmount,
    reportable: l.reportable,
    reportableReason: l.reportableReason,
    reportableConfidenceBp: l.reportableConfidenceBp,
    // Invoice ↔ transaction matching
    matchStatus: l.matchStatus,
    matchedCaptureId: l.matchedCaptureId,
    matchScoreBp: l.matchScoreBp,
    reviewedBy: l.reviewedBy,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    reviewNote: l.reviewNote,
    createdAt: l.createdAt.toISOString(),
  };
}

// GET /api/fin/captures/:id/lines — transactions extracted from a statement.
// Optional ?reportable=yes|no|review filter. Mounted before GET /:id (specific > param).
finCapturesRoutes.get("/captures/:id/lines", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("id");
  const reportable = c.req.query("reportable");

  const conds = [
    eq(finCaptureLines.captureId, captureId),
    eq(finCaptureLines.tenantId, user.tenantId),
  ];
  if (reportable && ["yes", "no", "review"].includes(reportable)) {
    conds.push(eq(finCaptureLines.reportable, reportable));
  }
  const lines = await db.query.finCaptureLines.findMany({
    where: and(...conds),
    orderBy: [asc(finCaptureLines.txDate)],
  });
  return c.json({ lines: lines.map(serializeLine), total: lines.length });
});

// PATCH /api/fin/captures/lines/:lineId/review — approve/reject a single transaction.
finCapturesRoutes.patch(
  "/captures/lines/:lineId/review",
  zValidator("json", reviewCaptureSchema),
  async (c) => {
    const user = c.get("user");
    const lineId = c.req.param("lineId");
    const { decision, note } = c.req.valid("json");

    const line = await db.query.finCaptureLines.findFirst({
      where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
    });
    if (!line) return c.json({ error: "not_found", message: "Linia nu există." }, 404);

    const [updated] = await db
      .update(finCaptureLines)
      .set({
        reportable: decision,
        reviewNote: note ?? null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(finCaptureLines.id, lineId))
      .returning();

    return c.json({ line: serializeLine(updated) });
  },
);

// ─── Invoice ↔ transaction matching ─────────────────────────────────────────────
// The accountant uploads bank-statement(s) AND the invoices/payment-confirmations into the
// same Invoice Reporting inbox. "Match" answers, per outgoing transaction, "is there an
// invoice for this in the system?" so they don't reconcile each one by hand.

/** Build the InvoiceForMatch shape from a single-document capture's extracted fields. */
function invoiceForMatch(cap: typeof finCaptures.$inferSelect): InvoiceForMatch {
  const f = cap.extractedFields;
  const amountCents = (f?.amount_cents?.value as number | null) ?? null;
  const reference = (f?.reference?.value as string | null) ?? "";
  // Haystack for reference/transaction-id matching: the filename (e.g. a MAIB confirmation named
  // "…Transaction #2472…"), the extracted reference, and the document text all carry the card
  // ref / transaction id that also appears in the statement line. Bounded to keep it cheap.
  const haystack = `${cap.fileName} ${reference} ${(cap.rawText ?? "").slice(0, 4000)}`;
  return {
    vendorName: (f?.vendor_name?.value as string | null) ?? null,
    // Amount is matched currency-agnostically (against the line's foreign OR MDL amount), so we
    // pass the major-unit figure the AI read off the document regardless of its currency.
    amountMajor: amountCents != null ? amountCents / 100 : null,
    currency: "MDL",
    date: (f?.expense_date?.value as string | null) ?? null,
    haystack,
  };
}

// POST /api/fin/captures/match — run matching across all statement transaction lines.
// Optional ?month=YYYY-MM scopes both the lines and the invoice pool to that month.
// Only OUTGOING ("out") lines need an invoice; incoming/transfers are left as "review".
// Mounted before GET /:id (specific route > param).
finCapturesRoutes.post("/captures/match", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month");
  const monthOk = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  // Optional: scope the match to ONE statement's transactions. The Invoice Reporting page
  // passes its own statement id so the result (and the "X of N" toast) reflects the 38 lines
  // the user is looking at, not every outgoing line the tenant ever uploaded.
  const statementId = c.req.query("captureId") ?? null;

  let start: Date | null = null;
  let end: Date | null = null;
  if (monthOk) {
    start = new Date(`${monthOk}-01T00:00:00.000Z`);
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  // Candidate invoices: confirmed/extracted single-document captures (not statements) for the tenant.
  const invoiceConds = [
    eq(finCaptures.tenantId, user.tenantId),
    eq(finCaptures.kind, "document"),
  ];
  if (start && end) {
    invoiceConds.push(gte(finCaptures.createdAt, start));
    invoiceConds.push(lte(finCaptures.createdAt, end));
  }
  const invoices = await db.query.finCaptures.findMany({ where: and(...invoiceConds) });

  // Transaction lines (outgoing only) for the tenant, optionally scoped to one statement or month.
  const lineConds = [
    eq(finCaptureLines.tenantId, user.tenantId),
    eq(finCaptureLines.direction, "out"),
  ];
  // Scope to a single statement when captureId is given (the Invoice Reporting page does this).
  if (statementId) lineConds.push(eq(finCaptureLines.captureId, statementId));
  const lines = await db.query.finCaptureLines.findMany({ where: and(...lineConds) });

  // Optionally scope lines to the month by looking at their parent statement's createdAt.
  let scopedLines = lines;
  if (!statementId && start && end) {
    const monthCaptureIds = new Set(
      (await db.query.finCaptures.findMany({
        where: and(
          eq(finCaptures.tenantId, user.tenantId),
          eq(finCaptures.kind, "statement"),
          gte(finCaptures.createdAt, start),
          lte(finCaptures.createdAt, end),
        ),
      })).map((s) => s.id),
    );
    scopedLines = lines.filter((l) => monthCaptureIds.has(l.captureId));
  }

  // Manually-linked lines (score 10000) are honored as-is and excluded from auto-assignment; the
  // invoice they hold is also removed from the pool so it can't be reused on another line.
  const manualInvoiceIds = new Set(
    scopedLines.filter((l) => l.matchScoreBp === 10000 && l.matchedCaptureId).map((l) => l.matchedCaptureId as string),
  );
  const autoLines = scopedLines.filter((l) => !(l.matchScoreBp === 10000 && l.matchedCaptureId));
  const candidates: LineCandidate[] = autoLines.map((l) => ({
    id: l.id,
    origAmount: l.origAmount,
    amountCents: l.amountCents,
    counterparty: l.counterparty,
    description: l.description,
    txDate: l.txDate,
  }));

  // Global best-first 1:1 assignment: each invoice lands on its closest free transaction, and a
  // line taken by a stronger pair pushes the loser to its next-best line → maximises mapping.
  const assignment = assignInvoicesToLines(
    invoices.filter((inv) => !manualInvoiceIds.has(inv.id)).map((inv) => ({ invoice: inv, fields: invoiceForMatch(inv) })),
    candidates,
  );

  let matched = scopedLines.length - autoLines.length; // manual links already count as matched
  let missing = 0;
  for (const l of autoLines) {
    const hit = assignment.get(l.id);
    if (hit) {
      matched += 1;
      await db
        .update(finCaptureLines)
        .set({
          matchStatus: "matched",
          matchedCaptureId: hit.invoiceId,
          matchScoreBp: Math.round(hit.confidence * 10000),
          updatedAt: new Date(),
        })
        .where(eq(finCaptureLines.id, l.id));
    } else {
      missing += 1;
      await db
        .update(finCaptureLines)
        .set({
          matchStatus: "missing",
          matchedCaptureId: null,
          matchScoreBp: 0,
          updatedAt: new Date(),
        })
        .where(eq(finCaptureLines.id, l.id));
    }
  }

  return c.json({
    month: monthOk,
    totalLines: scopedLines.length,
    matchedCount: matched,
    missingCount: missing,
    invoicePool: invoices.length,
  });
});

// PATCH /api/fin/captures/lines/:lineId/match — manually link a line to an invoice (override),
// or pass captureId: null to mark it "missing" (no invoice). A manual link gets score 10000 so
// a later auto-match run won't overwrite it. Mounted before GET /:id.
finCapturesRoutes.patch(
  "/captures/lines/:lineId/match",
  zValidator("json", matchLineSchema),
  async (c) => {
    const user = c.get("user");
    const lineId = c.req.param("lineId");
    const { captureId } = c.req.valid("json");

    const line = await db.query.finCaptureLines.findFirst({
      where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
    });
    if (!line) return c.json({ error: "not_found", message: "Linia nu există." }, 404);

    // If linking, verify the target invoice belongs to the same tenant (no cross-tenant link).
    if (captureId) {
      const inv = await db.query.finCaptures.findFirst({
        where: and(eq(finCaptures.id, captureId), eq(finCaptures.tenantId, user.tenantId)),
      });
      if (!inv) return c.json({ error: "invoice_not_found", message: "Factura nu există." }, 404);
    }

    const [updated] = await db
      .update(finCaptureLines)
      .set({
        matchStatus: captureId ? "matched" : "missing",
        matchedCaptureId: captureId,
        matchScoreBp: captureId ? 10000 : 0,
        updatedAt: new Date(),
      })
      .where(eq(finCaptureLines.id, lineId))
      .returning();

    return c.json({ line: serializeLine(updated) });
  },
);

// ─── Upload helpers (shared by single POST /captures + batch POST /captures/batch) ──

interface CaptureInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileKey: string;
  rawText: string;
  imageDataUrl?: string;
  kind: string;
  forceKind: boolean;
  team: string;
}

/** Derive a capture's content from one uploaded File: filename/mime/size/key + extracted text
 *  (PDF text layer, image data-URL for vision, or CSV text). Never throws on a malformed file. */
async function deriveFileInput(file: File, tenantId: string, pastedRawText: string) {
  const fileName = file.name;
  const mimeType = file.type || "application/octet-stream";
  const sizeBytes = file.size;
  const fileKey = `captures/${tenantId}/${Date.now()}-${fileName}`;
  let rawText = pastedRawText;
  let imageDataUrl: string | undefined;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
  const isCsvLike = /csv|text\/plain/i.test(mimeType) || /\.(csv|mt940|sta|txt)$/i.test(fileName);
  try {
    if (mimeType.startsWith("image/") && sizeBytes <= 8_000_000) {
      const buf = Buffer.from(await file.arrayBuffer());
      imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
    } else if (isPdf && !rawText.trim() && sizeBytes <= 8_000_000) {
      const buf = Buffer.from(await file.arrayBuffer());
      rawText = await extractPdfText(buf);
    } else if (isCsvLike && !rawText.trim() && sizeBytes <= 8_000_000) {
      rawText = await file.text();
    }
  } catch {
    rawText = rawText || ""; // unreadable file → no text, don't crash the upload
  }
  return { fileName, mimeType, sizeBytes, fileKey, rawText, imageDataUrl };
}

/** Same as deriveFileInput but from raw bytes (the direct-to-storage finalize path: the browser
 *  uploaded the binary to Supabase Storage, the server downloaded it here). Never throws. */
async function deriveBufferInput(buf: Buffer, fileName: string, mimeType: string, fileKey: string) {
  const sizeBytes = buf.length;
  let rawText = "";
  let imageDataUrl: string | undefined;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
  const isCsvLike = /csv|text\/plain/i.test(mimeType) || /\.(csv|mt940|sta|txt)$/i.test(fileName);
  try {
    if (mimeType.startsWith("image/") && sizeBytes <= 8_000_000) {
      imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
    } else if (isPdf && sizeBytes <= 12_000_000) {
      rawText = await extractPdfText(buf);
    } else if (isCsvLike && sizeBytes <= 12_000_000) {
      rawText = buf.toString("utf8");
    }
  } catch {
    rawText = "";
  }
  return { fileName, mimeType, sizeBytes, fileKey, rawText, imageDataUrl };
}

/** Create a capture row and run extraction (statement → transaction lines, document → AI fields).
 *  Returns the serialized capture (+ lineCount for statements). Shared source of truth. */
async function buildCapture(
  user: { id: string; tenantId: string },
  input: CaptureInput,
): Promise<{ capture: ReturnType<typeof serializeCapture>; lineCount: number }> {
  let kind = input.kind;
  const rawText = sanitizePgText(input.rawText);
  // Auto-detect a statement unless the caller forced the kind (bulk-invoice upload says "invoice").
  if (kind !== "statement" && !input.forceKind) {
    const dateLinePairs = (rawText.match(/\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}/g) ?? []).length;
    if (/extras de cont/i.test(rawText) || dateLinePairs >= 3) kind = "statement";
  }

  const [capture] = await db
    .insert(finCaptures)
    .values({
      tenantId: user.tenantId,
      fileKey: input.fileKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "processing",
      team: input.team,
      kind,
      rawText: rawText || undefined,
      createdBy: user.id,
    })
    .returning();

  if (kind === "statement") {
    let lineStatus: "extracted" | "failed" = "extracted";
    let stmtError: string | undefined;
    let inserted = 0;
    try {
      const { transactions } = await extractStatementTransactions(
        rawText || `[Fișier: ${input.fileName}]`,
        user.tenantId,
        user.id,
        capture.id,
      );
      if (transactions.length > 0) {
        await db.insert(finCaptureLines).values(
          transactions.map((t) => ({
            tenantId: user.tenantId,
            captureId: capture.id,
            txDate: t.tx_date,
            description: t.description,
            counterparty: t.counterparty,
            amountCents: t.amount_cents,
            direction: t.direction,
            currency: t.currency,
            origAmount: t.orig_amount,
            reportable: t.reportable,
            reportableReason: t.reportable_reason,
            reportableConfidenceBp: Math.round(t.reportable_confidence * 10000),
          })),
        );
        inserted = transactions.length;
      }
    } catch (err) {
      lineStatus = "failed";
      stmtError = err instanceof Error ? err.message : "Eroare la extracția extrasului";
    }
    const [updatedStmt] = await db
      .update(finCaptures)
      .set({ status: lineStatus, errorMessage: stmtError ?? null, updatedAt: new Date() })
      .where(eq(finCaptures.id, capture.id))
      .returning();
    return { capture: serializeCapture(updatedStmt), lineCount: inserted };
  }

  let extractedFields: ExtractedFields | undefined;
  let newStatus: "extracted" | "failed" = "extracted";
  let errorMessage: string | undefined;
  try {
    const result = await extractCaptureFields(
      rawText || `[Fișier: ${input.fileName}]`,
      user.tenantId,
      user.id,
      capture.id,
      input.imageDataUrl,
    );
    extractedFields = result.extractedFields;
  } catch (err) {
    newStatus = "failed";
    errorMessage = err instanceof Error ? err.message : "Eroare necunoscută la extracție AI";
  }

  const repField = extractedFields?.reportable;
  const repConf = repField?.confidence ?? 0;
  const reportable =
    repField?.value === true && repConf >= 0.7
      ? "yes"
      : repField?.value === false && repConf >= 0.7
        ? "no"
        : "review";
  const dcField = extractedFields?.document_class;
  const dcConf = dcField?.confidence ?? 0;
  const documentClass = dcField?.value && dcConf >= 0.7 ? dcField.value : "review";

  const [updated] = await db
    .update(finCaptures)
    .set({
      status: newStatus,
      extractedFields: extractedFields ?? null,
      errorMessage: errorMessage ?? null,
      reportable,
      reportableReason: repField?.reason ?? null,
      reportableConfidenceBp: Math.round(repConf * 10000),
      documentClass,
      documentClassReason: dcField?.reason ?? null,
      documentClassConfidenceBp: Math.round(dcConf * 10000),
      updatedAt: new Date(),
    })
    .where(eq(finCaptures.id, capture.id))
    .returning();
  return { capture: serializeCapture(updated), lineCount: 0 };
}

// ─── POST /api/fin/captures — upload + extracție AI ──────────────────────────

/**
 * Upload fișier bon/factură + declanșează extracția AI.
 *
 * Procesare:
 * 1. Crează rând fin_captures cu status 'processing'
 * 2. Extrage câmpuri cu AI (sau stub dacă AI_API_KEY lipsește)
 * 3. Actualizează rândul cu extracted_fields + status 'extracted'
 *
 * Content-Type: multipart/form-data (sau JSON cu rawText pentru testing)
 * Accept: application/json
 */

finCapturesRoutes.post("/captures", async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";

  // JSON mode (tests / API clients): no file, content comes as fields.
  if (contentType.includes("application/json")) {
    const body = await c.req.json<{
      fileKey?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
      rawText?: string; team?: string; kind?: string; forceKind?: boolean;
    }>();
    const team = body.team && FIN_DOC_TEAMS.includes(body.team as never) ? body.team : "other";
    const { capture, lineCount } = await buildCapture(user, {
      fileKey: body.fileKey ?? "upload/unknown",
      fileName: body.fileName ?? "document.pdf",
      mimeType: body.mimeType ?? "application/pdf",
      sizeBytes: body.sizeBytes ?? 0,
      rawText: body.rawText ?? "",
      kind: body.kind === "statement" ? "statement" : "document",
      forceKind: body.forceKind === true,
      team,
    });
    return c.json({ capture, lineCount }, 201);
  }

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "unsupported_content_type" }, 415);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return c.json({ error: "file_required" }, 400);
  const pasted = (formData.get("rawText") as string | null) ?? "";
  const teamField = formData.get("team") as string | null;
  const team = teamField && FIN_DOC_TEAMS.includes(teamField as never) ? teamField : "other";
  const kindField = formData.get("kind") as string | null;
  const kind = kindField === "statement" ? "statement" : "document";
  const forceKind = formData.get("forceKind") === "1";

  const derived = await deriveFileInput(file, user.tenantId, pasted);
  const { capture, lineCount } = await buildCapture(user, { ...derived, kind, forceKind, team });
  return c.json({ capture, lineCount }, 201);
});

// ─── POST /api/fin/captures/batch — upload MAI MULTE fișiere într-o cerere ───
// The bulk-invoice dropzone sends files in batches so 50 uploads become a few requests,
// staying under Vercel's per-IP firewall rate-limit (which 403'd individual rapid uploads).
finCapturesRoutes.post("/captures/batch", async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "unsupported_content_type" }, 415);
  }
  const formData = await c.req.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return c.json({ error: "file_required" }, 400);

  const teamField = formData.get("team") as string | null;
  const team = teamField && FIN_DOC_TEAMS.includes(teamField as never) ? teamField : "other";
  const kindField = formData.get("kind") as string | null;
  const kind = kindField === "statement" ? "statement" : "document";
  const forceKind = formData.get("forceKind") === "1";

  // Process sequentially within the one request (bounded by the caller's batch size).
  const results: Array<{ ok: true; capture: ReturnType<typeof serializeCapture>; lineCount: number } | { ok: false; fileName: string; error: string }> = [];
  for (const file of files) {
    try {
      const derived = await deriveFileInput(file, user.tenantId, "");
      const { capture, lineCount } = await buildCapture(user, { ...derived, kind, forceKind, team });
      results.push({ ok: true, capture, lineCount });
    } catch (err) {
      results.push({ ok: false, fileName: file.name, error: err instanceof Error ? err.message : "upload_failed" });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  return c.json({ results, count: results.length, okCount }, 201);
});

// ─── Direct-to-storage upload (the robust path for big/real receipts) ────────
// The binary goes browser → Supabase Storage (NOT through this function), dodging Vercel's
// ~4.5MB body limit and edge protections that 4xx'd large multipart uploads. Only tiny JSON
// requests hit us: (1) sign-uploads → signed URLs, (2) finalize → download+extract+create.

const signUploadsSchema = z.object({
  files: z.array(z.object({ fileName: z.string().min(1).max(300) })).min(1).max(50),
});

finCapturesRoutes.post("/captures/sign-uploads", zValidator("json", signUploadsSchema), async (c) => {
  const user = c.get("user");
  if (!isStorageConfigured()) return c.json({ error: "storage_not_configured" }, 503);
  const { files } = c.req.valid("json");
  try {
    const uploads = await signCaptureUploads(user.tenantId, files);
    return c.json({ uploads });
  } catch (e) {
    return c.json({ error: "sign_failed", message: e instanceof Error ? e.message : "sign_failed" }, 500);
  }
});

const finalizeSchema = z.object({
  team: z.string().optional(),
  kind: z.enum(["document", "statement"]).optional(),
  forceKind: z.boolean().optional(),
  items: z
    .array(z.object({ path: z.string().min(1), fileName: z.string().min(1), mimeType: z.string().optional() }))
    .min(1)
    .max(10), // small batches: each item downloads + AI-extracts server-side
});

finCapturesRoutes.post("/captures/finalize", zValidator("json", finalizeSchema), async (c) => {
  const user = c.get("user");
  if (!isStorageConfigured()) return c.json({ error: "storage_not_configured" }, 503);
  const { items, team: teamRaw, kind: kindRaw, forceKind } = c.req.valid("json");
  const team = teamRaw && FIN_DOC_TEAMS.includes(teamRaw as never) ? teamRaw : "other";
  const kind = kindRaw === "statement" ? "statement" : "document";

  const results: Array<
    | { ok: true; capture: ReturnType<typeof serializeCapture>; lineCount: number }
    | { ok: false; fileName: string; error: string }
  > = [];
  for (const item of items) {
    // Tenant safety: the path must live under the tenant's folder (signed URLs are issued that way).
    if (!item.path.startsWith(`${user.tenantId}/`)) {
      results.push({ ok: false, fileName: item.fileName, error: "forbidden_path" });
      continue;
    }
    try {
      const buf = await downloadCapture(item.path);
      const mimeType = item.mimeType || (/\.pdf$/i.test(item.fileName) ? "application/pdf" : "application/octet-stream");
      const derived = await deriveBufferInput(buf, item.fileName, mimeType, item.path);
      const { capture, lineCount } = await buildCapture(user, { ...derived, kind, forceKind: forceKind ?? false, team });
      results.push({ ok: true, capture, lineCount });
    } catch (e) {
      results.push({ ok: false, fileName: item.fileName, error: e instanceof Error ? e.message : "finalize_failed" });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  return c.json({ results, count: results.length, okCount }, 201);
});

// ─── POST /api/fin/captures/:id/confirm — confirmă + creează cheltuiala ──────
// NOTĂ: Montat ÎNAINTE de GET /:id (ruta mai specifică = /confirm > /:id param)

finCapturesRoutes.post(
  "/captures/:id/confirm",
  zValidator("json", confirmCaptureSchema),
  async (c) => {
    const user = c.get("user");
    const captureId = c.req.param("id");
    const { fields } = c.req.valid("json");

    // Verifică că captura aparține tenant-ului curent (tenant safety → 404)
    const capture = await db.query.finCaptures.findFirst({
      where: and(
        eq(finCaptures.id, captureId),
        eq(finCaptures.tenantId, user.tenantId)
      ),
    });

    if (!capture) {
      return c.json({ error: "not_found" }, 404);
    }

    if (capture.status !== "extracted") {
      return c.json(
        { error: "invalid_status", message: "Captura trebuie să fie în status 'extracted' pentru confirmare." },
        422
      );
    }

    // Creăm fin_expense DACĂ tabelul există (SPEND-001 poate fi pe altă migrare)
    // Folosim INSERT dinamic pentru compatibilitate cu ambele branch-uri
    let expenseId: string | null = null;

    try {
      // Attempt to insert into fin_expenses (may not exist on this branch yet)
      const result = await db.execute(
        `INSERT INTO fin_expenses (
          tenant_id, category, amount_cents, currency, vat_deductible,
          vat_amount_cents, source, status, description, vendor_name,
          expense_date, reference, created_by
        ) VALUES (
          $1, $2, $3, 'MDL', $4, $5, 'capture', 'draft', $6, $7, $8, $9, $10
        ) RETURNING id` as unknown as TemplateStringsArray,
        [
          user.tenantId,
          fields.category,
          fields.amount_cents,
          fields.vat_deductible,
          fields.vat_amount_cents,
          fields.description ?? null,
          fields.vendor_name ?? null,
          fields.expense_date,
          fields.reference ?? null,
          user.id,
        ]
      );

      // DB portability: handle both PGlite (.rows[]) and Postgres (array)
      const rows = Array.isArray(result) ? result : (result as { rows: Array<{ id: string }> }).rows;
      if (rows.length > 0) {
        expenseId = (rows[0] as { id: string }).id;
      }
    } catch {
      // fin_expenses table doesn't exist (SPEND not merged) — confirm without expense
      // The capture is still marked confirmed for audit purposes
    }

    // Actualizează captura ca confirmată
    const [confirmed] = await db
      .update(finCaptures)
      .set({
        status: "confirmed",
        expenseId: expenseId ?? undefined,
        confirmedBy: user.id,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(finCaptures.id, captureId))
      .returning();

    return c.json({
      capture: serializeCapture(confirmed),
      expenseId,
      message: expenseId
        ? "Captură confirmată. Cheltuiala a fost creată în draft."
        : "Captură confirmată. Cheltuiala va fi creată când modulul SPEND este activ.",
    });
  }
);

// ─── GET /api/fin/captures/:id — detaliu capture ─────────────────────────────

finCapturesRoutes.get("/captures/:id", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("id");

  const capture = await db.query.finCaptures.findFirst({
    where: and(
      eq(finCaptures.id, captureId),
      eq(finCaptures.tenantId, user.tenantId)
    ),
  });

  if (!capture) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ capture: serializeCapture(capture) });
});

// ─── DELETE /api/fin/captures/:id — șterge o captură (curățare duplicate) ─────
// Statement → also deletes its transaction lines. Invoice (document) → unlinks any statement
// lines that pointed to it (so no dangling match). Tenant-scoped.
finCapturesRoutes.delete("/captures/:id", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("id");

  const capture = await db.query.finCaptures.findFirst({
    where: and(eq(finCaptures.id, captureId), eq(finCaptures.tenantId, user.tenantId)),
  });
  if (!capture) return c.json({ error: "not_found", message: "Captura nu există." }, 404);

  if (capture.kind === "statement") {
    // Remove the statement's transaction rows.
    await db
      .delete(finCaptureLines)
      .where(and(eq(finCaptureLines.tenantId, user.tenantId), eq(finCaptureLines.captureId, captureId)));
  } else {
    // Invoice: any line linked to it goes back to "missing" so we don't leave a dangling ref.
    await db
      .update(finCaptureLines)
      .set({ matchStatus: "missing", matchedCaptureId: null, matchScoreBp: 0, updatedAt: new Date() })
      .where(and(eq(finCaptureLines.tenantId, user.tenantId), eq(finCaptureLines.matchedCaptureId, captureId)));
  }

  await db
    .delete(finCaptures)
    .where(and(eq(finCaptures.id, captureId), eq(finCaptures.tenantId, user.tenantId)));

  return c.json({ ok: true, id: captureId, kind: capture.kind });
});
