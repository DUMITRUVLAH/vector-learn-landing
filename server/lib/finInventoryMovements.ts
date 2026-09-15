/**
 * Înregistrarea unei mișcări de stoc: scrie în `fin_stock_movements` și mută
 * `fin_inventory_items.qty_on_hand`, într-un singur loc, pentru toți apelanții care mișcă
 * un articol o dată. (Cârligele de lot din `server/routes/finInventory.ts` —
 * `/hook/invoice-issued`, `/hook/purchase` — își păstrează bucla proprie, fiindcă
 * validează întâi TOATE liniile și abia apoi scriu: „toate sau niciuna".)
 *
 * De ce a fost scos din rută: de la CRM Faza 9, stocul se scade și automat, când o
 * oportunitate intră în etapa „câștigat" (server/lib/crm/productStock.ts). Dacă fiecare
 * apelant și-ar scrie propria mișcare, formula costului mediu ponderat ar exista în două
 * copii care se pot desincroniza — exact felul de divergență care face ca stocul din
 * ofertare să nu mai corespundă cu cel din contabilitate.
 *
 * Matematica pură (CMP, cost de ieșire, direcția mișcării) rămâne în
 * `server/lib/finInventoryEngine.ts`. Aici e doar orchestrarea: citește articolul,
 * calculează, scrie mișcarea, actualizează articolul.
 *
 * Erorile de business se ÎNTORC, nu se aruncă: apelantul decide dacă un stoc insuficient
 * e un 422 (mișcare manuală, rutele FinDesk) sau doar un avertisment care nu are voie să
 * blocheze acțiunea comercială (câștigarea unui lead).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { finInventoryItems, finStockMovements, type FinStockMovement } from "../db/schema";
import { calculateAvgCost, calculateExitCost, isInbound, isOutbound } from "./finInventoryEngine";

export interface RecordMovementInput {
  tenantId: string;
  itemId: string;
  movementType: "purchase" | "sale" | "adjustment" | "transfer_in" | "transfer_out";
  /** Pozitivă pentru intrări/ieșiri (tipul dă direcția). La `adjustment` poate fi și negativă. */
  qty: number;
  unitCostCents?: number;
  invoiceId?: string | null;
  reference?: string | null;
  notes?: string | null;
  branchId?: string | null;
  movedBy?: string | null;
}

export type RecordMovementResult =
  | { ok: true; movement: FinStockMovement; newQtyOnHand: number; newAvgCostCents: number }
  | { ok: false; error: "item_not_found" }
  | { ok: false; error: "insufficient_stock"; available: number; requested: number };

export async function recordStockMovement(input: RecordMovementInput): Promise<RecordMovementResult> {
  const [item] = await db
    .select()
    .from(finInventoryItems)
    .where(and(eq(finInventoryItems.id, input.itemId), eq(finInventoryItems.tenantId, input.tenantId)));

  if (!item) return { ok: false, error: "item_not_found" };

  const requestedCost = input.unitCostCents ?? 0;
  let unitCostCents = requestedCost;
  let totalCostCents = 0;
  let newAvgCostCents = item.avgCostCents;
  let newQtyOnHand = item.qtyOnHand;

  // `adjustment` e și „inbound" în motor (poate adăuga), dar are reguli proprii: nu recalculează
  // CMP și acceptă cantitate negativă. De aceea se verifică ÎNAINTEA lui isInbound.
  if (input.movementType === "adjustment") {
    const afterAdj = item.qtyOnHand + input.qty;
    if (afterAdj < 0) {
      return { ok: false, error: "insufficient_stock", available: item.qtyOnHand, requested: Math.abs(input.qty) };
    }
    newQtyOnHand = afterAdj;
    totalCostCents = input.qty * item.avgCostCents;
  } else if (isInbound(input.movementType)) {
    const result = calculateAvgCost({
      oldQty: item.qtyOnHand,
      oldAvgCostCents: item.avgCostCents,
      qtyIn: input.qty,
      unitCostCents: requestedCost,
    });
    newAvgCostCents = result.newAvgCostCents;
    newQtyOnHand = result.newQtyOnHand;
    totalCostCents = result.entryTotalCostCents;
  } else if (isOutbound(input.movementType)) {
    const result = calculateExitCost(item.qtyOnHand, item.avgCostCents, input.qty);
    if (!result.ok) {
      return { ok: false, error: "insufficient_stock", available: result.available, requested: result.requested };
    }
    unitCostCents = result.unitCostCents;
    totalCostCents = result.totalCostCents;
    newQtyOnHand = result.remainingQty;
  }

  const [movement] = await db
    .insert(finStockMovements)
    .values({
      tenantId: input.tenantId,
      itemId: input.itemId,
      movementType: input.movementType,
      qty: input.qty,
      unitCostCents,
      totalCostCents,
      invoiceId: input.invoiceId ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      branchId: input.branchId ?? null,
      movedBy: input.movedBy ?? null,
      movedAt: new Date(),
    })
    .returning();

  await db
    .update(finInventoryItems)
    .set({ qtyOnHand: newQtyOnHand, avgCostCents: newAvgCostCents, updatedAt: new Date() })
    .where(eq(finInventoryItems.id, input.itemId));

  return { ok: true, movement, newQtyOnHand, newAvgCostCents };
}
