/**
 * AUTOBILL: the daily recurring-billing engine.
 *
 * For every contract opted into auto-billing (fin_agreements.auto_billing = true) that is active
 * and has services due today, it:
 *   1. generates the invoice (reusing the existing recurring processor — same numbering,
 *      idempotency and next-bill-date advance),
 *   2. submits it to SFS e-Factura (real API when configured, mock otherwise), and
 *   3. emails the PDF to the client.
 * Each step degrades gracefully: a missing IDNO/IBAN/email or an SFS rejection is recorded as a
 * per-contract reason and the run continues to the next contract. Returns a summary.
 *
 * Cross-tenant: the cron passes no tenant, so it processes ALL tenants. A single tenant can be
 * targeted (the "run now" preview/button) by passing tenantId.
 */
import { and, eq, lte, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { finAgreements, finAgreementServices } from "../../db/schema/finAgreements";
import { finSfsSettings } from "../../db/schema/finEinvoices";
import { makeRecurringInvoiceProcessor } from "../finRecurringProcessor";
import { submitInvoiceToSfs } from "./submitInvoiceToSfs";
import { emailInvoiceToClient } from "./emailInvoice";

export interface AutoBillContractOutcome {
  agreementId: string;
  agreementTitle: string;
  tenantId: string;
  /** "billed" | "skipped" | "error" */
  status: "billed" | "skipped" | "error";
  invoiceId?: string;
  einvoice?: { ok: boolean; reason?: string; sfsStatus?: string };
  email?: { ok: boolean; reason?: string; to?: string };
  reason?: string;
}

export interface AutoBillSummary {
  processed: number;
  billed: number;
  skipped: number;
  errors: number;
  outcomes: AutoBillContractOutcome[];
}

/** YYYY-MM for `now` — the billing period the recurring processor dedupes on. */
function periodOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function runAutoBilling(opts: { tenantId?: string; now?: Date } = {}): Promise<AutoBillSummary> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const period = periodOf(now);

  // Candidate contracts: auto_billing + active (+ tenant scope when given).
  const whereActive = opts.tenantId
    ? and(eq(finAgreements.autoBilling, true), eq(finAgreements.status, "active"), eq(finAgreements.tenantId, opts.tenantId))
    : and(eq(finAgreements.autoBilling, true), eq(finAgreements.status, "active"));
  const agreements = await db.select().from(finAgreements).where(whereActive);

  const outcomes: AutoBillContractOutcome[] = [];

  // Only bill contracts that actually have a service due today (avoids empty invoices).
  const dueAgreementIds = new Set<string>();
  if (agreements.length > 0) {
    const dueServices = await db
      .select({ agreementId: finAgreementServices.agreementId })
      .from(finAgreementServices)
      .where(
        and(
          inArray(finAgreementServices.agreementId, agreements.map((a) => a.id)),
          eq(finAgreementServices.isActive, true),
          lte(finAgreementServices.nextBillDate, today),
        ),
      );
    for (const s of dueServices) dueAgreementIds.add(s.agreementId);
  }

  // Cache SFS supplier name per tenant for the email.
  const supplierNameByTenant = new Map<string, string>();

  for (const agreement of agreements) {
    if (!dueAgreementIds.has(agreement.id)) continue; // nothing due → not processed

    const outcome: AutoBillContractOutcome = {
      agreementId: agreement.id,
      agreementTitle: agreement.title,
      tenantId: agreement.tenantId,
      status: "skipped",
    };

    try {
      // 1. Generate the invoice via the existing processor (includeEinv:false — we submit for real below).
      const processor = makeRecurringInvoiceProcessor(agreement.tenantId, { period, includeEinv: false });
      const gen = await processor({ id: agreement.id, externalRef: agreement.id });

      if ("error" in gen && gen.error) {
        outcome.status = "error";
        outcome.reason = gen.error;
        outcomes.push(outcome);
        continue;
      }
      if ("skip" in gen && gen.skip) {
        outcome.status = "skipped";
        outcome.reason = "no_due_services_or_already_billed";
        outcomes.push(outcome);
        continue;
      }
      const invoiceId = "ref" in gen ? gen.ref : undefined;
      if (!invoiceId) {
        outcome.status = "skipped";
        outcome.reason = "no_invoice_created";
        outcomes.push(outcome);
        continue;
      }
      outcome.invoiceId = invoiceId;
      outcome.status = "billed";

      // 2. Submit to SFS (real when configured; helper handles mock + missing IDNO/IBAN).
      const einv = await submitInvoiceToSfs(agreement.tenantId, invoiceId);
      outcome.einvoice = { ok: einv.ok, reason: einv.reason, sfsStatus: einv.sfsStatus };

      // 3. Email the PDF to the client.
      if (!supplierNameByTenant.has(agreement.tenantId)) {
        const [sfs] = await db
          .select({ idno: finSfsSettings.idno })
          .from(finSfsSettings)
          .where(eq(finSfsSettings.tenantId, agreement.tenantId))
          .limit(1);
        supplierNameByTenant.set(agreement.tenantId, sfs?.idno ? `Furnizor IDNO ${sfs.idno}` : "Furnizor");
      }
      const email = await emailInvoiceToClient(agreement.tenantId, invoiceId, {
        supplierName: supplierNameByTenant.get(agreement.tenantId),
      });
      outcome.email = { ok: email.ok, reason: email.reason, to: email.to };

      // Stamp the contract so the UI can show "last auto-billed".
      await db
        .update(finAgreements)
        .set({ autoBilledAt: now, updatedAt: now })
        .where(eq(finAgreements.id, agreement.id));
    } catch (err) {
      outcome.status = "error";
      outcome.reason = err instanceof Error ? err.message : String(err);
    }
    outcomes.push(outcome);
  }

  return {
    processed: outcomes.length,
    billed: outcomes.filter((o) => o.status === "billed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    errors: outcomes.filter((o) => o.status === "error").length,
    outcomes,
  };
}
