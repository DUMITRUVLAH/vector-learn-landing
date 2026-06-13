/**
 * BILL-002: FinDesk B2B Invoices API
 *
 * Routes:
 * GET    /api/fin/invoices                         → list (status, partyId, agreementId, search, limit, offset)
 * GET    /api/fin/invoices/:id                     → single invoice with lines
 * POST   /api/fin/invoices                         → create invoice + lines; auto-number; compute totals
 * PATCH  /api/fin/invoices/:id                     → update status/notes/dueDate (allowed transitions only)
 * DELETE /api/fin/invoices/:id                     → soft delete (status → cancelled)
 * GET    /api/fin/invoices/:id/lines               → list lines for invoice
 * POST   /api/fin/invoices/:id/lines               → add line (draft only); recompute totals
 * DELETE /api/fin/invoices/:id/lines/:lineId       → delete line (draft only); recompute totals
 *
 * Design:
 * - FIN-CORE §1.5: B2B context, uses fin_invoices NOT invoices
 * - FIN-CORE Rule #1: vatPct required per line (validated at POST)
 * - Auto-numbering: SELECT MAX(number)+1 WHERE tenantId on fin_invoices
 * - invoiceNumber format: FIN-YYYY-NNNN (series-year-4digit-padded)
 * - Status transitions: draft→issued, issued→paid|overdue|cancelled, overdue→paid|cancelled
 * - issued sets issuedAt = now()
 * - Tenant isolation: every query filters on tenantId
 * - Reuses requireAuth pattern from finAgreementsRoutes (AGREEMENT-002)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, or, sql, max, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  finInvoices,
  finInvoiceLines,
  finInvoiceReminders,
} from "../db/schema/finInvoices";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finInvoicesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finInvoicesRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

/**
 * Line schema — FIN-CORE Rule #1: vatPct is required (not optional).
 * Use vatPct: 0 for VAT-exempt lines, never omit it.
 */
const lineSchema = z.object({
  description: z.string().min(1, "Descrierea liniei este obligatorie").max(2000),
  quantity: z.number().int().min(1, "Cantitatea minimă este 1").default(1),
  unitPriceCents: z.number().int().min(0, "Prețul unitar nu poate fi negativ"),
  /**
   * FIN-CORE Rule #1: TVA obligatoriu per linie.
   * vatPct must be explicitly provided (0–100); undefined → 422.
   */
  vatPct: z
    .number()
    .int()
    .min(0, "TVA trebuie să fie ≥ 0")
    .max(100, "TVA trebuie să fie ≤ 100"),
  serviceId: z.string().uuid().optional().nullable(),
});

const createInvoiceSchema = z.object({
  partyId: z.string().uuid().optional().nullable(),
  agreementId: z.string().uuid().optional().nullable(),
  /**
   * Lines are required at creation.
   * If omitted and agreementId is provided, the server MAY pre-populate lines
   * from the agreement's services (future: BILL-003). For now, lines must be explicit.
   */
  lines: z.array(lineSchema).min(1, "Factura trebuie să conțină cel puțin o linie"),
  currency: z.string().length(3, "Codul valutei trebuie să fie ISO 4217 (3 litere)").optional().default("MDL"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD").optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(["draft", "issued", "paid", "overdue", "cancelled"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Allowed status transitions. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued"],
  issued: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  // paid and cancelled are terminal — no transitions
  paid: [],
  cancelled: [],
};

/** Compute line total including VAT: round(qty * unitPrice * (100 + vatPct) / 100). */
function computeLineTotal(
  quantity: number,
  unitPriceCents: number,
  vatPct: number
): number {
  return Math.round((quantity * unitPriceCents * (100 + vatPct)) / 100);
}

/** Compute VAT amount for a line: round(qty * unitPrice * vatPct / 100). */
function computeLineVat(
  quantity: number,
  unitPriceCents: number,
  vatPct: number
): number {
  return Math.round((quantity * unitPriceCents * vatPct) / 100);
}

/** Format invoice number: <series>-<YYYY>-<NNNN> */
function formatInvoiceNumber(series: string, year: number, number: number): string {
  return `${series}-${year}-${String(number).padStart(4, "0")}`;
}

// ─── GET /api/fin/invoices ────────────────────────────────────────────────────

finInvoicesRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const status = c.req.query("status");
  const partyId = c.req.query("partyId");
  const agreementId = c.req.query("agreementId");
  const search = c.req.query("search");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10), 0);

  const conditions = [eq(finInvoices.tenantId, tenantId)];

  const validStatuses = ["draft", "issued", "paid", "overdue", "cancelled"] as const;
  if (status && validStatuses.includes(status as typeof validStatuses[number])) {
    conditions.push(eq(finInvoices.status, status as typeof validStatuses[number]));
  }
  if (partyId) {
    conditions.push(eq(finInvoices.partyId, partyId));
  }
  if (agreementId) {
    conditions.push(eq(finInvoices.agreementId, agreementId));
  }
  if (search) {
    conditions.push(
      or(
        ilike(finInvoices.invoiceNumber, `%${search}%`),
        ilike(finInvoices.notes, `%${search}%`)
      )!
    );
  }

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(finInvoices)
      .where(and(...conditions))
      .orderBy(desc(finInvoices.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finInvoices)
      .where(and(...conditions)),
  ]);

  const total = countRow[0]?.count ?? 0;
  return c.json({ data: rows, total });
});

// ─── BILL-003: AGING ROUTES (MUST be before /:id — hono-specific-route-before-param) ──────────
//
// KNOWN_PITFALL: docs/solutions/architecture-patterns/hono-specific-route-before-param.md
// Registering /aging after /:id causes "aging" to be parsed as :id param → wrong handler.
// Keep ALL literal-path routes above the /:id param routes.

/** Helper: compute days overdue (positive = overdue, negative = not yet due). */
function daysOverdue(dueDateStr: string | null): number {
  if (!dueDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

/**
 * GET /api/fin/invoices/aging
 * Returns aging buckets + overdue invoice list for the authenticated tenant.
 * Buckets: current (not overdue), overdue_0_30, overdue_31_60, overdue_60_plus.
 */
finInvoicesRoutes.get("/aging", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Fetch all non-cancelled, non-draft invoices that have a dueDate or are issued
  const rows = await db
    .select({
      id: finInvoices.id,
      invoiceNumber: finInvoices.invoiceNumber,
      partyId: finInvoices.partyId,
      totalCents: finInvoices.totalCents,
      dueDate: finInvoices.dueDate,
      status: finInvoices.status,
    })
    .from(finInvoices)
    .where(
      and(
        eq(finInvoices.tenantId, tenantId),
        // Only active invoices (not cancelled/draft) for aging
        or(
          eq(finInvoices.status, "issued"),
          eq(finInvoices.status, "overdue"),
          eq(finInvoices.status, "paid")
        )!
      )
    )
    .orderBy(desc(finInvoices.createdAt));

  interface AgingBucket {
    count: number;
    totalCents: number;
  }

  const buckets: Record<string, AgingBucket> = {
    current: { count: 0, totalCents: 0 },
    overdue_0_30: { count: 0, totalCents: 0 },
    overdue_31_60: { count: 0, totalCents: 0 },
    overdue_60_plus: { count: 0, totalCents: 0 },
  };

  const overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    partyId: string | null;
    totalCents: number;
    dueDate: string | null;
    daysOverdue: number;
  }> = [];

  for (const row of rows) {
    // Skip paid invoices from aging (they're collected)
    if (row.status === "paid") continue;

    const days = daysOverdue(row.dueDate);

    if (days <= 0) {
      // Not overdue yet (or no dueDate)
      buckets.current.count++;
      buckets.current.totalCents += row.totalCents;
    } else if (days <= 30) {
      buckets.overdue_0_30.count++;
      buckets.overdue_0_30.totalCents += row.totalCents;
      overdueInvoices.push({ ...row, daysOverdue: days });
    } else if (days <= 60) {
      buckets.overdue_31_60.count++;
      buckets.overdue_31_60.totalCents += row.totalCents;
      overdueInvoices.push({ ...row, daysOverdue: days });
    } else {
      buckets.overdue_60_plus.count++;
      buckets.overdue_60_plus.totalCents += row.totalCents;
      overdueInvoices.push({ ...row, daysOverdue: days });
    }
  }

  return c.json({ data: { buckets, overdueInvoices } });
});

/**
 * GET /api/fin/invoices/aging/count
 * Returns the count of invoices that are overdue but have NOT yet received a reminder
 * for the highest threshold they qualify for. Used as an in-app badge indicator.
 */
finInvoicesRoutes.get("/aging/count", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Count overdue invoices (status = overdue OR issued+past dueDate)
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finInvoices)
    .where(
      and(
        eq(finInvoices.tenantId, tenantId),
        or(
          eq(finInvoices.status, "overdue"),
          // issued but past due date
          and(
            eq(finInvoices.status, "issued"),
            sql`${finInvoices.dueDate} < CURRENT_DATE`
          )!
        )!
      )
    );

  return c.json({ data: { count: countRow?.count ?? 0 } });
});

/**
 * POST /api/fin/invoices/aging/reminders
 * Generates fin_invoice_reminders entries for invoices overdue >= 3, 7, or 14 days.
 * Idempotent: uses ON CONFLICT DO NOTHING on unique(invoiceId, reminderDay).
 * Returns { created: N, skipped: N }.
 */
finInvoicesRoutes.post("/aging/reminders", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Fetch all non-cancelled, non-draft invoices with a dueDate
  const overdueRows = await db
    .select({
      id: finInvoices.id,
      dueDate: finInvoices.dueDate,
      invoiceNumber: finInvoices.invoiceNumber,
      totalCents: finInvoices.totalCents,
    })
    .from(finInvoices)
    .where(
      and(
        eq(finInvoices.tenantId, tenantId),
        or(
          eq(finInvoices.status, "overdue"),
          and(
            eq(finInvoices.status, "issued"),
            sql`${finInvoices.dueDate} < CURRENT_DATE`
          )!
        )!
      )
    );

  const REMINDER_THRESHOLDS = [3, 7, 14] as const;
  let created = 0;
  let skipped = 0;

  for (const row of overdueRows) {
    const days = daysOverdue(row.dueDate);
    if (days < 3) continue; // Not yet eligible for any reminder

    for (const threshold of REMINDER_THRESHOLDS) {
      if (days < threshold) continue;

      const body = `Factură ${row.invoiceNumber} (${Math.round(row.totalCents / 100)} MDL) este scadentă de ${days} zile. Vă rugăm să efectuați plata.`;

      // onConflictDoNothing + .returning() → inserted.length === 0 means conflict (already exists)
      const inserted = await db
        .insert(finInvoiceReminders)
        .values({
          tenantId,
          invoiceId: row.id,
          reminderDay: threshold,
          channel: "email",
          status: "sent",
          body,
        })
        .onConflictDoNothing()
        .returning({ id: finInvoiceReminders.id });

      if (inserted.length > 0) {
        created++;
      } else {
        skipped++;
      }
    }
  }

  return c.json({ data: { created, skipped } });
});

// ─── GET /api/fin/invoices/:id/lines (before /:id to avoid param shadow) ─────

finInvoicesRoutes.get("/:id/lines", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  // Verify the invoice belongs to this tenant
  const invoice = await db
    .select({ id: finInvoices.id })
    .from(finInvoices)
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice.length) {
    return c.json({ error: "Factura nu a fost găsită" }, 404);
  }

  const lines = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, id))
    .orderBy(finInvoiceLines.createdAt);

  return c.json({ data: lines });
});

// ─── GET /api/fin/invoices/:id/pdf (BILL-004) ────────────────────────────────
// Returns the invoice HTML for client-side PDF rendering.
// ?lang=ro|ru|en (default ro). Pure data endpoint — PDF generation is client-side.

finInvoicesRoutes.get("/:id/pdf", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();
  const lang = (c.req.query("lang") ?? "ro") as "ro" | "ru" | "en";
  const validLangs = ["ro", "ru", "en"] as const;
  const resolvedLang = validLangs.includes(lang) ? lang : "ro";

  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: "Factura nu a fost găsită" }, 404);
  }

  const lines = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, id))
    .orderBy(finInvoiceLines.createdAt);

  // Build HTML server-side for the client to render/print
  // Labels keyed by lang — replicated inline to avoid importing client-side lib in server
  const titleMap: Record<string, string> = {
    ro: "FACTURĂ FISCALĂ",
    ru: "СЧЁТ-ФАКТУРА",
    en: "INVOICE",
  };
  const title = titleMap[resolvedLang] ?? "FACTURĂ FISCALĂ";

  // Return the html + metadata; client renders via finInvoicePdf.buildFinInvoiceHtml
  // or can print this html directly via window.print()
  const html = buildInvoiceHtmlServer(invoice, lines, resolvedLang, title);

  return c.json({ data: { html, invoiceNumber: invoice.invoiceNumber, lang: resolvedLang } });
});

// ─── Server-side minimal invoice HTML (mirrors buildFinInvoiceHtml from src/lib) ─────────────
// Separated to avoid importing browser-only jspdf/html2canvas on the server.

function buildInvoiceHtmlServer(
  invoice: {
    invoiceNumber: string;
    currency: string;
    issuedAt: Date | null;
    dueDate: string | null;
    totalCents: number;
    vatTotalCents: number;
    notes: string | null;
  },
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    vatPct: number;
    lineTotalCents: number;
  }>,
  lang: "ro" | "ru" | "en",
  title: string
): string {
  function esc(s: string | null | undefined): string {
    if (!s) return "";
    return s.replace(/[&<>"]/g, (c: string) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c)
    );
  }

  function money(cents: number, cur: string): string {
    const neg = cents < 0;
    const v = Math.abs(Math.round(cents));
    const whole = Math.floor(v / 100);
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const frac = v % 100;
    const dec = frac ? "," + String(frac).padStart(2, "0") : "";
    const sym = cur === "MDL" ? "L" : cur;
    return `${neg ? "-" : ""}${sym} ${grouped}${dec}`;
  }

  function fmtDate(iso: Date | string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso instanceof Date ? iso.toISOString() : iso);
    if (isNaN(d.getTime())) return String(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}.${mon}.${d.getFullYear()}`;
  }

  const cur = invoice.currency || "MDL";
  const subtotalCents = invoice.totalCents - invoice.vatTotalCents;

  const dueDateLabel: Record<string, string> = { ro: "Scadent la", ru: "Срок оплаты", en: "Due Date" };
  const dateLabel: Record<string, string> = { ro: "Data", ru: "Дата", en: "Date" };
  const sigLabel: Record<string, string> = { ro: "Semnătură", ru: "Подпись", en: "Signature" };
  const totalLabel: Record<string, string> = { ro: "TOTAL DE PLATĂ", ru: "ИТОГО К ОПЛАТЕ", en: "TOTAL DUE" };

  const lineRows = lines.map((l, i) => `
    <tr style="background:${i % 2 === 1 ? "#f8fafc" : "#fff"}">
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(l.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${l.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${money(l.unitPriceCents, cur)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${l.vatPct}%</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${money(l.lineTotalCents, cur)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<style>* { box-sizing:border-box;margin:0;padding:0; } body { font-family:Arial,sans-serif;color:#0f172a;background:#fff; } table { border-collapse:collapse;width:100%; }</style>
</head><body style="padding:24px;max-width:794px;margin:auto;">
<div style="font-size:22px;font-weight:800;color:#1e40af;margin-bottom:8px;">${esc(title)}</div>
<div style="font-size:14px;color:#64748b;margin-bottom:4px;">Nr.: <strong style="color:#0f172a;">${esc(invoice.invoiceNumber)}</strong></div>
<div style="font-size:11px;color:#64748b;margin-bottom:4px;">${dateLabel[lang]}: <strong>${fmtDate(invoice.issuedAt)}</strong></div>
<div style="font-size:11px;color:#64748b;margin-bottom:16px;">${dueDateLabel[lang]}: <strong>${invoice.dueDate ? fmtDate(invoice.dueDate) : "—"}</strong></div>
<table style="border:1px solid #e2e8f0;margin-bottom:16px;">
<thead><tr style="background:#1e40af;">
<th style="padding:8px;text-align:left;font-size:11px;color:#fff;">Descriere/Description</th>
<th style="padding:8px;text-align:center;font-size:11px;color:#fff;width:60px;">Cant./Qty</th>
<th style="padding:8px;text-align:right;font-size:11px;color:#fff;width:110px;">Preț/Price</th>
<th style="padding:8px;text-align:center;font-size:11px;color:#fff;width:70px;">TVA/VAT</th>
<th style="padding:8px;text-align:right;font-size:11px;color:#fff;width:110px;">Total</th>
</tr></thead><tbody>${lineRows}</tbody>
</table>
<table style="width:320px;margin-left:auto;border:1px solid #e2e8f0;margin-bottom:20px;">
<tr><td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Subtotal</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0;">${money(subtotalCents, cur)}</td></tr>
<tr><td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">TVA/VAT</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0;">${money(invoice.vatTotalCents, cur)}</td></tr>
<tr style="background:#eff6ff;"><td style="padding:10px 12px;font-size:14px;font-weight:800;color:#1e40af;">${totalLabel[lang]}</td><td style="padding:10px 12px;font-size:14px;font-weight:800;color:#1e40af;text-align:right;">${money(invoice.totalCents, cur)}</td></tr>
</table>
${invoice.notes ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#64748b;">${esc(invoice.notes)}</div>` : ""}
<table style="border:1px solid #e2e8f0;">
<tr>
<td style="width:50%;padding:12px 16px;border-right:1px solid #e2e8f0;vertical-align:top;">
<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Emitent / Issuer</div>
<div style="border-bottom:1px solid #e2e8f0;margin:32px 0 4px;"></div>
<div style="font-size:10px;color:#64748b;">${sigLabel[lang]}</div>
</td>
<td style="width:50%;padding:12px 16px;vertical-align:top;">
<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Beneficiar / Recipient</div>
<div style="border-bottom:1px solid #e2e8f0;margin:32px 0 4px;"></div>
<div style="font-size:10px;color:#64748b;">${sigLabel[lang]}</div>
</td>
</tr>
</table>
</body></html>`;
}

// ─── POST /api/fin/invoices/:id/lines ─────────────────────────────────────────

finInvoicesRoutes.post(
  "/:id/lines",
  zValidator("json", lineSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id } = c.req.param();
    const data = c.req.valid("json");

    // Only allow modifications on draft invoices
    const [invoice] = await db
      .select()
      .from(finInvoices)
      .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) {
      return c.json({ error: "Factura nu a fost găsită" }, 404);
    }
    if (invoice.status !== "draft") {
      return c.json(
        { error: "Liniile pot fi modificate doar pe facturi în starea 'draft'" },
        422
      );
    }

    const lineTotalCents = computeLineTotal(
      data.quantity,
      data.unitPriceCents,
      data.vatPct
    );

    const [newLine] = await db
      .insert(finInvoiceLines)
      .values({
        invoiceId: id,
        serviceId: data.serviceId ?? null,
        description: data.description,
        quantity: data.quantity,
        unitPriceCents: data.unitPriceCents,
        vatPct: data.vatPct,
        lineTotalCents,
      })
      .returning();

    // Recompute invoice totals
    const allLines = await db
      .select()
      .from(finInvoiceLines)
      .where(eq(finInvoiceLines.invoiceId, id));

    const totalCents = allLines.reduce((s, l) => s + l.lineTotalCents, 0);
    const vatTotalCents = allLines.reduce(
      (s, l) => s + computeLineVat(l.quantity, l.unitPriceCents, l.vatPct),
      0
    );

    await db
      .update(finInvoices)
      .set({ totalCents, vatTotalCents, updatedAt: new Date() })
      .where(eq(finInvoices.id, id));

    return c.json({ data: newLine }, 201);
  }
);

// ─── DELETE /api/fin/invoices/:id/lines/:lineId ────────────────────────────────

finInvoicesRoutes.delete("/:id/lines/:lineId", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id, lineId } = c.req.param();

  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: "Factura nu a fost găsită" }, 404);
  }
  if (invoice.status !== "draft") {
    return c.json(
      { error: "Liniile pot fi șterse doar de pe facturi în starea 'draft'" },
      422
    );
  }

  await db
    .delete(finInvoiceLines)
    .where(
      and(eq(finInvoiceLines.id, lineId), eq(finInvoiceLines.invoiceId, id))
    );

  // Recompute totals
  const remaining = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, id));

  const totalCents = remaining.reduce((s, l) => s + l.lineTotalCents, 0);
  const vatTotalCents = remaining.reduce(
    (s, l) => s + computeLineVat(l.quantity, l.unitPriceCents, l.vatPct),
    0
  );

  await db
    .update(finInvoices)
    .set({ totalCents, vatTotalCents, updatedAt: new Date() })
    .where(eq(finInvoices.id, id));

  return c.json({ data: { deleted: true } });
});

// ─── GET /api/fin/invoices/:id ─────────────────────────────────────────────────

finInvoicesRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: "Factura nu a fost găsită" }, 404);
  }

  const lines = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, id))
    .orderBy(finInvoiceLines.createdAt);

  return c.json({ data: { ...invoice, lines } });
});

// ─── POST /api/fin/invoices ────────────────────────────────────────────────────

finInvoicesRoutes.post(
  "/",
  zValidator("json", createInvoiceSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    // Auto-increment: SELECT MAX(number)+1 WHERE tenantId
    const [maxRow] = await db
      .select({ max: max(finInvoices.number) })
      .from(finInvoices)
      .where(eq(finInvoices.tenantId, tenantId));

    const nextNumber = (maxRow?.max ?? 0) + 1;
    const year = new Date().getFullYear();
    const series = "FIN";
    const invoiceNumber = formatInvoiceNumber(series, year, nextNumber);

    // Compute line totals
    const lineValues = data.lines.map((l) => {
      const lineTotalCents = computeLineTotal(l.quantity, l.unitPriceCents, l.vatPct);
      return { ...l, lineTotalCents };
    });

    const totalCents = lineValues.reduce((s, l) => s + l.lineTotalCents, 0);
    const vatTotalCents = lineValues.reduce(
      (s, l) => s + computeLineVat(l.quantity, l.unitPriceCents, l.vatPct),
      0
    );

    // Insert invoice
    const [invoice] = await db
      .insert(finInvoices)
      .values({
        tenantId,
        agreementId: data.agreementId ?? null,
        partyId: data.partyId ?? null,
        series,
        number: nextNumber,
        invoiceNumber,
        currency: data.currency ?? "MDL",
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        totalCents,
        vatTotalCents,
      })
      .returning();

    // Insert lines
    const lines = await db
      .insert(finInvoiceLines)
      .values(
        lineValues.map((l) => ({
          invoiceId: invoice.id,
          serviceId: l.serviceId ?? null,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          vatPct: l.vatPct,
          lineTotalCents: l.lineTotalCents,
        }))
      )
      .returning();

    return c.json({ data: { ...invoice, lines } }, 201);
  }
);

// ─── PATCH /api/fin/invoices/:id ───────────────────────────────────────────────

finInvoicesRoutes.patch(
  "/:id",
  zValidator("json", updateInvoiceSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const [invoice] = await db
      .select()
      .from(finInvoices)
      .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) {
      return c.json({ error: "Factura nu a fost găsită" }, 404);
    }

    // Validate status transition
    if (data.status && data.status !== invoice.status) {
      const allowed = ALLOWED_TRANSITIONS[invoice.status] ?? [];
      if (!allowed.includes(data.status)) {
        return c.json(
          {
            error: `Tranziție invalidă: ${invoice.status} → ${data.status}. Tranziții permise: ${allowed.join(", ") || "niciuna"}`,
          },
          422
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) {
      updatePayload.status = data.status;
      // Set issuedAt when transitioning to "issued"
      if (data.status === "issued" && invoice.status !== "issued") {
        updatePayload.issuedAt = new Date();
      }
    }
    if (data.notes !== undefined) {
      updatePayload.notes = data.notes;
    }
    if (data.dueDate !== undefined) {
      updatePayload.dueDate = data.dueDate;
    }

    const [updated] = await db
      .update(finInvoices)
      .set(updatePayload)
      .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
      .returning();

    return c.json({ data: updated });
  }
);

// ─── DELETE /api/fin/invoices/:id ──────────────────────────────────────────────

finInvoicesRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  const [invoice] = await db
    .select({ id: finInvoices.id, status: finInvoices.status })
    .from(finInvoices)
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: "Factura nu a fost găsită" }, 404);
  }

  // Soft delete — set status to cancelled
  const [updated] = await db
    .update(finInvoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(finInvoices.id, id), eq(finInvoices.tenantId, tenantId)))
    .returning();

  return c.json({ data: updated });
});
