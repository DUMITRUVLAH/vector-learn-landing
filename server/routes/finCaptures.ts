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
import { extractPdfText } from "../lib/ai/pdfText";

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

  // Parsare input: suportă multipart/form-data sau JSON (test-friendly)
  let fileKey = "upload/unknown";
  let fileName = "document.pdf";
  let mimeType = "application/pdf";
  let sizeBytes = 0;
  let rawText = "";
  let team = "other";
  let kind = "document"; // "document" (single invoice) | "statement" (bank statement → many lines)
  let imageDataUrl: string | undefined; // set for image uploads → OpenAI vision

  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("application/json")) {
    // JSON mode (testing / API clients)
    const body = await c.req.json<{
      fileKey?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      rawText?: string;
      team?: string;
      kind?: string;
    }>();
    fileKey = body.fileKey ?? "upload/unknown";
    fileName = body.fileName ?? "document.pdf";
    mimeType = body.mimeType ?? "application/pdf";
    sizeBytes = body.sizeBytes ?? 0;
    rawText = body.rawText ?? "";
    if (body.team && FIN_DOC_TEAMS.includes(body.team as never)) team = body.team;
    if (body.kind === "statement") kind = "statement";
  } else if (contentType.includes("multipart/form-data")) {
    // Multipart mode (real upload)
    const formData = await c.req.formData();
    const file = formData.get("file");
    rawText = (formData.get("rawText") as string | null) ?? "";
    const teamField = formData.get("team") as string | null;
    if (teamField && FIN_DOC_TEAMS.includes(teamField as never)) team = teamField;
    const kindField = formData.get("kind") as string | null;
    if (kindField === "statement") kind = "statement";

    if (file && file instanceof File) {
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      sizeBytes = file.size;
      // În production, fișierul e trimis la Vercel Blob/S3 și se obține fileKey
      // Aici stocăm un placeholder (storage real implementat separat)
      fileKey = `captures/${user.tenantId}/${Date.now()}-${fileName}`;

      const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
      const isCsvLike =
        /csv|text\/plain/i.test(mimeType) || /\.(csv|mt940|sta|txt)$/i.test(fileName);

      // Images (JPG/PNG/WebP) → data URL for OpenAI vision (model reads the doc directly).
      // Cap at ~8MB to stay within request limits.
      if (mimeType.startsWith("image/") && sizeBytes <= 8_000_000) {
        const buf = Buffer.from(await file.arrayBuffer());
        imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
      } else if (isPdf && !rawText.trim() && sizeBytes <= 8_000_000) {
        // PDF digital (din Word/export) → extragem stratul de text pe server, ca
        // utilizatorul să NU mai lipească manual. PDF scanat → text gol, cade pe
        // fallback. Vision pe poze acoperă cazul scanat.
        const buf = Buffer.from(await file.arrayBuffer());
        rawText = await extractPdfText(buf);
      } else if (isCsvLike && !rawText.trim() && sizeBytes <= 8_000_000) {
        // CSV / extras de cont / text → citim conținutul ca text și-l dăm AI-ului.
        rawText = await file.text();
      }
    } else {
      return c.json({ error: "file_required" }, 400);
    }
  } else {
    return c.json({ error: "unsupported_content_type" }, 415);
  }

  // Auto-detect a bank statement even if the caller didn't set kind: MAIB-style statements
  // say "EXTRAS DE CONT" or contain many "DD.MM.YYYY DD.MM.YYYY" transaction lines.
  if (kind !== "statement") {
    const dateLinePairs = (rawText.match(/\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}/g) ?? []).length;
    if (/extras de cont/i.test(rawText) || dateLinePairs >= 3) kind = "statement";
  }

  // Crează capture cu status processing
  const [capture] = await db
    .insert(finCaptures)
    .values({
      tenantId: user.tenantId,
      fileKey,
      fileName,
      mimeType,
      sizeBytes,
      status: "processing",
      team,
      kind,
      rawText: rawText || undefined,
      createdBy: user.id,
    })
    .returning();

  // ── Statement: extract EVERY transaction as a child line (Invoice Reporting) ──
  if (kind === "statement") {
    let lineStatus: "extracted" | "failed" = "extracted";
    let stmtError: string | undefined;
    let inserted = 0;
    try {
      const { transactions } = await extractStatementTransactions(
        rawText || `[Fișier: ${fileName}]`,
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
    return c.json({ capture: serializeCapture(updatedStmt), lineCount: inserted }, 201);
  }

  // Extrage câmpuri cu AI (sync — poate fi async în producție cu queue)
  let extractedFields: ExtractedFields | undefined;
  let newStatus: "extracted" | "failed" = "extracted";
  let errorMessage: string | undefined;

  try {
    const result = await extractCaptureFields(
      rawText || `[Fișier: ${fileName}]`,
      user.tenantId,
      user.id,
      capture.id,
      imageDataUrl,
    );
    extractedFields = result.extractedFields;
  } catch (err) {
    newStatus = "failed";
    errorMessage = err instanceof Error ? err.message : "Eroare necunoscută la extracție AI";
  }

  // Invoice Reporting: derive the reportable verdict columns from the AI field.
  // value true → "yes", false → "no", null/low-confidence → "review" (needs a human).
  const repField = extractedFields?.reportable;
  const repConf = repField?.confidence ?? 0;
  const reportable =
    repField?.value === true && repConf >= 0.7
      ? "yes"
      : repField?.value === false && repConf >= 0.7
        ? "no"
        : "review";

  // Actualizează capture cu rezultatul extracției
  const [updated] = await db
    .update(finCaptures)
    .set({
      status: newStatus,
      extractedFields: extractedFields ?? null,
      errorMessage: errorMessage ?? null,
      reportable,
      reportableReason: repField?.reason ?? null,
      reportableConfidenceBp: Math.round(repConf * 10000),
      updatedAt: new Date(),
    })
    .where(eq(finCaptures.id, capture.id))
    .returning();

  return c.json({ capture: serializeCapture(updated) }, 201);
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
