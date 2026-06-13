/**
 * ITPARK-301: Motor de calcul determinist — computeAnexa3
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §3
 *
 * Reguli DETERMINISTE (nu AI):
 * 1. Per-CAEM total: Σ amountCents ale liniilor cu acel cod
 * 2. Per-CAEM share: total_cod / total_vânzări × 100 (2 zecimale)
 * 3. totalEligibleCents: Σ linii cu isEligible=true
 * 4. totalSalesCents: totalEligibleCents + totalNonEligibleCents
 *    (sau totalSalesOverride dacă e furnizat — pentru venituri în afara Anexei 3)
 * 5. eligiblePct: totalEligibleCents / totalSalesCents × 100
 * 6. div/0 → 0 (niciodată NaN sau #DIV/0!)
 * 7. Rotunjire: half-up la 2 zecimale (Math.round)
 *
 * Fixture de validare (Vector Academy 2025):
 *   totalEligible = 197_119_719 cents (1.971.197,19 MDL)
 *   totalSales    = 222_791_719 cents (2.227.917,19 MDL)
 *   share         = 88.48%
 *   62.02         = 9_800_000 cents (98.000,00 MDL) → 4.40%
 *   85.59         = 187_319_719 cents (1.873.197,19 MDL) → 84.08%
 */

// ─── Input types ──────────────────────────────────────────────────────────────

export interface RevenueLineInput {
  caemCode: string;
  amountCents: number;
  isEligible: boolean;
  month?: number | null;
}

export interface CalcOptions {
  /**
   * Override opțional pentru totalSalesCents (când există venituri în afara Anexei 3).
   * Dacă absent/undefined, totalSalesCents = Σ toate liniile (eligibile + neeligibile).
   * Dacă furnizat, trebuie să fie ≥ totalEligibleCents (altfel engagement are prag sub 0% —
   * situație imposibilă; motorul folosește max(override, sumLinesCents)).
   */
  totalSalesOverride?: number;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface CaemBreakdown {
  code: string;
  totalCents: number;
  /** Pondere în totalSalesCents (nu în totalEligibleCents) — pentru afișaj Anexa 3 */
  sharePct: number;
  /** true dacă codul e eligibil (din linii; toate liniile unui cod au același isEligible) */
  eligible: boolean;
}

export interface Anexa3Result {
  /** Per-CAEM totale și ponderi */
  byCode: CaemBreakdown[];
  /** Total venituri eligibile (Σ linii cu isEligible=true) */
  totalEligibleCents: number;
  /** Total venituri din vânzări (eligible + non-eligible, sau totalSalesOverride) */
  totalSalesCents: number;
  /** Pondere eligibilă în total vânzări (%) — 2 zecimale */
  eligiblePct: number;
  /** Număr de linii procesate */
  lineCount: number;
}

// ─── Core calculator ──────────────────────────────────────────────────────────

/**
 * computeAnexa3(lines, options?) — calculul principal al Anexei 3
 *
 * DETERMINISTIC: același input → același output de fiecare dată.
 * Nicio randomizare, nicio stare globală, nicio dependență externă.
 */
export function computeAnexa3(
  lines: RevenueLineInput[],
  options?: CalcOptions
): Anexa3Result {
  // 1. Grupăm pe cod CAEM
  const byCodeMap = new Map<string, { totalCents: number; eligible: boolean }>();

  let totalEligibleCents = 0;
  let totalAllLinesCents = 0;

  for (const line of lines) {
    const code = line.caemCode || "__unknown__";
    const existing = byCodeMap.get(code);

    if (existing) {
      existing.totalCents += line.amountCents;
    } else {
      byCodeMap.set(code, {
        totalCents: line.amountCents,
        eligible: line.isEligible,
      });
    }

    if (line.isEligible) {
      totalEligibleCents += line.amountCents;
    }
    totalAllLinesCents += line.amountCents;
  }

  // 2. Totalul vânzărilor (override sau suma liniilor)
  let totalSalesCents: number;
  if (options?.totalSalesOverride !== undefined && options.totalSalesOverride > 0) {
    // Utilizăm maximul pentru a evita pondere > 100% (imposibil fizic)
    totalSalesCents = Math.max(options.totalSalesOverride, totalAllLinesCents);
  } else {
    totalSalesCents = totalAllLinesCents;
  }

  // 3. Pondere eligibilă (div/0 → 0)
  const eligiblePct =
    totalSalesCents > 0
      ? roundHalfUp((totalEligibleCents / totalSalesCents) * 100, 2)
      : 0;

  // 4. Per-cod: sortăm după totalCents desc (same as Anexa 3 display order)
  const byCode: CaemBreakdown[] = Array.from(byCodeMap.entries())
    .sort((a, b) => b[1].totalCents - a[1].totalCents)
    .map(([code, data]) => ({
      code,
      totalCents: data.totalCents,
      sharePct:
        totalSalesCents > 0
          ? roundHalfUp((data.totalCents / totalSalesCents) * 100, 2)
          : 0,
      eligible: data.eligible,
    }));

  return {
    byCode,
    totalEligibleCents,
    totalSalesCents,
    eligiblePct,
    lineCount: lines.length,
  };
}

// ─── Rounding helper ──────────────────────────────────────────────────────────

/**
 * roundHalfUp(value, decimals) — rotunjire half-up la N zecimale.
 * Matematica standard (nu banker's rounding): 0.5 → 1, 1.5 → 2.
 * Evităm floating-point drift cu Math.round(x * 10^N) / 10^N.
 */
export function roundHalfUp(value: number, decimals: number): number {
  if (!isFinite(value) || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ─── Convenience: format for display ─────────────────────────────────────────

/**
 * fmtPct(value) — formatare procent cu 2 zecimale (ex. 88.48 → "88,48%")
 * Folosit pentru afișaj în Anexa 3 / Anexa 4.
 */
export function fmtPct(value: number): string {
  return (
    value.toLocaleString("ro-MD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
}
