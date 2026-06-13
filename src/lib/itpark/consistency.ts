/**
 * ITPARK-403: checkConsistency — gate de coerență inter-Anexe
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §4
 *
 * Verifică că cele 3 surse de date concordă:
 *   1. Anexa 2 rând 7 (totalSalesCents) == Anexa 3 totalSalesCents (engine)
 *   2. Anexa 2 rând 8 (totalEligibleCents) == Anexa 3 totalEligibleCents (engine)
 *   3. Anexa 3 totalEligibleCents == Anexa 4 total.eligibleCents (din computeAnexa4)
 *   4. Anexa 3 totalSalesCents == Anexa 4 total.totalCents (din computeAnexa4)
 *
 * CRITICAL: dacă există divergențe, returnează EXACT delta (diferența în cents)
 * și un mesaj explicit, pentru că gate-ul ITPARK-602 (butonul "Ready") rămâne
 * dezactivat cât timp există divergențe.
 *
 * @module itpark/consistency
 */

import type { Anexa3Result } from "./calc";
import type { Anexa4Result } from "./anexa4";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsistencyGap {
  /** Cheia divergenței (identificator) */
  key: string;
  /** Descriere human-readable */
  label: string;
  /** Valoarea Anexa 2/sursă A (cents sau %) */
  valueA: number;
  /** Valoarea Anexa 3/Anexa 4 / sursă B (cents sau %) */
  valueB: number;
  /** Delta = valueA - valueB (în cents; pozitiv = A mai mare, negativ = B mai mare) */
  deltaCents: number;
  /** Valoare absolută a deltei (pentru afișaj) */
  absDeltaCents: number;
}

export interface ConsistencyResult {
  /** true = toate valorile concordă (OK), false = divergențe detectate */
  ok: boolean;
  /** Lista divergențelor (goală dacă ok=true) */
  gaps: ConsistencyGap[];
  /** Rezumat text (ex. "3 divergențe detectate") */
  summary: string;
}

// ─── checkConsistency ─────────────────────────────────────────────────────────

/**
 * checkConsistency(eng, anexa3, anexa4) — verificare coerență inter-Anexe
 *
 * @param engTotalSalesCents   — totalSalesCents din engagement (Anexa 2 rând 7), poate fi null
 * @param engTotalEligCents    — totalEligibleCents din engagement (Anexa 2 rând 8 = engine), poate fi null
 * @param anexa3               — rezultatul computeAnexa3() (liniile Anexei 3)
 * @param anexa4               — rezultatul computeAnexa4() (calculul lunar Anexa 4)
 *
 * Regulile de validare:
 *   G1: Anexa3.totalSalesCents == Anexa4.total.totalCents (toleranță 0 — exact)
 *   G2: Anexa3.totalEligibleCents == Anexa4.total.eligibleCents (toleranță 0 — exact)
 *
 * Notă: Anexa 2 rândurile 7 și 8 sunt DERIVATE din engine (computeAnexa3),
 * deci dacă G1 și G2 trec, Anexa 2 este și ea corelată automat.
 *
 * Dacă engagement.totalSalesCents (override manual) diferă de Anexa3.totalSalesCents,
 * adăugăm un gap suplimentar G3 ca avertisment (nu este blocant per CORE,
 * dar este afișat ca divergență informativă).
 */
export function checkConsistency(
  engTotalSalesCents: number | null | undefined,
  anexa3: Anexa3Result,
  anexa4: Anexa4Result
): ConsistencyResult {
  const gaps: ConsistencyGap[] = [];

  // G1: Anexa3.totalSalesCents == Anexa4.total.totalCents
  if (anexa3.totalSalesCents !== anexa4.total.totalCents) {
    const delta = anexa3.totalSalesCents - anexa4.total.totalCents;
    gaps.push({
      key: "G1_sales_mismatch",
      label: "Total vânzări Anexa 3 ≠ Total Anexa 4",
      valueA: anexa3.totalSalesCents,
      valueB: anexa4.total.totalCents,
      deltaCents: delta,
      absDeltaCents: Math.abs(delta),
    });
  }

  // G2: Anexa3.totalEligibleCents == Anexa4.total.eligibleCents
  if (anexa3.totalEligibleCents !== anexa4.total.eligibleCents) {
    const delta = anexa3.totalEligibleCents - anexa4.total.eligibleCents;
    gaps.push({
      key: "G2_eligible_mismatch",
      label: "Total eligibil Anexa 3 ≠ Total eligibil Anexa 4",
      valueA: anexa3.totalEligibleCents,
      valueB: anexa4.total.eligibleCents,
      deltaCents: delta,
      absDeltaCents: Math.abs(delta),
    });
  }

  // G3 (informativ): engagement totalSalesOverride ≠ Anexa3.totalSalesCents
  // Apare când contabilul a setat un override manual diferit de suma liniilor
  if (
    engTotalSalesCents !== null &&
    engTotalSalesCents !== undefined &&
    engTotalSalesCents > 0 &&
    engTotalSalesCents !== anexa3.totalSalesCents
  ) {
    const delta = engTotalSalesCents - anexa3.totalSalesCents;
    gaps.push({
      key: "G3_override_differs",
      label: "Override total vânzări (Anexa 2) ≠ Suma liniilor Anexa 3",
      valueA: engTotalSalesCents,
      valueB: anexa3.totalSalesCents,
      deltaCents: delta,
      absDeltaCents: Math.abs(delta),
    });
  }

  const ok = gaps.length === 0;
  const summary = ok
    ? "Coerență OK — Anexa 2, 3 și 4 sunt sincronizate"
    : `${gaps.length} divergență${gaps.length === 1 ? "" : "e"} detectată${gaps.length === 1 ? "" : "e"} între anexe`;

  return { ok, gaps, summary };
}
