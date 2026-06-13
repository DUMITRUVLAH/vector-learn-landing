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
