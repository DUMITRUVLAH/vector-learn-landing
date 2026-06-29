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
import { and, eq, sql, desc, gte, lt, inArray } from "drizzle-orm";
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
  type SfsInvoiceLine,
} from "../lib/efacturaMoldova";
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
  amountCents:      z.number().int().min(0).optional(),
  direction:        z.enum(["in", "out"]).optional(),
  reportable:       z.enum(["yes", "no", "review"]).optional(),
  reportableReason: z.string().max(300).nullable().optional(),
});

const batchSubmitSchema = z.object({
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
      rows.push(cells.map((v) => (v !== null && v !== undefined ? String(v) : "")).join(","));
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

  // PERF-05: batch the writes. The old code issued one UPDATE per line (N round-trips on the
  // serverless max:1 pool → timeout risk + connection hogging under concurrency). We now split
  // the lines into matched/missing and issue at most TWO statements total, regardless of N.
  const matchedHits: { id: string; invoiceId: string; scoreBp: number }[] = [];
  const missingIds: string[] = [];
  for (const l of autoLines) {
    const hit = assignment.get(l.id);
    if (hit) matchedHits.push({ id: l.id, invoiceId: hit.invoiceId, scoreBp: Math.round(hit.confidence * 10000) });
    else missingIds.push(l.id);
  }

  const matched = lines.length - autoLines.length + matchedHits.length; // manual links + new matches
  const unmatched = missingIds.length;

  // One bulk UPDATE for all "missing" lines.
  if (missingIds.length > 0) {
    await db
      .update(finCaptureLines)
      .set({ matchStatus: "missing", matchedCaptureId: null, matchScoreBp: 0, updatedAt: new Date() })
      .where(
        and(
          eq(finCaptureLines.tenantId, user.tenantId),
          inArray(finCaptureLines.id, missingIds),
        ),
      );
  }

  // One UPDATE for all matched lines, using CASE expressions so each row gets its own
  // invoiceId/score in a single statement.
  if (matchedHits.length > 0) {
    const idList = matchedHits.map((h) => h.id);
    const invoiceCase = sql.join(
      [
        sql`CASE`,
        ...matchedHits.map((h) => sql`WHEN ${finCaptureLines.id} = ${h.id} THEN ${h.invoiceId}::uuid`),
        sql`END`,
      ],
      sql` `,
    );
    const scoreCase = sql.join(
      [
        sql`CASE`,
        ...matchedHits.map((h) => sql`WHEN ${finCaptureLines.id} = ${h.id} THEN ${h.scoreBp}::int`),
        sql`END`,
      ],
      sql` `,
    );
    await db
      .update(finCaptureLines)
      .set({
        matchStatus: "matched",
        matchedCaptureId: invoiceCase,
        matchScoreBp: scoreCase,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(finCaptureLines.tenantId, user.tenantId),
          inArray(finCaptureLines.id, idList),
        ),
      );
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

  // 2. Validations
  if (line.amountCents === 0) return c.json({ error: "amount_zero" }, 422);
  if (line.linkedFinInvoiceId) return c.json({ error: "already_exported" }, 409);

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
      .values({ tenantId: user.tenantId, name: partyName, kind: "supplier", country: "MD" })
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

  // 5. Generate XML + submit SFS
  const sfsData = await loadSfsConfig(user.tenantId);
  const config = sfsData?.config ?? { mock: true, supplierIdno: "UNKNOWN", supplierBankAccount: "", endpoint: "", username: "", password: "" };
  const isMock = !sfsData || config.mock;
  const transport = isMock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(config, transport);

  const sfsLines: SfsInvoiceLine[] = [
    {
      lineNumber: 1,
      description: line.description ?? "Tranzacție extras de cont",
      quantity: 1,
      unitPrice: line.amountCents / 100,
      vatRate: 0,
      totalWithoutVat: line.amountCents / 100,
      totalVat: 0,
      total: line.amountCents / 100,
    },
  ];

  const xml = generateSfsInvoiceXml({
    invoiceNumber: invoiceRow.invoiceNumber,
    issueDate: invoiceRow.issuedAt!.toISOString().slice(0, 10),
    supplierIdno: config.supplierIdno,
    supplierBankAccount: config.supplierBankAccount ?? "",
    buyerIdno: "",
    buyerName: line.counterparty ?? "Necunoscut",
    lines: sfsLines,
  });

  let sfsStatus: "mock" | "sent" | "pending" = "pending";
  try {
    const result = await client.postInvoices(xml, invoiceRow.invoiceNumber);
    // status 1=ACCEPTED, 2=SUCCESS from SFS
    sfsStatus = isMock ? "mock" : (result.status <= 2 ? "sent" : "pending");
  } catch {
    sfsStatus = isMock ? "mock" : "pending";
  }

  // 6. Create fin_einvoices row
  const [einvoiceRow] = await db
    .insert(finEinvoices)
    .values({
      tenantId: user.tenantId,
      finInvoiceId: invoiceRow.id,
      sfsStatus,
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
        if (line.amountCents === 0) {
          results.push({ lineId, ok: false, error: "amount_zero" });
          continue;
        }
        if (line.linkedFinInvoiceId) {
          results.push({ lineId, ok: false, error: "already_exported" });
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
            .values({ tenantId: user.tenantId, name: partyName, kind: "supplier", country: "MD" })
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

        const sfsLines: SfsInvoiceLine[] = [{
          lineNumber: 1,
          description: line.description ?? "Tranzacție extras de cont",
          quantity: 1,
          unitPrice: line.amountCents / 100,
          vatRate: 0,
          totalWithoutVat: line.amountCents / 100,
          totalVat: 0,
          total: line.amountCents / 100,
        }];

        const xml = generateSfsInvoiceXml({
          invoiceNumber: invoiceRow.invoiceNumber,
          issueDate: invoiceRow.issuedAt!.toISOString().slice(0, 10),
          supplierIdno: config.supplierIdno,
          supplierBankAccount: config.supplierBankAccount ?? "",
          buyerIdno: "",
          buyerName: line.counterparty ?? "Necunoscut",
          lines: sfsLines,
        });

        let sfsStatus: "mock" | "sent" | "pending" = "pending";
        try {
          const result = await client.postInvoices(xml, invoiceRow.invoiceNumber);
          sfsStatus = isMock ? "mock" : (result.status <= 2 ? "sent" : "pending");
        } catch {
          sfsStatus = isMock ? "mock" : "pending";
        }

        const [einvoiceRow] = await db
          .insert(finEinvoices)
          .values({ tenantId: user.tenantId, finInvoiceId: invoiceRow.id, sfsStatus, xmlPayload: xml, submittedAt: new Date() })
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
