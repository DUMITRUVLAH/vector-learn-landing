/**
 * FinDesk — "Cont de plată" PDF document routes (FRESH DESIGN).
 *
 * Separate from finInvoices.ts /:id/pdf (which returns the blue fiscal-invoice HTML).
 * This generates a print-ready "Cont de plată" PDF with an alternative emerald/slate
 * design via Playwright, sourcing data from the existing fin_invoices tables.
 *
 *   GET /api/fin/invoices/:id/document.html  → HTML preview (used by the web iframe)
 *   GET /api/fin/invoices/:id/document.pdf   → application/pdf binary (Playwright)
 *
 * PDF generation uses Playwright's bundled Chromium. In environments where Chromium
 * cannot launch (e.g. serverless without a chromium binary), the .pdf route degrades
 * gracefully to the print-ready HTML so the feature never hard-fails — same fallback
 * philosophy as server/routes/contracts.ts.
 *
 * mount-exempt is NOT used — this router IS mounted in server/app.ts.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { finInvoices, finInvoiceLines } from "../db/schema/finInvoices";
import { finParties } from "../db/schema/finParties";
import { tenants } from "../db/schema/tenants";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  buildInvoiceDocHtml,
  type InvoiceDocLang,
  type InvoiceDocData,
  type InvoiceDocLine,
} from "../lib/fin/invoiceDocTemplate";

export const finInvoiceDocRoutes = new Hono<{ Variables: AuthVariables }>();

finInvoiceDocRoutes.use("/*", requireAuth);

const VALID_LANGS: InvoiceDocLang[] = ["ro", "ru", "en"];

function resolveLang(raw: string | undefined): InvoiceDocLang {
  return VALID_LANGS.includes(raw as InvoiceDocLang) ? (raw as InvoiceDocLang) : "ro";
}

/**
 * Load an invoice + its lines + issuer (tenant) + recipient (party) and shape it
 * into the template's InvoiceDocData. Returns null if not found / wrong tenant.
 */
async function loadInvoiceDoc(
  invoiceId: string,
  tenantId: string
): Promise<{ data: InvoiceDocData; lines: InvoiceDocLine[] } | null> {
  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, invoiceId), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) return null;

  const lineRows = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, invoiceId))
    .orderBy(finInvoiceLines.createdAt);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  let party: typeof finParties.$inferSelect | undefined;
  if (invoice.partyId) {
    const [p] = await db
      .select()
      .from(finParties)
      .where(and(eq(finParties.id, invoice.partyId), eq(finParties.tenantId, tenantId)))
      .limit(1);
    party = p;
  }

  const data: InvoiceDocData = {
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt ?? invoice.createdAt,
    dueDate: invoice.dueDate,
    totalCents: invoice.totalCents,
    vatTotalCents: invoice.vatTotalCents,
    notes: invoice.notes,
    // Issuer (tenant) emits the invoice → "De la"
    from: {
      name: tenant?.name ?? "—",
      idno: null,
      address: null,
    },
    // Recipient (party) → "Către"
    to: {
      name: party?.name ?? "—",
      idno: party?.idno ?? null,
      address: party?.address ?? null,
    },
    bank: {
      bankName: null,
      currency: invoice.currency,
      iban: tenant?.iban ?? null,
      swift: tenant?.bic ?? null,
      fiscalCode: party?.idno ?? null,
      companyName: tenant?.name ?? null,
    },
  };

  const lines: InvoiceDocLine[] = lineRows.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    vatPct: l.vatPct,
    lineTotalCents: l.lineTotalCents,
    unit: null,
  }));

  return { data, lines };
}

// ─── Ad-hoc "Cont de plată" (no saved invoice) ──────────────────────────────────
//
// The owner wanted "Cont de plată" to be its OWN creation flow — like making an invoice
// (client + services + price), rendered straight to a PDF that's sent by email. It is a
// standalone document and is NOT persisted (no fin_invoices row). These POST endpoints
// accept the form data in the body and render the SAME emerald/slate template, computing
// all totals server-side (never trusting client math). The issuer ("De la") comes from the
// tenant; the recipient ("Către") + lines come from the request.

interface AdHocLineInput {
  description?: unknown;
  quantity?: unknown;
  unitPriceCents?: unknown;
  vatPct?: unknown;
  unit?: unknown;
}

export interface AdHocDocBody {
  invoiceNumber?: unknown;
  currency?: unknown;
  issuedAt?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  to?: { name?: unknown; idno?: unknown; address?: unknown };
  lines?: unknown;
}

/** The issuer ("De la") side — resolved from the tenant before shaping. */
export interface AdHocDocIssuer {
  name: string | null;
  iban: string | null;
  bic: string | null;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function toInt(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(toStr(v), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * PURE: validate + shape an ad-hoc doc body into the template's data, computing all totals
 * server-side (never trusting client math). No DB — the issuer is passed in. Returns an
 * `{ error }` when the input is unusable (no valid lines, or no recipient name).
 * `now` is injectable so the default issue-date is deterministic in tests.
 */
export function shapeAdHocDoc(
  body: AdHocDocBody,
  issuer: AdHocDocIssuer,
  now: string = new Date().toISOString()
): { data: InvoiceDocData; lines: InvoiceDocLine[] } | { error: string } {
  const rawLines = Array.isArray(body.lines) ? (body.lines as AdHocLineInput[]) : [];
  const lines: InvoiceDocLine[] = [];
  let totalCents = 0;
  let vatTotalCents = 0;

  for (const rl of rawLines) {
    const description = toStr(rl.description).trim();
    const quantity = Math.max(1, toInt(rl.quantity) || 1);
    const unitPriceCents = Math.max(0, toInt(rl.unitPriceCents));
    const vatPct = Math.min(100, Math.max(0, toInt(rl.vatPct)));
    const unit = rl.unit != null && toStr(rl.unit).trim() ? toStr(rl.unit).trim() : null;
    if (!description || unitPriceCents <= 0) continue; // skip empty / priceless rows
    const net = quantity * unitPriceCents;
    const vat = Math.round((net * vatPct) / 100);
    const lineTotalCents = net + vat;
    totalCents += lineTotalCents;
    vatTotalCents += vat;
    lines.push({ description, quantity, unitPriceCents, vatPct, lineTotalCents, unit });
  }

  if (lines.length === 0) {
    return { error: "Adaugă cel puțin o linie validă (descriere + preț)." };
  }

  const toName = toStr(body.to?.name).trim();
  if (!toName) {
    return { error: "Beneficiarul (client) este obligatoriu." };
  }

  const currency = ["MDL", "EUR", "USD"].includes(toStr(body.currency))
    ? toStr(body.currency)
    : "MDL";

  const toIdno = toStr(body.to?.idno).trim() || null;

  const data: InvoiceDocData = {
    invoiceNumber: toStr(body.invoiceNumber).trim() || "—",
    currency,
    issuedAt: toStr(body.issuedAt).trim() || now,
    dueDate: toStr(body.dueDate).trim() || null,
    totalCents,
    vatTotalCents,
    notes: toStr(body.notes).trim() || null,
    from: { name: issuer.name ?? "—", idno: null, address: null },
    to: { name: toName, idno: toIdno, address: toStr(body.to?.address).trim() || null },
    bank: {
      bankName: null,
      currency,
      iban: issuer.iban,
      swift: issuer.bic,
      fiscalCode: toIdno,
      companyName: issuer.name,
    },
  };

  return { data, lines };
}

/** Load the tenant issuer, then shape the doc (thin DB wrapper around shapeAdHocDoc). */
async function buildAdHocDoc(
  body: AdHocDocBody,
  tenantId: string
): Promise<{ data: InvoiceDocData; lines: InvoiceDocLine[] } | { error: string }> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return shapeAdHocDoc(body, {
    name: tenant?.name ?? null,
    iban: tenant?.iban ?? null,
    bic: tenant?.bic ?? null,
  });
}

/** POST /document.html — render an ad-hoc "Cont de plată" preview from form data (no DB row). */
finInvoiceDocRoutes.post("/document.html", async (c) => {
  const tenantId = c.get("user").tenantId;
  const lang = resolveLang(c.req.query("lang"));
  const body = (await c.req.json().catch(() => ({}))) as AdHocDocBody;

  const built = await buildAdHocDoc(body, tenantId);
  if ("error" in built) return c.json({ error: built.error }, 400);

  const html = buildInvoiceDocHtml(built.data, built.lines, { lang });
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(html);
});

/** POST /document.pdf — render an ad-hoc "Cont de plată" to PDF from form data (no DB row). */
finInvoiceDocRoutes.post("/document.pdf", async (c) => {
  const tenantId = c.get("user").tenantId;
  const lang = resolveLang(c.req.query("lang"));
  const body = (await c.req.json().catch(() => ({}))) as AdHocDocBody;

  const built = await buildAdHocDoc(body, tenantId);
  if ("error" in built) return c.json({ error: built.error }, 400);

  const html = buildInvoiceDocHtml(built.data, built.lines, { lang });
  const safeNumber = built.data.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_") || "document";

  try {
    const pdf = await renderHtmlToPdf(html);
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `attachment; filename="cont-plata-${safeNumber}.pdf"`);
    const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return c.body(ab);
  } catch (err) {
    console.warn("[finInvoiceDoc] ad-hoc PDF render failed, serving HTML fallback:", err);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Content-Disposition", `inline; filename="cont-plata-${safeNumber}.html"`);
    return c.body(html);
  }
});

/** GET /:id/document.html — render the print-ready HTML (preview iframe source). */
finInvoiceDocRoutes.get("/:id/document.html", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const lang = resolveLang(c.req.query("lang"));

  const loaded = await loadInvoiceDoc(id, tenantId);
  if (!loaded) return c.json({ error: "Factura nu a fost găsită" }, 404);

  const html = buildInvoiceDocHtml(loaded.data, loaded.lines, { lang });
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(html);
});

/**
 * GET /:id/document.pdf — render the document to a PDF binary via Playwright.
 * Degrades to the print-ready HTML if Chromium cannot launch.
 */
finInvoiceDocRoutes.get("/:id/document.pdf", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const lang = resolveLang(c.req.query("lang"));

  const loaded = await loadInvoiceDoc(id, tenantId);
  if (!loaded) return c.json({ error: "Factura nu a fost găsită" }, 404);

  const html = buildInvoiceDocHtml(loaded.data, loaded.lines, { lang });
  const safeNumber = loaded.data.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const pdf = await renderHtmlToPdf(html);
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `attachment; filename="cont-plata-${safeNumber}.pdf"`);
    // Hand Hono a fresh ArrayBuffer (Buffer's underlying buffer may be pooled/oversized).
    const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return c.body(ab);
  } catch (err) {
    // Chromium unavailable (e.g. serverless) — fall back to print-ready HTML.
    console.warn("[finInvoiceDoc] PDF render failed, serving HTML fallback:", err);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Content-Disposition", `inline; filename="cont-plata-${safeNumber}.html"`);
    return c.body(html);
  }
});

/**
 * Rasterize an HTML string to an A4 PDF using Playwright's bundled Chromium.
 *
 * Works on a local / long-running server where Chromium is installed. On serverless
 * (Vercel) Chromium isn't present, so launch() throws and the caller falls back to the
 * print-ready HTML — see the catch block in the /:id/document.pdf handler. Imported
 * lazily, and `playwright` is marked external in scripts/build-vercel.mjs so the
 * serverless bundle never tries to resolve its chromium-bidi dependency.
 */
async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
