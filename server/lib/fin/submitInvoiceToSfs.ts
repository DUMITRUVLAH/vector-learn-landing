/**
 * AUTOBILL: submit ONE fin_invoice to SFS e-Factura — the single source of truth used by BOTH
 * the manual route (POST /api/fin/einvoices/:id/submit) and the daily auto-billing cron.
 *
 * Extracted from finEinvoices.ts so the auto path is byte-identical to the button a human clicks
 * (§3.5.1quater: no divergent copies). Returns a structured result instead of an HTTP response so
 * it composes anywhere. NEVER throws for expected failures (missing IDNO/IBAN, SFS rejection) —
 * those come back as `{ ok:false, reason }` so the cron can skip-with-reason and keep going.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { finInvoices, finInvoiceLines } from "../../db/schema/finInvoices";
import { finEinvoices } from "../../db/schema/finEinvoices";
import { finParties } from "../../db/schema/finParties";
import { loadSfsConfig } from "./sfsConfig";
import {
  EfacturaMdClient,
  EfacturaMdError,
  generateSfsInvoiceXml,
  createMockTransport,
  type SfsInvoiceLine,
} from "../efacturaMoldova";

export type SubmitReason =
  | "sfs_not_configured"
  | "invoice_not_found"
  | "buyer_idno_missing"
  | "buyer_iban_missing"
  | "invoice_has_no_lines"
  | "xml_generation_failed"
  | "already_submitted"
  | "sfs_submission_failed";

export interface SubmitResult {
  ok: boolean;
  reason?: SubmitReason;
  detail?: string;
  sfsStatus?: string;
  einvoiceId?: string;
  serial?: string | null;
  /** true when the invoice already had a non-pending e-Factura (idempotent no-op). */
  alreadyDone?: boolean;
}

export async function submitInvoiceToSfs(tenantId: string, invoiceId: string): Promise<SubmitResult> {
  const sfsData = await loadSfsConfig(tenantId);
  if (!sfsData) return { ok: false, reason: "sfs_not_configured" };
  const { config } = sfsData;

  const existing = await db
    .select()
    .from(finEinvoices)
    .where(and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, tenantId)))
    .limit(1);

  if (existing.length > 0 && existing[0].sfsStatus !== "pending") {
    return { ok: true, alreadyDone: true, sfsStatus: existing[0].sfsStatus, einvoiceId: existing[0].id };
  }

  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, invoiceId), eq(finInvoices.tenantId, tenantId)))
    .limit(1);
  if (!invoice) return { ok: false, reason: "invoice_not_found" };

  let buyerIdno = "";
  let buyerBankAccount: string | undefined;
  if (invoice.partyId) {
    const [party] = await db
      .select()
      .from(finParties)
      .where(and(eq(finParties.id, invoice.partyId), eq(finParties.tenantId, tenantId)))
      .limit(1);
    buyerIdno = party?.idno ?? "";
    buyerBankAccount = party?.iban ?? undefined;
  }
  if (!buyerIdno) {
    return { ok: false, reason: "buyer_idno_missing", detail: "Factura nu are un cumpărător cu IDNO." };
  }
  // SFS requires the buyer bank account (Buyer/BankAccount) or PostInvoices throws a .NET null-ref.
  if (!buyerBankAccount) {
    return {
      ok: false,
      reason: "buyer_iban_missing",
      detail:
        "Cumpărătorul nu are cont bancar (IBAN) completat. SFS îl cere obligatoriu. " +
        "Adaugă IBAN-ul partenerului în fișa lui, apoi retrimite.",
    };
  }

  const lineRows = await db.select().from(finInvoiceLines).where(eq(finInvoiceLines.invoiceId, invoiceId));
  if (lineRows.length === 0) return { ok: false, reason: "invoice_has_no_lines" };

  const lines: SfsInvoiceLine[] = lineRows.map((l, i) => ({
    code: l.serviceId ?? String(i + 1),
    name: l.description,
    unitOfMeasure: "buc",
    quantity: l.quantity,
    unitPriceWithoutVat: l.unitPriceCents / 100,
    vatRate: l.vatPct,
  }));

  const now = new Date();
  let xml: string;
  try {
    xml = generateSfsInvoiceXml({
      supplierIdno: config.supplierIdno,
      supplierBankAccount: config.supplierBankAccount,
      buyerIdno,
      buyerBankAccount,
      deliveryDate: invoice.issuedAt ?? now,
      internalId: invoiceId,
      lines,
    });
  } catch (err) {
    return { ok: false, reason: "xml_generation_failed", detail: err instanceof Error ? err.message : String(err) };
  }

  const transport = config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(config, transport);

  try {
    const result = await client.postInvoices(xml, randomUUID());
    let sfsSerialNumber: string | null = null;
    let sfsNumber: string | null = null;
    if (!result.errorMessage) {
      try {
        const found = await client.searchByApiInvoiceId(invoiceId, randomUUID());
        if (found) {
          sfsSerialNumber = found.seria || null;
          sfsNumber = found.number || null;
        }
      } catch {
        /* reconciliation may lag; don't fail the submit */
      }
    }

    if (existing.length > 0) {
      await db
        .update(finEinvoices)
        .set({
          sfsStatus: "sent",
          sfsSerialNumber,
          sfsInvoiceId: sfsNumber,
          sfsRequestStatus: result.status,
          sfsErrorMessage: result.errorMessage,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(finEinvoices.id, existing[0].id));
    } else {
      await db.insert(finEinvoices).values({
        tenantId,
        finInvoiceId: invoiceId,
        sfsStatus: "sent",
        sfsSerialNumber,
        sfsInvoiceId: sfsNumber,
        sfsRequestStatus: result.status,
        sfsErrorMessage: result.errorMessage,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [row] = await db
      .select()
      .from(finEinvoices)
      .where(and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, tenantId)))
      .limit(1);
    return { ok: true, sfsStatus: "sent", einvoiceId: row?.id, serial: sfsSerialNumber };
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    if (existing.length > 0) {
      await db
        .update(finEinvoices)
        .set({ sfsStatus: "pending", sfsErrorMessage: msg, updatedAt: now })
        .where(eq(finEinvoices.id, existing[0].id));
    } else {
      await db.insert(finEinvoices).values({
        tenantId,
        finInvoiceId: invoiceId,
        sfsStatus: "pending",
        sfsErrorMessage: msg,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: false, reason: "sfs_submission_failed", detail: msg };
  }
}
