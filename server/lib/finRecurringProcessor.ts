// MASS-002: FinDesk Recurring Invoices Processor
// Processes one fin_bulk_rows entry: agreement → fin_invoice + fin_invoice_lines + optional fin_einvoice.
// FIN-CORE §1.15: bulk orchestration layer on top of AGREEMENT/BILL/EINV modules.
// No raw .execute().rows — all queries use Drizzle query builder.

import { and, eq, gte, lt, max, desc } from "drizzle-orm";
import { db } from "../db/client";
import { finAgreements, finAgreementServices } from "../db/schema/finAgreements";
import { finInvoices, finInvoiceLines } from "../db/schema/finInvoices";
import { finEinvoices, finSfsSettings } from "../db/schema/finEinvoices";
import type { ProcessorResult } from "./finBulkRunner";

/**
 * Parameters for the recurring invoices processor.
 * Stored in fin_bulk_jobs.meta.
 */
export interface RecurringJobMeta {
  /** Format: YYYY-MM (e.g. "2026-06") — the billing period */
  period: string;
  /** Whether to also submit e-Factura to SFS after creating the invoice */
  includeEinv: boolean;
}

/**
 * Parses YYYY-MM into the start/end of that calendar month.
 */
function parsePeriod(period: string): { start: Date; end: Date } {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // exclusive
  return { start, end };
}

/**
 * Computes next billing date based on recurrence period.
 * monthly: +1 month, quarterly: +3 months, yearly: +12 months.
 */
function nextBillDate(
  current: string | Date,
  recurrencePeriod: "monthly" | "quarterly" | "yearly"
): Date {
  const d = new Date(current);
  switch (recurrencePeriod) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

/**
 * Formats a Date as YYYY-MM-DD string (ISO date only).
 */
function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Gets the next invoice number for a tenant.
 * Idempotent: always = MAX(number) + 1, never reuses.
 * FIN-CORE Rule: auto-numbering per tenant series.
 */
async function getNextInvoiceNumber(tenantId: string): Promise<number> {
  const result = await db
    .select({ maxNum: max(finInvoices.number) })
    .from(finInvoices)
    .where(eq(finInvoices.tenantId, tenantId));

  return (result[0]?.maxNum ?? 0) + 1;
}

/**
 * Creates a recurring invoice processor for a given job meta.
 *
 * @param tenantId Tenant scope (from the job)
 * @param meta Job-specific parameters (period, includeEinv)
 * @returns A RowProcessor compatible with runBulkJob
 */
export function makeRecurringInvoiceProcessor(
  tenantId: string,
  meta: RecurringJobMeta
) {
  const { period, includeEinv } = meta;
  const { start: periodStart, end: periodEnd } = parsePeriod(period);
  const [periodYear, periodMonth] = period.split("-").map(Number);

  return async (
    row: { id: string; externalRef: string | null }
  ): Promise<ProcessorResult> => {
    const agreementId = row.externalRef;
    if (!agreementId) {
      return { error: "Missing agreement ID in external_ref" };
    }

    // 1. Fetch agreement
    const agreement = await db.query.finAgreements.findFirst({
      where: and(
        eq(finAgreements.id, agreementId),
        eq(finAgreements.tenantId, tenantId)
      ),
    });

    if (!agreement) {
      return { error: `Agreement ${agreementId} not found or wrong tenant` };
    }

    if (agreement.status !== "active") {
      return { error: `Agreement ${agreementId} is not active (status=${agreement.status})` };
    }

    // 2. Fetch services for this agreement that are due
    const services = await db
      .select()
      .from(finAgreementServices)
      .where(
        and(
          eq(finAgreementServices.agreementId, agreementId),
          eq(finAgreementServices.isActive, true)
        )
      );

    const dueServices = services.filter((s) => {
      if (!s.nextBillDate) return false;
      const nbDate = new Date(s.nextBillDate);
      return nbDate <= new Date(); // due today or past
    });

    if (dueServices.length === 0) {
      return { skip: true, ref: agreementId + ":no_due_services" };
    }

    // 3. Idempotency check: has this agreement already been invoiced for this period?
    const existingInvoice = await db
      .select({ id: finInvoices.id })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, tenantId),
          eq(finInvoices.agreementId, agreementId),
          gte(finInvoices.createdAt, periodStart),
          lt(finInvoices.createdAt, periodEnd)
        )
      )
      .limit(1);

    if (existingInvoice.length > 0) {
      return { skip: true, ref: existingInvoice[0].id };
    }

    // 4. Compute totals
    let totalCents = 0;
    let vatTotalCents = 0;

    const linesToInsert = dueServices.map((s) => {
      const lineNet = s.unitPriceCents * s.quantity;
      const lineVat = Math.round(lineNet * s.vatPct / 100);
      const lineTotal = lineNet + lineVat;
      totalCents += lineTotal;
      vatTotalCents += lineVat;

      return {
        description: s.name,
        quantity: s.quantity,
        unitPriceCents: s.unitPriceCents,
        vatPct: s.vatPct,
        lineTotalCents: lineTotal,
        serviceId: s.id,
      };
    });

    // 5. Create invoice
    const invoiceNumber = await getNextInvoiceNumber(tenantId);
    const invoiceNumberStr = `FIN-${periodYear}-${String(invoiceNumber).padStart(4, "0")}`;

    const [newInvoice] = await db
      .insert(finInvoices)
      .values({
        tenantId,
        agreementId,
        partyId: agreement.partyId,
        series: "FIN",
        number: invoiceNumber,
        invoiceNumber: invoiceNumberStr,
        status: "issued",
        currency: agreement.currency,
        issuedAt: new Date(),
        dueDate: toISODate(
          new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
        ),
        totalCents,
        vatTotalCents,
        notes: `Factură recurentă ${period} — ${agreement.title}`,
      })
      .returning();

    // 6. Insert lines
    await db.insert(finInvoiceLines).values(
      linesToInsert.map((l) => ({
        invoiceId: newInvoice.id,
        serviceId: l.serviceId,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        vatPct: l.vatPct,
        lineTotalCents: l.lineTotalCents,
      }))
    );

    // 7. Update service billing dates
    for (const s of dueServices) {
      if (s.recurrencePeriod) {
        const nextDate = nextBillDate(
          s.nextBillDate ?? new Date(),
          s.recurrencePeriod as "monthly" | "quarterly" | "yearly"
        );
        await db
          .update(finAgreementServices)
          .set({
            lastBilledAt: new Date(),
            nextBillDate: toISODate(nextDate),
            updatedAt: new Date(),
          })
          .where(eq(finAgreementServices.id, s.id));
      }
    }

    // 8. Optional: create e-Factura SFS record
    if (includeEinv) {
      try {
        // Check SFS settings for this tenant
        const sfsSettings = await db.query.finSfsSettings.findFirst({
          where: eq(finSfsSettings.tenantId, tenantId),
        });

        const isMockMode = !sfsSettings || sfsSettings.environment === "mock";

        await db.insert(finEinvoices).values({
          tenantId,
          finInvoiceId: newInvoice.id,
          // In mock mode, immediately mark as accepted; in prod, would be 'pending' then polled
          sfsStatus: isMockMode ? "accepted" : "pending",
          submittedAt: isMockMode ? new Date() : null,
          // Mock serial number for demo
          sfsSerialNumber: isMockMode
            ? `MOCK-${Date.now()}`
            : undefined,
          sfsRequestStatus: isMockMode ? 2 : null, // 2 = SUCCESS in mock
        });
      } catch (einvErr) {
        // E-Factura failure is non-blocking for the invoice itself
        // The invoice was created successfully; log einv error in result
        console.warn(
          `[MASS-002] e-Factura creation failed for invoice ${newInvoice.id}:`,
          einvErr
        );
      }
    }

    return { ref: newInvoice.id };
  };
}
