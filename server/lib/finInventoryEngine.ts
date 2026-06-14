/**
 * INVENTORY-001: Motor Cost Mediu Ponderat (CMP / WAC)
 * Standard: SNC 2 Moldova
 *
 * Formula CMP la intrare:
 *   new_avg = (old_qty × old_avg + qty_in × unit_cost) / (old_qty + qty_in)
 *
 * La ieșire: stocul scade, costul mediu ponderat rămâne neschimbat.
 * Valoarea ieșirii = qty × avg_cost_cents (coste la CMP din momentul ieșirii).
 */

export interface AvgCostInput {
  /** Cantitate curentă în stoc (înainte de intrare) */
  oldQty: number;
  /** Cost mediu ponderat curent, în MDL cents */
  oldAvgCostCents: number;
  /** Cantitate intrată acum */
  qtyIn: number;
  /** Cost unitar al intrării, în MDL cents */
  unitCostCents: number;
}

export interface AvgCostResult {
  /** Noul cost mediu ponderat, în MDL cents (integer — rotunjit la cent) */
  newAvgCostCents: number;
  /** Noua cantitate totală în stoc */
  newQtyOnHand: number;
  /** Valoarea totală a intrării (pentru înregistrarea mișcării) */
  entryTotalCostCents: number;
}

/**
 * Calculează noul cost mediu ponderat după o intrare (purchase / transfer_in).
 *
 * Edge cases:
 * - Dacă oldQty = 0 (primul lot sau stoc epuizat) → avg = unitCostCents.
 * - Dacă qtyIn = 0 → returnează valorile existente neschimbate.
 * - Utilizează integer division (Math.floor) pentru compatibilitate cu BigInt / PGlite.
 */
export function calculateAvgCost(input: AvgCostInput): AvgCostResult {
  const { oldQty, oldAvgCostCents, qtyIn, unitCostCents } = input;

  if (qtyIn <= 0) {
    return {
      newAvgCostCents: oldAvgCostCents,
      newQtyOnHand: oldQty,
      entryTotalCostCents: 0,
    };
  }

  const entryTotalCostCents = qtyIn * unitCostCents;
  const newQtyOnHand = oldQty + qtyIn;

  let newAvgCostCents: number;
  if (oldQty <= 0) {
    // Primul lot sau stoc zero → costul mediu devine costul intrării
    newAvgCostCents = unitCostCents;
  } else {
    // Formula CMP: (stoc_vechi × cost_mediu_vechi + cantitate_intrare × cost_unitar) / stoc_nou
    newAvgCostCents = Math.floor(
      (oldQty * oldAvgCostCents + entryTotalCostCents) / newQtyOnHand
    );
  }

  return {
    newAvgCostCents,
    newQtyOnHand,
    entryTotalCostCents,
  };
}

/**
 * Calculează valoarea la cost mediu ponderat pentru o ieșire din stoc.
 * Returnează și validează că stocul disponibil este suficient.
 */
export type ExitCostResult =
  | { ok: true; totalCostCents: number; unitCostCents: number; remainingQty: number }
  | { ok: false; error: "insufficient_stock"; available: number; requested: number };

export function calculateExitCost(
  currentQty: number,
  avgCostCents: number,
  qtyOut: number
): ExitCostResult {
  if (qtyOut > currentQty) {
    return {
      ok: false,
      error: "insufficient_stock",
      available: currentQty,
      requested: qtyOut,
    };
  }

  return {
    ok: true,
    unitCostCents: avgCostCents,
    totalCostCents: qtyOut * avgCostCents,
    remainingQty: currentQty - qtyOut,
  };
}

/** Tipurile de mișcare care cresc stocul (→ recalculează CMP) */
export const INBOUND_TYPES = new Set(["purchase", "transfer_in", "adjustment"]);

/** Tipurile de mișcare care scad stocul */
export const OUTBOUND_TYPES = new Set(["sale", "transfer_out"]);

/**
 * Returnează true dacă mișcarea crește stocul (și trebuie recalculat CMP).
 * adjustment poate fi și negativ — este gestionat la nivel de route prin qty semn.
 */
export function isInbound(movementType: string): boolean {
  return movementType === "purchase" || movementType === "transfer_in";
}

/**
 * Returnează true dacă mișcarea scade stocul.
 */
export function isOutbound(movementType: string): boolean {
  return movementType === "sale" || movementType === "transfer_out";
}
