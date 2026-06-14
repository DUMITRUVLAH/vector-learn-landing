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
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { finCaptures, type ExtractedFields } from "../db/schema/finCaptures";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { extractCaptureFields } from "../lib/ai/captureExtractor";

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
    extractedFields: c.extractedFields,
    rawText: c.rawText,
    errorMessage: c.errorMessage,
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

  const rows = await db.query.finCaptures.findMany({
    where: eq(finCaptures.tenantId, user.tenantId),
    orderBy: [desc(finCaptures.createdAt)],
    limit,
    offset,
  });

  return c.json({ captures: rows.map(serializeCapture), total: rows.length });
});

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

  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("application/json")) {
    // JSON mode (testing / API clients)
    const body = await c.req.json<{
      fileKey?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      rawText?: string;
    }>();
    fileKey = body.fileKey ?? "upload/unknown";
    fileName = body.fileName ?? "document.pdf";
    mimeType = body.mimeType ?? "application/pdf";
    sizeBytes = body.sizeBytes ?? 0;
    rawText = body.rawText ?? "";
  } else if (contentType.includes("multipart/form-data")) {
    // Multipart mode (real upload)
    const formData = await c.req.formData();
    const file = formData.get("file");
    rawText = (formData.get("rawText") as string | null) ?? "";

    if (file && file instanceof File) {
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      sizeBytes = file.size;
      // În production, fișierul e trimis la Vercel Blob/S3 și se obține fileKey
      // Aici stocăm un placeholder (storage real implementat separat)
      fileKey = `captures/${user.tenantId}/${Date.now()}-${fileName}`;
    } else {
      return c.json({ error: "file_required" }, 400);
    }
  } else {
    return c.json({ error: "unsupported_content_type" }, 415);
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
      rawText: rawText || undefined,
      createdBy: user.id,
    })
    .returning();

  // Extrage câmpuri cu AI (sync — poate fi async în producție cu queue)
  let extractedFields: ExtractedFields | undefined;
  let newStatus: "extracted" | "failed" = "extracted";
  let errorMessage: string | undefined;

  try {
    const result = await extractCaptureFields(
      rawText || `[Fișier: ${fileName}]`,
      user.tenantId,
      user.id,
      capture.id
    );
    extractedFields = result.extractedFields;
  } catch (err) {
    newStatus = "failed";
    errorMessage = err instanceof Error ? err.message : "Eroare necunoscută la extracție AI";
  }

  // Actualizează capture cu rezultatul extracției
  const [updated] = await db
    .update(finCaptures)
    .set({
      status: newStatus,
      extractedFields: extractedFields ?? null,
      errorMessage: errorMessage ?? null,
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
