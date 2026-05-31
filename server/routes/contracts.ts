/**
 * CONTRACT-501 — Contracts API
 *
 * GET  /api/contracts          — list recent contracts (tenant-scoped, most recent first)
 * POST /api/contracts          — create contract + allocate daily-seq number
 * GET  /api/contracts/:id      — fetch single contract
 * GET  /api/contracts/:id/pdf  — stream generated PDF
 * POST /api/contracts/ocr      — upload image → extract beneficiary data (OCR stub)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { contracts, tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** ISO date string YYYY-MM-DD for today (UTC) */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Derive a contract number prefix from the tenant slug.
 * Strategy: uppercase, max 4 chars, strip hyphens.
 * e.g. "vector-academy" → "VA"
 */
function prefixFromSlug(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return slug.slice(0, 3).toUpperCase();
}

/**
 * Allocate the next daily sequence number for this tenant.
 * Uses SELECT MAX(daily_seq) + 1 for today. Safe for concurrent writes because
 * the contracts table has a unique constraint on (tenant_id, number).
 */
async function allocateDailySeq(tenantId: string, today: string): Promise<number> {
  const rows = await db
    .select({ maxSeq: sql<number>`MAX(${contracts.dailySeq})` })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        eq(contracts.contractDate, today)
      )
    );
  const row = Array.isArray(rows) ? rows[0] : (rows as { rows: Array<{ maxSeq: number }> }).rows?.[0];
  const maxSeq = row?.maxSeq ?? 0;
  return (maxSeq ?? 0) + 1;
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createContractSchema = z.object({
  beneficiaryType: z.enum(["pf", "pj"]).default("pf"),
  // PF
  beneficiaryName: z.string().max(300).optional().nullable(),
  idn: z.string().max(20).optional().nullable(),
  // PJ
  companyName: z.string().max(300).optional().nullable(),
  companyIdno: z.string().max(20).optional().nullable(),
  repName: z.string().max(200).optional().nullable(),
  repRole: z.string().max(100).optional().nullable(),
  // Course details
  course: z.string().max(200).optional().nullable(),
  hours: z.number().int().positive().optional().nullable(),
  scheduleText: z.string().max(500).optional().nullable(),
  language: z.string().max(100).optional().nullable(),
  format: z.enum(["fizic", "online"]).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  priceCents: z.number().int().min(0).default(0),
  currency: z.enum(["MDL", "EUR", "RON"]).default("MDL"),
  persons: z.number().int().positive().default(1),
  // CRM links
  leadId: z.string().uuid().optional().nullable(),
  studentId: z.string().uuid().optional().nullable(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── OCR types ────────────────────────────────────────────────────────────────

interface OcrResult {
  beneficiaryName: string | null;
  idn: string | null;
  companyName: string | null;
  companyIdno: string | null;
  note: string | null;
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export const contractRoutes = new Hono<{ Variables: AuthVariables }>();

contractRoutes.use("*", requireAuth);

/** GET /api/contracts — list recent contracts for current tenant */
contractRoutes.get(
  "/",
  zValidator("query", listQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { limit, offset } = c.req.valid("query");

    const rows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.tenantId, user.tenantId))
      .orderBy(desc(contracts.createdAt))
      .limit(limit)
      .offset(offset);

    const items = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
    return c.json({ contracts: items });
  }
);

/** POST /api/contracts — create contract with auto-allocated number */
contractRoutes.post(
  "/",
  zValidator("json", createContractSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Derive prefix from tenant slug
    const tenantRows = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId));

    const tenantRow = Array.isArray(tenantRows) ? tenantRows[0] : (tenantRows as unknown as { rows: typeof tenantRows }).rows?.[0];
    const slug = tenantRow?.slug ?? "vl";
    const prefix = prefixFromSlug(slug);

    const today = todayISO();
    const seq = await allocateDailySeq(user.tenantId, today);
    const dateFormatted = formatDate(new Date());
    const number = `${prefix}${seq}-${dateFormatted}`;

    const data = { ...body, number, generatedAt: new Date().toISOString() };

    const inserted = await db
      .insert(contracts)
      .values({
        tenantId: user.tenantId,
        number,
        prefix,
        dailySeq: seq,
        contractDate: today,
        beneficiaryType: body.beneficiaryType,
        beneficiaryName: body.beneficiaryName ?? null,
        idn: body.idn ?? null,
        companyName: body.companyName ?? null,
        companyIdno: body.companyIdno ?? null,
        repName: body.repName ?? null,
        repRole: body.repRole ?? null,
        course: body.course ?? null,
        hours: body.hours ?? null,
        scheduleText: body.scheduleText ?? null,
        language: body.language ?? null,
        format: body.format ?? null,
        location: body.location ?? null,
        priceCents: body.priceCents,
        currency: body.currency,
        persons: body.persons,
        leadId: body.leadId ?? null,
        studentId: body.studentId ?? null,
        data,
        createdBy: user.id,
      })
      .returning();

    const contract = Array.isArray(inserted) ? inserted[0] : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;
    return c.json({ contract }, 201);
  }
);

/** GET /api/contracts/:id — single contract */
contractRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, user.tenantId)));

  const contract = Array.isArray(rows) ? rows[0] : (rows as unknown as { rows: typeof rows }).rows?.[0];
  if (!contract) return c.json({ error: "not_found" }, 404);
  return c.json({ contract });
});

/** GET /api/contracts/:id/pdf — generate and stream PDF */
contractRoutes.get("/:id/pdf", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, user.tenantId)));

  const contract = Array.isArray(rows) ? rows[0] : (rows as unknown as { rows: typeof rows }).rows?.[0];
  if (!contract) return c.json({ error: "not_found" }, 404);

  const html = renderContractHtml(contract);

  // For now: return the HTML as a downloadable file.
  // A future phase can swap this for puppeteer/wkhtmltopdf.
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="contract-${contract.number}.html"`
  );
  return c.body(html);
});

/** POST /api/contracts/ocr — extract data from uploaded image */
contractRoutes.post("/ocr", async (c) => {
  // The OCR endpoint is a stub: no AI key configured → return empty fields + guidance.
  // A future phase can wire Anthropic Vision / Google Vision here.
  const AI_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const result: OcrResult = {
    beneficiaryName: null,
    idn: null,
    companyName: null,
    companyIdno: null,
    note: AI_KEY
      ? "OCR disponibil — procesare în curs (stub)"
      : "Completați manual — cheie AI neconfigurată.",
  };

  return c.json({ ocr: result });
});

// ─── PDF template ────────────────────────────────────────────────────────────

function renderContractHtml(contract: {
  number: string;
  contractDate: string;
  beneficiaryType: string;
  beneficiaryName?: string | null;
  idn?: string | null;
  companyName?: string | null;
  companyIdno?: string | null;
  repName?: string | null;
  repRole?: string | null;
  course?: string | null;
  hours?: number | null;
  scheduleText?: string | null;
  language?: string | null;
  format?: string | null;
  location?: string | null;
  priceCents: number;
  currency: string;
  persons: number;
}): string {
  const price = (contract.priceCents / 100).toFixed(2);
  const isPf = contract.beneficiaryType === "pf";

  const beneficiarySection = isPf
    ? `
    <tr><td><strong>Beneficiar</strong></td><td>${contract.beneficiaryName ?? "—"}</td></tr>
    <tr><td><strong>IDNP</strong></td><td>${contract.idn ?? "—"}</td></tr>
  `
    : `
    <tr><td><strong>Companie</strong></td><td>${contract.companyName ?? "—"}</td></tr>
    <tr><td><strong>IDNO</strong></td><td>${contract.companyIdno ?? "—"}</td></tr>
    <tr><td><strong>Reprezentant</strong></td><td>${contract.repName ?? "—"} (${contract.repRole ?? "—"})</td></tr>
  `;

  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8" />
  <title>Contract ${contract.number}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #111; margin: 40px; }
    h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
    .subtitle { text-align: center; color: #555; margin-bottom: 32px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    td { padding: 6px 10px; border: 1px solid #ccc; }
    td:first-child { width: 40%; background: #f5f5f5; font-weight: 500; }
    h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .footer { margin-top: 60px; display: flex; justify-content: space-between; }
    .sig-block { width: 45%; text-align: center; }
    .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>CONTRACT DE PRESTARE SERVICII</h1>
  <div class="subtitle">Nr. ${contract.number} din ${contract.contractDate.split("-").reverse().join(".")}</div>

  <h2>Datele beneficiarului</h2>
  <table>
    <tr><td><strong>Tip</strong></td><td>${isPf ? "Persoană fizică" : "Persoană juridică"}</td></tr>
    ${beneficiarySection}
  </table>

  <h2>Detalii curs</h2>
  <table>
    <tr><td><strong>Curs</strong></td><td>${contract.course ?? "—"}</td></tr>
    <tr><td><strong>Nr. ore</strong></td><td>${contract.hours != null ? contract.hours : "—"}</td></tr>
    <tr><td><strong>Orar</strong></td><td>${contract.scheduleText ?? "—"}</td></tr>
    <tr><td><strong>Limbă</strong></td><td>${contract.language ?? "—"}</td></tr>
    <tr><td><strong>Format</strong></td><td>${contract.format ?? "—"}</td></tr>
    <tr><td><strong>Locație</strong></td><td>${contract.location ?? "—"}</td></tr>
    <tr><td><strong>Nr. persoane</strong></td><td>${contract.persons}</td></tr>
    <tr><td><strong>Preț</strong></td><td>${price} ${contract.currency}</td></tr>
  </table>

  <div class="footer">
    <div class="sig-block">
      <div class="sig-line">Prestator</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">Beneficiar: ${isPf ? (contract.beneficiaryName ?? "_______") : (contract.companyName ?? "_______")}</div>
    </div>
  </div>
</body>
</html>`;
}
