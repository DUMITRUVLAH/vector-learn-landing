/**
 * ITPARK-302: computeAnexa4 — motor calcul lunar Anexa 4
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §4
 *
 * Reguli DETERMINISTE:
 * 1. 12 luni fixe (ianuarie–decembrie). Fiecare lună are:
 *    - eligibleCents: Σ linii cu isEligible=true și month=M
 *    - totalCents:    Σ TOATE liniile cu month=M (eligibile + neeligibile)
 * 2. Linii cu month=null: INCLUSE în totalele anuale (eligibleCents + totalCents annual)
 *    și marcate „unallocated" — NU atribuite niciunei luni individuale.
 * 3. cumEligibleCents (YTD): Σ eligibleCents luni 1..M (exclusiv unallocated)
 * 4. cumTotalCents (YTD):    Σ totalCents luni 1..M (exclusiv unallocated)
 * 5. monthlySharePct: cumEligibleCents / cumTotalCents × 100 — 2 zecimale, div/0→0
 * 6. Total row: annual totale (inclusiv linii unallocated)
 * 7. Evaluare prag: eligiblePct(YTD) ≥ eligibilityThresholdPct → conform
 *    cumul sub prag > toleranceMonths consecutive → risk:true
 *
 * Fixture de aur (Vector Academy 2025):
 *   Dec cumEligible = 197.119.719 cents (1.971.197,19 MDL)
 *   Dec cumShare    = 88.48%
 *   Total trebuie să egaleze totalele ITPARK-301 (computeAnexa3)
 *
 * @module itpark/anexa4
 */

import { roundHalfUp } from "./calc";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface RevenueLineInput302 {
  amountCents: number;
  isEligible: boolean;
  /** 1–12 sau null (nealocat la o lună specifică) */
  month: number | null;
}

export interface Anexa4Settings {
  /** Pragul de eligibilitate cumulativ (%, ex. 70.00) */
  eligibilityThresholdPct: number;
  /** Număr luni consecutive sub prag admise înainte de risc (ex. 2) */
  toleranceMonths: number;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface MonthRow {
  /** 1–12 */
  month: number;
  /** Venituri eligibile în luna M (cents) */
  eligibleCents: number;
  /** Total venituri în luna M — eligibile + neeligibile cu month=M (cents) */
  totalCents: number;
  /** Venituri eligibile cumulative YTD ian→M (exclusiv unallocated) */
  cumEligibleCents: number;
  /** Total venituri cumulative YTD ian→M (exclusiv unallocated) */
  cumTotalCents: number;
  /**
   * Pondere cumulativă eligibilă YTD (%)
   * = cumEligibleCents / cumTotalCents × 100 — 2 zecimale, div/0→0
   */
  monthlySharePct: number;
  /**
   * Conformitate la finalul lunii M:
   * true dacă monthlySharePct ≥ eligibilityThresholdPct
   */
  conform: boolean;
}

export interface Anexa4TotalRow {
  /** Σ eligibleCents toate lunile (inclusiv unallocated) */
  eligibleCents: number;
  /** Σ totalCents toate lunile (inclusiv unallocated) */
  totalCents: number;
  /** Pondere anuală eligibilă = eligibleCents / totalCents × 100 */
  annualSharePct: number;
}

export interface UnallocatedInfo {
  /** Σ amountCents linii cu month=null și isEligible=true */
  eligibleCents: number;
  /** Σ amountCents linii cu month=null (eligibile + neeligibile) */
  totalCents: number;
  /** Număr linii cu month=null */
  lineCount: number;
}

export interface ThresholdEval {
  /** Prag configurat (%) */
  eligibilityThresholdPct: number;
  /** Toleranță luni consecutive */
  toleranceMonths: number;
  /**
   * true dacă la finalul anului (Dec YTD) sau orice lună cu date,
   * există > toleranceMonths luni consecutive sub prag.
   * Numai lunile cu totalCents > 0 sunt luate în calcul.
   */
  risk: boolean;
  /** Numărul maxim de luni consecutive sub prag detectat */
  maxConsecutiveBelowThreshold: number;
}

export interface Anexa4Result {
  /** 12 rânduri lunare (ianuarie = index 0) */
  months: MonthRow[];
  /** Rândul Total anual */
  total: Anexa4TotalRow;
  /** Info despre liniile fără lună atribuită */
  unallocated: UnallocatedInfo;
  /** Evaluarea pragului de conformitate */
  thresholdEval: ThresholdEval;
}

// ─── Core calculator ──────────────────────────────────────────────────────────

/**
 * computeAnexa4(lines, settings) — calculul Anexei 4 (lunar + anual + threshold)
 *
 * DETERMINISTIC: același input → același output.
 * Nicio randomizare, nicio stare globală, nicio dependență externă.
 */
export function computeAnexa4(
  lines: RevenueLineInput302[],
  settings: Anexa4Settings
): Anexa4Result {
  // 1. Separăm liniile alocate (month 1–12) de cele nealocate (month=null)
  const allocated = lines.filter(
    (l) => l.month !== null && l.month !== undefined && l.month >= 1 && l.month <= 12
  );
  const unallocatedLines = lines.filter(
    (l) => l.month === null || l.month === undefined
  );

  // 2. Acumulăm per lună (1–12)
  const monthEligible = new Array<number>(13).fill(0); // index 1–12
  const monthTotal = new Array<number>(13).fill(0);

  for (const line of allocated) {
    const m = line.month as number; // garantat 1–12 după filter
    monthTotal[m] += line.amountCents;
    if (line.isEligible) {
      monthEligible[m] += line.amountCents;
    }
  }

  // 3. Unallocated totale
  let unallocEligible = 0;
  let unallocTotal = 0;
  for (const line of unallocatedLines) {
    unallocTotal += line.amountCents;
    if (line.isEligible) {
      unallocEligible += line.amountCents;
    }
  }

  // 4. Construim rândurile lunare cu cumulative
  let cumEligible = 0;
  let cumTotal = 0;

  const months: MonthRow[] = [];

  for (let m = 1; m <= 12; m++) {
    cumEligible += monthEligible[m];
    cumTotal += monthTotal[m];

    const monthlySharePct =
      cumTotal > 0
        ? roundHalfUp((cumEligible / cumTotal) * 100, 2)
        : 0;

    months.push({
      month: m,
      eligibleCents: monthEligible[m],
      totalCents: monthTotal[m],
      cumEligibleCents: cumEligible,
      cumTotalCents: cumTotal,
      monthlySharePct,
      conform: monthlySharePct >= settings.eligibilityThresholdPct,
    });
  }

  // 5. Totalul anual (inclusiv unallocated — per spec "incluse în totalele anuale")
  const annualEligible = cumEligible + unallocEligible;
  const annualTotal = cumTotal + unallocTotal;
  const annualSharePct =
    annualTotal > 0
      ? roundHalfUp((annualEligible / annualTotal) * 100, 2)
      : 0;

  const total: Anexa4TotalRow = {
    eligibleCents: annualEligible,
    totalCents: annualTotal,
    annualSharePct,
  };

  // 6. Evaluare prag — calcul risc
  // Luăm în calcul doar lunile cu totalCents > 0 (luni cu activitate)
  let maxConsecutive = 0;
  let currentConsecutive = 0;

  for (const row of months) {
    // Sărim lunile fără activitate (nu contorizăm la risc)
    if (row.cumTotalCents === 0) continue;

    if (!row.conform) {
      currentConsecutive++;
      if (currentConsecutive > maxConsecutive) {
        maxConsecutive = currentConsecutive;
      }
    } else {
      currentConsecutive = 0;
    }
  }

  const thresholdEval: ThresholdEval = {
    eligibilityThresholdPct: settings.eligibilityThresholdPct,
    toleranceMonths: settings.toleranceMonths,
    risk: maxConsecutive > settings.toleranceMonths,
    maxConsecutiveBelowThreshold: maxConsecutive,
  };

  const unallocated: UnallocatedInfo = {
    eligibleCents: unallocEligible,
    totalCents: unallocTotal,
    lineCount: unallocatedLines.length,
  };

  return { months, total, unallocated, thresholdEval };
}

// ─── Convenience: format MDL (Romanian locale) ───────────────────────────────

/**
 * fmtMDL(cents) — formatare sumă în cents → MDL cu separatoare românești.
 * Exemplu: 197_119_719 → "1.971.197,19"
 * Spec ITPARK-401 T-401-3 [blocant]: fmtMDL(197119719) === "1.971.197,19"
 *
 * IMPORTANT: folosește "ro-MD" locale cu Intl.NumberFormat.
 * NU este parPdf.money() — aceea adaugă "MDL" și are altă semnătură.
 */
export function fmtMDL(cents: number): string {
  const value = cents / 100;
  // Intl.NumberFormat cu "ro-MD" produce "1.971.197,19" (punct mie, virgulă zecimale)
  return new Intl.NumberFormat("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

/**
 * MONTH_NAMES_RO — denumirile lunilor în română pentru afișaj Anexa 4
 */
export const MONTH_NAMES_RO = [
  "", // index 0 unused
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
] as const;
