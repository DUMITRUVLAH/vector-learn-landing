/**
 * STMT-001..004: FinDesk — Statement Upload, Review, e-Factura Export, History
 *
 * Mounted at /api/fin/statement (BEFORE /api/fin to avoid route shadowing).
 *
 * Routes:
 *   POST   /api/fin/statement/upload                               STMT-001
 *   GET    /api/fin/statement/:captureId/lines                     STMT-001
 *   PATCH  /api/fin/statement/:captureId/lines/:lineId             STMT-002
 *   POST   /api/fin/statement/:captureId/match                     STMT-002
 *   GET    /api/fin/statement/:captureId/summary                   STMT-002
 *   POST   /api/fin/statement/:captureId/lines/:lineId/submit-efactura  STMT-003
 *   POST   /api/fin/statement/:captureId/submit-efactura-batch     STMT-003
 *   POST   /api/fin/statement/:captureId/export-xml                STMT-005 (download XML, no SFS call)
 *   GET    /api/fin/statement/:captureId/lines/:lineId/efactura-status  STMT-003
 *   GET    /api/fin/statement                                      STMT-004
 *   GET    /api/fin/statement/export/saga-csv                      STMT-004
 *   GET    /api/fin/statement/export/efactura-xml-zip              STMT-004
 *   DELETE /api/fin/statement/:captureId                           STMT-004
 *
 * Reuses (no duplication):
 *   - buildCapture, deriveFileInput (exported from finCaptures.ts)
 *   - matchInvoiceToLines logic via captureId scoping (calls same logic as /api/fin/captures/match)
 *   - loadSfsConfig (server/lib/fin/sfsConfig.ts — shared with finEinvoices.ts)
 *   - EfacturaMdClient, generateSfsInvoiceXml (server/lib/efacturaMoldova.ts)
 *
 * Tenant safety: ALL routes filter by user.tenantId. No cross-tenant leaks.
 * exceljs: DYNAMIC import only — top-level import = prod outage.
 * JSZip: DYNAMIC import only — same rule.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { finCaptures, finCaptureLines } from "../db/schema/finCaptures";
import { finInvoices } from "../db/schema/finInvoices";
import { finEinvoices } from "../db/schema/finEinvoices";
import { finParties } from "../db/schema/finParties";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { buildCapture, deriveFileInput, type CaptureInput } from "./finCaptures";
import { loadSfsConfig } from "../lib/fin/sfsConfig";
import {
  EfacturaMdClient,
  generateSfsInvoiceXml,
  createMockTransport,
} from "../lib/efacturaMoldova";
import {
  validateLineForEfactura,
  buildSfsInvoiceInputFromLine,
  efacturaErrorMessage,
} from "../lib/fin/statementEfactura";
import { assignInvoicesToLines, type LineCandidate } from "../lib/fin/invoiceLineMatch";
import { sanitizePgText } from "../lib/fin/money";

export const finStatementRoutes = new Hono<{ Variables: AuthVariables }>();

finStatementRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".ods", ".mt940", ".sta", ".ofx", ".txt"];

const patchLineSchema = z.object({
  txDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description:      z.string().max(500).optional(),
  counterparty:     z.string().max(300).nullable().optional(),
  counterpartyIdno: z.string().regex(/^\d{7,13}$/).nullable().optional(),
  counterpartyIban: z.string().regex(/^[A-Z0-9]{5,34}$/).nullable().optional(),
  amountCents:      z.number().int().min(0).optional(),
  direction:        z.enum(["in", "out"]).optional(),
  reportable:       z.enum(["yes", "no", "review"]).optional(),
  reportableReason: z.string().max(300).nullable().optional(),
});

const batchSubmitSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1).max(50),
});

// STMT-005: export selected lines as SFS XML files (for manual Import XML in the SFS portal)
const exportXmlSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1).max(50),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeLine(l: typeof finCaptureLines.$inferSelect) {
  return {
    id: l.id,
    captureId: l.captureId,
    tenantId: l.tenantId,
    txDate: l.txDate,
    description: l.description,
    counterparty: l.counterparty,
    counterpartyIdno: l.counterpartyIdno,
    counterpartyIban: l.counterpartyIban,
    amountCents: l.amountCents,
    direction: l.direction,
    currency: l.currency,
    origAmount: l.origAmount,
    reportable: l.reportable,
    reportableReason: l.reportableReason,
    reportableConfidenceBp: l.reportableConfidenceBp,
    matchStatus: l.matchStatus,
    matchedCaptureId: l.matchedCaptureId,
    matchScoreBp: l.matchScoreBp,
    linkedFinInvoiceId: l.linkedFinInvoiceId,
    reviewedBy: l.reviewedBy,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    reviewNote: l.reviewNote,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// ─── STMT-001: POST /upload ───────────────────────────────────────────────────

finStatementRoutes.post("/upload", async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";

  // JSON mode (tests / API clients)
  if (contentType.includes("application/json")) {
    const body = await c.req.json<{
      fileKey?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
      rawText?: string; kind?: string; forceKind?: boolean;
    }>();
    const input: CaptureInput = {
      fileKey: body.fileKey ?? "upload/statement-test",
      fileName: body.fileName ?? "statement.pdf",
      mimeType: body.mimeType ?? "application/pdf",
      sizeBytes: body.sizeBytes ?? 0,
      rawText: body.rawText ?? "",
      kind: "statement",
      forceKind: true,
      team: "other",
    };
    const { capture, lineCount } = await buildCapture(user, input);
    // Fetch first lines for preview
    const firstLines = await db.query.finCaptureLines.findMany({
      where: and(
        eq(finCaptureLines.captureId, capture.id),
        eq(finCaptureLines.tenantId, user.tenantId),
      ),
      limit: 50,
      orderBy: [finCaptureLines.createdAt],
    });
    return c.json({ captureId: capture.id, lineCount, lines: firstLines.map(serializeLine) }, 201);
  }

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "unsupported_content_type" }, 415);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return c.json({ error: "invalid_file" }, 400);
  if (file.size === 0) return c.json({ error: "invalid_file" }, 400);

  // Check allowed extension
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return c.json({ error: "invalid_file" }, 400);
  }

  let rawText = "";
  // Excel: dynamic import of exceljs (NEVER top-level — would crash prod)
  if (ext === ".xlsx" || ext === ".ods") {
    const exceljs = await import("exceljs");
    const workbook = new exceljs.default.Workbook();
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await workbook.xlsx.load(buf);
    } catch {
      return c.json({ error: "invalid_file" }, 400);
    }
    const ws = workbook.worksheets[0];
    if (!ws) {
      return c.json({ error: "invalid_file" }, 400);
    }
    const rows: string[] = [];
    ws.eachRow((row) => {
      const cells = (row.values as (string | number | null | undefined)[]).slice(1);
      // STMT-005: MAIB puts partner name+IDNO+IBAN in ONE multiline cell — flatten the
      // newlines so one statement row stays one CSV line for the parser.
      rows.push(cells.map((v) => (v !== null && v !== undefined ? String(v).replace(/[\r\n]+/g, " ") : "")).join(","));
    });
    rawText = rows.join("\n");
  } else {
    const derived = await deriveFileInput(file, user.tenantId, "");
    rawText = derived.rawText;
  }

  const input: CaptureInput = {
    fileKey: `captures/${user.tenantId}/${Date.now()}-${file.name}`,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    rawText: sanitizePgText(rawText),
    kind: "statement",
    forceKind: true,
    team: "other",
  };

  const { capture, lineCount } = await buildCapture(user, input);

  const firstLines = await db.query.finCaptureLines.findMany({
    where: and(
      eq(finCaptureLines.captureId, capture.id),
      eq(finCaptureLines.tenantId, user.tenantId),
    ),
    limit: 50,
    orderBy: [finCaptureLines.createdAt],
  });

  return c.json({ captureId: capture.id, lineCount, lines: firstLines.map(serializeLine) }, 201);
});

// ─── STMT-001: GET /:captureId/lines ─────────────────────────────────────────
// Must be mounted before /:captureId/... PATCH routes.
// Specific routes first in Hono.

finStatementRoutes.get("/:captureId/lines", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("captureId");
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finCaptureLines)
    .where(and(eq(finCaptureLines.captureId, captureId), eq(finCaptureLines.tenantId, user.tenantId)));

  const lines = await db.query.finCaptureLines.findMany({
    where: and(
      eq(finCaptureLines.captureId, captureId),
      eq(finCaptureLines.tenantId, user.tenantId),
    ),
    limit,
    offset,
    orderBy: [finCaptureLines.createdAt],
  });

  return c.json({ lines: lines.map(serializeLine), total: total?.count ?? 0 });
});

// ─── STMT-002: PATCH /:captureId/lines/:lineId ───────────────────────────────

finStatementRoutes.patch(
  "/:captureId/lines/:lineId",
  zValidator("json", patchLineSchema),
  async (c) => {
    const user = c.get("user");
    const captureId = c.req.param("captureId");
    const lineId = c.req.param("lineId");
    const patch = c.req.valid("json");

    // Verify line belongs to this tenant + captureId
    const line = await db.query.finCaptureLines.findFirst({
      where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
    });
    if (!line) return c.json({ error: "not_found" }, 404);
    if (line.captureId !== captureId) return c.json({ error: "not_found" }, 404);

    const [updated] = await db
      .update(finCaptureLines)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(finCaptureLines.id, lineId))
      .returning();

    return c.json({ line: serializeLine(updated) });
  },
);

// ─── STMT-002: POST /:captureId/match ────────────────────────────────────────

finStatementRoutes.post("/:captureId/match", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("captureId");

  // Candidate invoices: document captures for the tenant
  const invoices = await db.query.finCaptures.findMany({
    where: and(eq(finCaptures.tenantId, user.tenantId), eq(finCaptures.kind, "document")),
  });

  // Outgoing lines for this statement only
  const lines = await db.query.finCaptureLines.findMany({
    where: and(
      eq(finCaptureLines.captureId, captureId),
      eq(finCaptureLines.tenantId, user.tenantId),
      eq(finCaptureLines.direction, "out"),
    ),
  });

  // Manual links (score 10000) are honored, remove their invoices from pool
  const manualInvoiceIds = new Set(
    lines.filter((l) => l.matchScoreBp === 10000 && l.matchedCaptureId).map((l) => l.matchedCaptureId as string),
  );
  const autoLines = lines.filter((l) => !(l.matchScoreBp === 10000 && l.matchedCaptureId));

  const candidates: LineCandidate[] = autoLines.map((l) => ({
    id: l.id,
    origAmount: l.origAmount,
    amountCents: l.amountCents,
    counterparty: l.counterparty,
    description: l.description,
    txDate: l.txDate,
  }));

  // Reuse the same matching logic (assignInvoicesToLines from invoiceLineMatch.ts)
  // Map captures to InvoiceForMatch using the same mapping as finCaptures.ts (invoiceForMatch helper)
  const invoicePool = invoices
    .filter((inv) => !manualInvoiceIds.has(inv.id))
    .map((inv) => {
      const fields = inv.extractedFields;
      const amountCents = typeof fields?.amount_cents?.value === "number" ? fields.amount_cents.value : null;
      return {
        invoice: inv,
        fields: {
          vendorName: typeof fields?.vendor_name?.value === "string" ? fields.vendor_name.value : null,
          amountMajor: amountCents !== null ? amountCents / 100 : null,
          currency: null as string | null,
          date: typeof fields?.expense_date?.value === "string" ? fields.expense_date.value : null,
          haystack: [
            inv.fileName,
            typeof fields?.reference?.value === "string" ? fields.reference.value : "",
            inv.rawText ?? "",
          ].join(" ").toLowerCase().slice(0, 4000),
        },
      };
    });

  const assignment = assignInvoicesToLines(invoicePool, candidates);

  let matched = lines.length - autoLines.length; // manual links already counted
  let unmatched = 0;
  for (const l of autoLines) {
    const hit = assignment.get(l.id);
    if (hit) {
      matched += 1;
      await db.update(finCaptureLines).set({
        matchStatus: "matched",
        matchedCaptureId: hit.invoiceId,
        matchScoreBp: Math.round(hit.confidence * 10000),
        updatedAt: new Date(),
      }).where(eq(finCaptureLines.id, l.id));
    } else {
      unmatched += 1;
      await db.update(finCaptureLines).set({
        matchStatus: "missing",
        matchedCaptureId: null,
        matchScoreBp: 0,
        updatedAt: new Date(),
      }).where(eq(finCaptureLines.id, l.id));
    }
  }

  return c.json({ matched, unmatched, total: lines.length });
});

// ─── STMT-002: GET /:captureId/summary ───────────────────────────────────────

finStatementRoutes.get("/:captureId/summary", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("captureId");

  const rows = await db
    .select({
      totalLines: sql<number>`count(*)::int`,
      matchedLines: sql<number>`count(*) FILTER (WHERE match_status = 'matched')::int`,
      reportableLines: sql<number>`count(*) FILTER (WHERE reportable = 'yes')::int`,
      totalOutCents: sql<number>`COALESCE(SUM(amount_cents) FILTER (WHERE direction = 'out'), 0)::int`,
    })
    .from(finCaptureLines)
    .where(
      and(
        eq(finCaptureLines.captureId, captureId),
        eq(finCaptureLines.tenantId, user.tenantId),
      ),
    );

  const row = rows[0] ?? { totalLines: 0, matchedLines: 0, reportableLines: 0, totalOutCents: 0 };
  return c.json(row);
});

// ─── STMT-003: POST /:captureId/lines/:lineId/submit-efactura ────────────────

finStatementRoutes.post("/:captureId/lines/:lineId/submit-efactura", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("captureId");
  const lineId = c.req.param("lineId");

  // 1. Load the line
  const line = await db.query.finCaptureLines.findFirst({
    where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
  });
  if (!line) return c.json({ error: "not_found" }, 404);
  if (line.captureId !== captureId) return c.json({ error: "not_found" }, 404);

  // 2. Validations — the REAL rules live in statementEfactura.ts (shared with tests)
  const validationError = validateLineForEfactura(line);
  if (validationError === "already_exported") {
    return c.json({ error: validationError, message: efacturaErrorMessage(validationError) }, 409);
  }
  if (validationError) {
    return c.json({ error: validationError, message: efacturaErrorMessage(validationError) }, 422);
  }

  // 3. Lookup/create fin_parties
  const partyName = (line.counterparty ?? "Necunoscut").trim();
  let partyId: string;
  const existingParty = await db.query.finParties.findFirst({
    where: and(
      eq(finParties.tenantId, user.tenantId),
      sql`lower(${finParties.name}) = lower(${partyName})`,
    ),
  });
  if (existingParty) {
    partyId = existingParty.id;
  } else {
    const [newParty] = await db
      .insert(finParties)
      .values({ tenantId: user.tenantId, name: partyName, kind: "client", country: "MD", idno: line.counterpartyIdno ?? undefined })
      .returning();
    partyId = newParty.id;
  }

  // 4. Create synthetic fin_invoices row
  const [maxRow] = await db
    .select({ maxNum: sql<number>`COALESCE(MAX(number), 0)::int` })
    .from(finInvoices)
    .where(eq(finInvoices.tenantId, user.tenantId));
  const nextNum = (maxRow?.maxNum ?? 0) + 1;
  const invoiceNumber = `STMT-${captureId.slice(0, 8)}-${lineId.slice(0, 8)}`;
  const issuedAt = line.txDate ? new Date(line.txDate) : new Date();

  const [invoiceRow] = await db
    .insert(finInvoices)
    .values({
      tenantId: user.tenantId,
      partyId,
      number: nextNum,
      invoiceNumber,
      status: "draft",
      currency: "MDL",
      issuedAt,
      totalCents: line.amountCents,
      vatTotalCents: 0,
    })
    .returning();

  // 5. Generate XML (correct SfsInvoiceInput shape — buyer IDNO from the statement) + submit SFS
  const sfsData = await loadSfsConfig(user.tenantId);
  const config = sfsData?.config ?? { mock: true, supplierIdno: "UNKNOWN", supplierBankAccount: "", endpoint: "", username: "", password: "" };
  const isMock = !sfsData || config.mock;
  const transport = isMock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(config, transport);

  const xml = generateSfsInvoiceXml(
    buildSfsInvoiceInputFromLine(line, { idno: config.supplierIdno, bankAccount: config.supplierBankAccount ?? "" }, invoiceRow.id),
  );

  // UI-facing status ("mock" when SFS is simulated); DB stores enum-valid values only.
  let sfsStatus: "mock" | "sent" | "pending" | "rejected" = isMock ? "mock" : "pending";
  let sfsErrorMessage: string | null = null;
  try {
    const result = await client.postInvoices(xml, invoiceRow.invoiceNumber);
    // status 1=ACCEPTED, 2=SUCCESS from SFS
    if (!isMock) sfsStatus = result.status <= 2 ? "sent" : "pending";
  } catch (err) {
    sfsErrorMessage = err instanceof Error ? err.message : "Eroare SFS necunoscută";
    if (!isMock) sfsStatus = "rejected";
  }

  // 6. Create fin_einvoices row ("mock" is not a DB enum value — store "pending")
  const [einvoiceRow] = await db
    .insert(finEinvoices)
    .values({
      tenantId: user.tenantId,
      finInvoiceId: invoiceRow.id,
      sfsStatus: sfsStatus === "mock" ? "pending" : sfsStatus,
      sfsErrorMessage: sfsErrorMessage ?? undefined,
      xmlPayload: xml,
      submittedAt: new Date(),
    })
    .returning();

  // 7. Update fin_capture_lines
  await db.update(finCaptureLines).set({
    matchStatus: "matched",
    linkedFinInvoiceId: invoiceRow.id,
    updatedAt: new Date(),
  }).where(eq(finCaptureLines.id, lineId));

  return c.json({
    einvoiceId: einvoiceRow.id,
    sfsStatus,
    xmlPreview: xml.slice(0, 500),
    invoiceNumber: invoiceRow.invoiceNumber,
  });
});

// ─── STMT-003: POST /:captureId/submit-efactura-batch ────────────────────────

finStatementRoutes.post(
  "/:captureId/submit-efactura-batch",
  zValidator("json", batchSubmitSchema),
  async (c) => {
    const user = c.get("user");
    const captureId = c.req.param("captureId");
    const { lineIds } = c.req.valid("json");

    const results: Array<{ lineId: string; ok: boolean; einvoiceId?: string; sfsStatus?: string; error?: string }> = [];
    let submitted = 0;

    for (const lineId of lineIds) {
      try {
        // Reuse the same logic as single submit — call internal processing
        const line = await db.query.finCaptureLines.findFirst({
          where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
        });
        if (!line || line.captureId !== captureId) {
          results.push({ lineId, ok: false, error: "not_found" });
          continue;
        }
        const validationError = validateLineForEfactura(line);
        if (validationError) {
          results.push({ lineId, ok: false, error: validationError, message: efacturaErrorMessage(validationError) });
          continue;
        }

        const partyName = (line.counterparty ?? "Necunoscut").trim();
        let partyId: string;
        const existingParty = await db.query.finParties.findFirst({
          where: and(
            eq(finParties.tenantId, user.tenantId),
            sql`lower(${finParties.name}) = lower(${partyName})`,
          ),
        });
        if (existingParty) {
          partyId = existingParty.id;
        } else {
          const [newParty] = await db
            .insert(finParties)
            .values({ tenantId: user.tenantId, name: partyName, kind: "client", country: "MD", idno: line.counterpartyIdno ?? undefined })
            .returning();
          partyId = newParty.id;
        }

        const [maxRow] = await db
          .select({ maxNum: sql<number>`COALESCE(MAX(number), 0)::int` })
          .from(finInvoices)
          .where(eq(finInvoices.tenantId, user.tenantId));
        const nextNum = (maxRow?.maxNum ?? 0) + 1;
        const invoiceNumber = `STMT-${captureId.slice(0, 8)}-${lineId.slice(0, 8)}`;
        const issuedAt = line.txDate ? new Date(line.txDate) : new Date();

        const [invoiceRow] = await db
          .insert(finInvoices)
          .values({
            tenantId: user.tenantId,
            partyId,
            number: nextNum,
            invoiceNumber,
            status: "draft",
            currency: "MDL",
            issuedAt,
            totalCents: line.amountCents,
            vatTotalCents: 0,
          })
          .returning();

        const sfsData = await loadSfsConfig(user.tenantId);
        const config = sfsData?.config ?? { mock: true, supplierIdno: "UNKNOWN", supplierBankAccount: "", endpoint: "", username: "", password: "" };
        const isMock = !sfsData || config.mock;
        const transport = isMock ? createMockTransport() : undefined;
        const client = new EfacturaMdClient(config, transport);

        const xml = generateSfsInvoiceXml(
          buildSfsInvoiceInputFromLine(line, { idno: config.supplierIdno, bankAccount: config.supplierBankAccount ?? "" }, invoiceRow.id),
        );

        let sfsStatus: "mock" | "sent" | "pending" | "rejected" = isMock ? "mock" : "pending";
        let sfsErrorMessage: string | null = null;
        try {
          const result = await client.postInvoices(xml, invoiceRow.invoiceNumber);
          if (!isMock) sfsStatus = result.status <= 2 ? "sent" : "pending";
        } catch (err) {
          sfsErrorMessage = err instanceof Error ? err.message : "Eroare SFS necunoscută";
          if (!isMock) sfsStatus = "rejected";
        }

        const [einvoiceRow] = await db
          .insert(finEinvoices)
          .values({
            tenantId: user.tenantId,
            finInvoiceId: invoiceRow.id,
            sfsStatus: sfsStatus === "mock" ? "pending" : sfsStatus,
            sfsErrorMessage: sfsErrorMessage ?? undefined,
            xmlPayload: xml,
            submittedAt: new Date(),
          })
          .returning();

        await db.update(finCaptureLines).set({
          matchStatus: "matched",
          linkedFinInvoiceId: invoiceRow.id,
          updatedAt: new Date(),
        }).where(eq(finCaptureLines.id, lineId));

        submitted += 1;
        results.push({ lineId, ok: true, einvoiceId: einvoiceRow.id, sfsStatus });
      } catch (e) {
        results.push({ lineId, ok: false, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return c.json({ submitted, errors: results.filter((r) => !r.ok), results });
  },
);

// ─── STMT-005: POST /:captureId/export-xml ────────────────────────────────────
// Generates the SFS invoice XML for the selected lines ON THE FLY and returns it as a
// download (single .xml, or .zip for multiple). NO SFS credentials and NO SFS call needed —
// the file is meant for manual «Import XML» in the SFS e-Factura portal (Eu sunt Furnizor →
// Fișierele XML → Import XML). Requires only the company IDNO+IBAN from Configurare SFS.
// All-or-nothing: if ANY selected line is invalid, returns 422 with per-line errors so the
// user never believes an incomplete batch was exported. Stateless — no DB writes.

finStatementRoutes.post(
  "/:captureId/export-xml",
  zValidator("json", exportXmlSchema),
  async (c) => {
    const user = c.get("user");
    const captureId = c.req.param("captureId");
    const { lineIds } = c.req.valid("json");

    const sfsData = await loadSfsConfig(user.tenantId);
    if (!sfsData?.config.supplierIdno) {
      return c.json(
        {
          error: "sfs_settings_missing",
          message: "Completează IDNO-ul și IBAN-ul companiei în e-Factura → Configurare SFS (nu sunt necesare credențiale API pentru export XML).",
        },
        422,
      );
    }
    const supplier = { idno: sfsData.config.supplierIdno, bankAccount: sfsData.config.supplierBankAccount ?? "" };

    const rows = await db.query.finCaptureLines.findMany({
      where: and(eq(finCaptureLines.captureId, captureId), eq(finCaptureLines.tenantId, user.tenantId)),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const errors: Array<{ lineId: string; error: string; message: string }> = [];
    const files: Array<{ name: string; xml: string }> = [];
    for (const lineId of lineIds) {
      const line = byId.get(lineId);
      if (!line) {
        errors.push({ lineId, error: "not_found", message: "Linia nu există în acest extras." });
        continue;
      }
      // Export is allowed for lines already submitted via API (re-download is harmless),
      // so skip only the data-quality rules, not "already_exported".
      const validationError = validateLineForEfactura({ ...line, linkedFinInvoiceId: null });
      if (validationError) {
        errors.push({ lineId, error: validationError, message: efacturaErrorMessage(validationError) });
        continue;
      }
      const xml = generateSfsInvoiceXml(buildSfsInvoiceInputFromLine(line, supplier, line.id));
      const datePart = line.txDate ?? "fara-data";
      const namePart = (line.counterparty ?? "partener").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
      files.push({ name: `efactura-${datePart}-${namePart}-${line.id.slice(0, 8)}.xml`, xml });
    }

    if (errors.length > 0) {
      return c.json({ error: "invalid_lines", errors, validCount: files.length }, 422);
    }

    if (files.length === 1) {
      return new Response(files[0].xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${files[0].name}"`,
        },
      });
    }

    // Dynamic import — never top-level (prod outage rule)
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.xml);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="efacturi-extras-${captureId.slice(0, 8)}.zip"`,
      },
    });
  },
);

// ─── STMT-003: GET /:captureId/lines/:lineId/efactura-status ─────────────────

finStatementRoutes.get("/:captureId/lines/:lineId/efactura-status", async (c) => {
  const user = c.get("user");
  const lineId = c.req.param("lineId");

  const line = await db.query.finCaptureLines.findFirst({
    where: and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, user.tenantId)),
  });
  if (!line?.linkedFinInvoiceId) return c.json({ sfsStatus: null });

  const rows = await db
    .select({
      sfsStatus: finEinvoices.sfsStatus,
      submittedAt: finEinvoices.submittedAt,
      sfsInvoiceId: finEinvoices.sfsInvoiceId,
      invoiceNumber: finInvoices.invoiceNumber,
    })
    .from(finEinvoices)
    .innerJoin(finInvoices, eq(finInvoices.id, finEinvoices.finInvoiceId))
    .where(eq(finEinvoices.finInvoiceId, line.linkedFinInvoiceId))
    .orderBy(desc(finEinvoices.submittedAt))
    .limit(1);

  if (rows.length === 0) return c.json({ sfsStatus: null });
  const r = rows[0];
  return c.json({
    sfsStatus: r.sfsStatus,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    sfsId: r.sfsInvoiceId,
    invoiceNumber: r.invoiceNumber,
  });
});

// ─── STMT-004: GET / (list statements) ───────────────────────────────────────
// Must be BEFORE /:captureId routes to avoid Hono routing conflict.
// Hono matches in registration order — specific static paths before params.

finStatementRoutes.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));

  // Aggregate stats per statement via raw SQL for efficiency
  const stmts = await db.execute(
    sql`
      SELECT
        fc.id,
        fc.file_name,
        fc.created_at,
        fc.status,
        COUNT(fcl.id)::int                                                         AS line_count,
        COUNT(fcl.id) FILTER (WHERE fcl.match_status = 'matched')::int            AS matched_count,
        COUNT(fcl.id) FILTER (WHERE fcl.linked_fin_invoice_id IS NOT NULL)::int   AS sfs_count,
        COALESCE(SUM(fcl.amount_cents) FILTER (WHERE fcl.direction = 'out'), 0)::int AS total_out_cents
      FROM fin_captures fc
      LEFT JOIN fin_capture_lines fcl ON fcl.capture_id = fc.id
      WHERE fc.tenant_id = ${user.tenantId} AND fc.kind = 'statement'
      GROUP BY fc.id
      ORDER BY fc.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  );

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finCaptures)
    .where(and(eq(finCaptures.tenantId, user.tenantId), eq(finCaptures.kind, "statement")));

  const rows = Array.isArray(stmts) ? stmts : (stmts as { rows: unknown[] }).rows ?? [];
  return c.json({ statements: rows, total: totalRow?.count ?? 0 });
});

// ─── STMT-004: GET /export/saga-csv ──────────────────────────────────────────

finStatementRoutes.get("/export/saga-csv", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "invalid_month", message: "month param required, format YYYY-MM" }, 400);
  }

  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const rows = await db.execute(
    sql`
      SELECT
        ROW_NUMBER() OVER (ORDER BY fcl.tx_date, fcl.id) AS nr,
        fcl.tx_date,
        fcl.description,
        fcl.counterparty,
        fcl.amount_cents,
        fcl.direction,
        fcl.reportable,
        fcl.match_status,
        fi.invoice_number
      FROM fin_capture_lines fcl
      LEFT JOIN fin_invoices fi ON fi.id = fcl.linked_fin_invoice_id
      WHERE fcl.tenant_id = ${user.tenantId}
        AND fcl.tx_date >= ${monthStart}
        AND fcl.tx_date < ${nextMonth}
      ORDER BY fcl.tx_date, fcl.id
    `
  );

  const dataRows = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows ?? [];

  // Build CSV without external libraries
  const header = "Nr,Data,Descriere,Contraparte,Suma MDL,Directie,Raportabil,Status Match,Nr e-Factura\r\n";
  const lines = (dataRows as Array<Record<string, unknown>>).map((r) => {
    const amount = typeof r.amount_cents === "number" ? (r.amount_cents / 100).toFixed(2) : "0.00";
    const escField = (v: unknown) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    return [
      r.nr,
      escField(r.tx_date),
      escField(r.description),
      escField(r.counterparty),
      amount,
      escField(r.direction),
      escField(r.reportable),
      escField(r.match_status),
      escField(r.invoice_number),
    ].join(",");
  });

  const csv = header + lines.join("\r\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saga-statement-${month}.csv"`,
    },
  });
});

// ─── STMT-004: GET /export/efactura-xml-zip ──────────────────────────────────

finStatementRoutes.get("/export/efactura-xml-zip", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "invalid_month", message: "month param required, format YYYY-MM" }, 400);
  }

  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const rows = await db.execute(
    sql`
      SELECT fe.xml_payload, fe.sfs_status, fi.invoice_number, fcl.id AS line_id
      FROM fin_einvoices fe
      JOIN fin_invoices fi ON fi.id = fe.fin_invoice_id
      JOIN fin_capture_lines fcl ON fcl.linked_fin_invoice_id = fi.id
      WHERE fcl.tenant_id = ${user.tenantId}
        AND fcl.tx_date >= ${monthStart}
        AND fcl.tx_date < ${nextMonth}
        AND fe.xml_payload IS NOT NULL
    `
  );

  const dataRows = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows ?? [];

  // Dynamic import — never top-level
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const row of dataRows as Array<Record<string, unknown>>) {
    if (row.xml_payload) {
      zip.file(`efactura-${row.invoice_number}.xml`, String(row.xml_payload));
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="efacturi-${month}.zip"`,
    },
  });
});

// ─── STMT-004: DELETE /:captureId ────────────────────────────────────────────

finStatementRoutes.delete("/:captureId", async (c) => {
  const user = c.get("user");
  const captureId = c.req.param("captureId");

  const existing = await db.query.finCaptures.findFirst({
    where: and(
      eq(finCaptures.id, captureId),
      eq(finCaptures.tenantId, user.tenantId),
      eq(finCaptures.kind, "statement"),
    ),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  // ON DELETE CASCADE removes fin_capture_lines automatically
  await db.delete(finCaptures).where(
    and(
      eq(finCaptures.id, captureId),
      eq(finCaptures.tenantId, user.tenantId),
    ),
  );

  return c.json({ ok: true });
});
