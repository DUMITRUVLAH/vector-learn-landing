/**
 * VF-505: 3-way match — the control that gates payment in procure-to-pay.
 * Compares PO ↔ receipt ↔ payment amount for a PAR.
 *
 *   poExists       — a purchase order has been issued for this PAR.
 *   fullyReceived  — every line is fully received (sum qtyReceived >= ordered), OR a receipt with
 *                    complete=true exists.
 *   amountMatches  — the (proposed) payment amount is within the PO total ± 10% (reuses the overage
 *                    rule). When no amount is supplied, this checks the PAR estimate against the PO.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parRequests, parLineItems, parPurchaseOrders, parReceipts, parReceiptLines,
} from "../../db/schema/par";

export interface MatchResult {
  poExists: boolean;
  fullyReceived: boolean;
  amountMatches: boolean;
  ok: boolean;
  issues: string[];
}

const OVERAGE_TOLERANCE = 0.1; // ±10%, same as the payment overage rule

export async function evaluateMatch(
  parId: string,
  tenantId: string,
  proposedAmountCents?: number
): Promise<MatchResult> {
  const issues: string[] = [];

  const [par] = await db
    .select({ total: parRequests.totalEstimatedCents })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  // PO
  const [po] = await db
    .select({ totalCents: parPurchaseOrders.totalCents })
    .from(parPurchaseOrders)
    .where(and(eq(parPurchaseOrders.parId, parId), eq(parPurchaseOrders.tenantId, tenantId)));
  const poExists = !!po;
  if (!poExists) issues.push("Lipsește comanda de achiziție (PO).");

  // Receipt: a complete=true receipt, or full quantities across all lines.
  const receipts = await db
    .select({ id: parReceipts.id, complete: parReceipts.complete })
    .from(parReceipts)
    .where(and(eq(parReceipts.parId, parId), eq(parReceipts.tenantId, tenantId)));
  let fullyReceived = receipts.some((r) => r.complete);
  if (!fullyReceived && receipts.length > 0) {
    // Sum received per line and compare to ordered.
    const lines = await db
      .select({ id: parLineItems.id, qty: parLineItems.quantity })
      .from(parLineItems)
      .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)));
    const recLines = await db
      .select({ lineItemId: parReceiptLines.lineItemId, qtyReceived: parReceiptLines.qtyReceived })
      .from(parReceiptLines)
      .where(and(eq(parReceiptLines.tenantId, tenantId), inArray(parReceiptLines.receiptId, receipts.map((r) => r.id))));
    const receivedBy = new Map<string, number>();
    for (const rl of recLines) receivedBy.set(rl.lineItemId, (receivedBy.get(rl.lineItemId) ?? 0) + rl.qtyReceived);
    fullyReceived = lines.length > 0 && lines.every((l) => (receivedBy.get(l.id) ?? 0) >= l.qty);
  }
  if (!fullyReceived) issues.push("Recepția nu este completă.");

  // Amount: proposed payment (or PAR estimate) within PO ± 10%.
  let amountMatches = true;
  if (poExists) {
    const amount = proposedAmountCents ?? par?.total ?? 0;
    const max = po.totalCents * (1 + OVERAGE_TOLERANCE);
    amountMatches = amount <= max;
    if (!amountMatches) issues.push("Suma depășește comanda cu peste 10%.");
  } else {
    amountMatches = false; // can't match an amount without a PO
  }

  const ok = poExists && fullyReceived && amountMatches;
  return { poExists, fullyReceived, amountMatches, ok, issues };
}
