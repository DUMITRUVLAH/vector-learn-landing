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
