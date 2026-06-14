/**
 * FISC-004: Calcul termene legale de depunere declarații fiscale.
 *
 * Termene DETERMINISTE (nu AI, FIN-CORE regula #4):
 *   - TVA12-MD  : ziua 25 a lunii următoare perioadei (lunar)
 *   - D394-RO   : ziua 25 a lunii următoare perioadei (lunar)
 *   - D301-RO   : 45 zile după sfârşitul perioadei
 *   - income_md : ziua 25 Martie a anului următor (anual)
 *
 * Toate calculele sunt pure (niciun I/O, niciun AI) — uşor de testat unit.
 */

import type { FinDeclarationType } from "../../db/schema/finTax";

export interface TaxDeadline {
  declarationType: FinDeclarationType;
  periodId: string;
  periodLabel: string;
  /** Termenul limită (YYYY-MM-DD) */
  deadline: string;
  /** Zile rămase până la termen (negativ = depăşit) */
  daysUntil: number;
}

// ─── Utilitar: zile între două date ISO ───────────────────────────────────────

function daysUntilDate(deadline: string, today: string): number {
  const d1 = new Date(today);
  const d2 = new Date(deadline);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

// ─── Termin lunar MD/RO: ziua 25 a lunii următoare perioadei ─────────────────

/**
 * Calculează data-limită ziua 25 a lunii următoare perioadei.
 *
 * @param year  — anul perioadei
 * @param month — luna perioadei (1–12)
 * @returns YYYY-MM-DD
 */
export function monthlyDeadline25th(year: number, month: number): string {
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const mm = String(nextMonth).padStart(2, "0");
  return `${nextYear}-${mm}-25`;
}

/**
 * Calculează data-limită pentru D301-RO: 45 zile după sfârşitul perioadei.
 *
 * @param endDate — YYYY-MM-DD (sfârşit perioadă)
 * @returns YYYY-MM-DD
 */
export function d301Deadline(endDate: string): string {
  const d = new Date(endDate);
  d.setDate(d.getDate() + 45);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculează data-limită pentru impozit venit anual MD: 25 Martie a anului următor.
 *
 * @param year — anul perioadei
 * @returns YYYY-MM-DD
 */
export function incomeTaxMdDeadline(year: number): string {
  return `${year + 1}-03-25`;
}

// ─── Calculul termenelor pentru o perioadă dată ───────────────────────────────

export interface PeriodDeadlineInput {
  periodId: string;
  periodLabel: string;
  periodType: "monthly" | "quarterly" | "annual";
  year: number;
  month: number | null;
  quarter: number | null;
  endDate: string;
  declarations: Array<{
    id: string;
    declarationType: FinDeclarationType;
    status: "draft" | "ready" | "filed";
    filedAt: string | null;
  }>;
}

export interface DeadlineWithStatus extends TaxDeadline {
  declarationId: string | null;
  declarationStatus: "draft" | "ready" | "filed" | null;
  filedAt: string | null;
  isOverdue: boolean;
  isUrgent: boolean; // daysUntil <= 7 şi nedepusă
}

/**
 * Calculează lista de termene pentru o perioadă fiscală.
 * Returnează termenele pentru TOATE tipurile de declaraţii relevante juridisc.
 *
 * @param period  — datele perioadei
 * @param today   — data curentă (YYYY-MM-DD), pentru testabilitate
 */
export function computeDeadlinesForPeriod(
  period: PeriodDeadlineInput,
  today: string
): DeadlineWithStatus[] {
  const deadlines: DeadlineWithStatus[] = [];

  // Determinate tipurile de declaraţii conform perioadei
  const types: FinDeclarationType[] = [];

  if (period.periodType === "monthly") {
    // Toate declaraţiile lunare
    types.push("tva12_md", "d394_ro", "d301_ro");
  } else if (period.periodType === "quarterly") {
    types.push("d394_ro", "d301_ro");
  } else if (period.periodType === "annual") {
    types.push("income_md");
  }

  for (const dtype of types) {
    let deadline: string;
    const y = period.year;
    const m = period.month ?? 12;
    const endDate = period.endDate;

    switch (dtype) {
      case "tva12_md":
      case "d394_ro":
        deadline = monthlyDeadline25th(y, m);
        break;
      case "d301_ro":
        deadline = d301Deadline(endDate);
        break;
      case "income_md":
        deadline = incomeTaxMdDeadline(y);
        break;
      default:
        continue;
    }

    const daysUntil = daysUntilDate(deadline, today);

    // Caută declaraţia existentă de acelaşi tip
    const existing = period.declarations.find(
      (d) => d.declarationType === dtype
    );

    const status = existing?.status ?? null;
    const filedAt = existing?.filedAt ?? null;
    const isFiled = status === "filed";

    deadlines.push({
      declarationType: dtype,
      periodId: period.periodId,
      periodLabel: period.periodLabel,
      deadline,
      daysUntil,
      declarationId: existing?.id ?? null,
      declarationStatus: status,
      filedAt,
      isOverdue: daysUntil < 0 && !isFiled,
      isUrgent: daysUntil >= 0 && daysUntil <= 7 && !isFiled,
    });
  }

  return deadlines;
}

// ─── Etichetă tip declaraţie ─────────────────────────────────────────────────

export function declarationTypeLabel(dtype: FinDeclarationType): string {
  switch (dtype) {
    case "tva12_md":
      return "TVA12 (MD)";
    case "d394_ro":
      return "D394 (RO)";
    case "d301_ro":
      return "D301 (RO)";
    case "income_md":
      return "Impozit venit (MD)";
    default: {
      const _exhaustive: never = dtype;
      return _exhaustive;
    }
  }
}
