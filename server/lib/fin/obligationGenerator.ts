/**
 * CALENDAR-002: FinDesk — Generator obligații fiscale (DETERMINIST, zero AI)
 *
 * Generează `fin_obligations` pentru o lună dată din:
 *   - Date payroll (gross) → CAS angajat, CAS angajator, CNAM, salariu
 *   - Date TVA (din payload FISC sau furnizat extern) → obligație TVA-MD/RO
 *
 * Cotele implicite (MD 2026):
 *   - CAS angajat:   24% din brut (2400 bp)
 *   - CAS angajator: 24% din brut (2400 bp)
 *   - CNAM:           9% din brut  (900 bp)
 *
 * Termene legale (DETERMINIST):
 *   - Salariu:                  ultima zi a lunii curente
 *   - TVA / CAS / CNAM:         ziua 25 a lunii următoare
 *
 * FIN-CORE regula #4: AI nu calculează obligații fiscale.
 * FIN-CORE regula #10: sume în cenți (integer).
 */

export interface ObligationInput {
  year: number;
  /** Luna 1–12 */
  month: number;
  /** Sum brut payroll în cenți (optional — 0 dacă nu se cunoaște) */
  grossPayrollCents?: number;
  /** TVA de plată în cenți (din FISC sau furnizat manual — 0 dacă necalculat) */
  vatDueCents?: number;
  /** Moneda (implicit MDL) */
  currency?: string;
}

export interface GeneratedObligation {
  obligationType: string;
  description: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string; // ISO YYYY-MM-DD
  amountCents: number;
  currency: string;
}

// ─── Constante cote fiscale MD 2026 ──────────────────────────────────────────

/** CAS angajat — 24% din brut (MD 2026). Exprimat în basis points. */
const CAS_EMPLOYEE_BP = 2400;

/** CAS angajator — 24% din brut (MD 2026). */
const CAS_EMPLOYER_BP = 2400;

/** CNAM — 9% din brut (MD 2026). */
const CNAM_BP = 900;

// ─── Utilitar: calcul date scadente ──────────────────────────────────────────

/**
 * Ultima zi a lunii `year-month`.
 * Determinist: returnează YYYY-MM-DD.
 */
function lastDayOfMonth(year: number, month: number): string {
  // Ziua 0 a lunii următoare = ultima zi a lunii curente
  const d = new Date(Date.UTC(year, month, 0)); // month 1-indexed → month 0 = last day of month
  // month param for Date constructor is 0-indexed, so month (1-12) is already +1
  return d.toISOString().split("T")[0]!;
}

/**
 * Ziua 25 a lunii următoare.
 * Ex: pentru luna 1 → 2026-02-25; pentru luna 12 → 2027-01-25.
 */
function dueDateDay25NextMonth(year: number, month: number): string {
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const mm = String(nextMonth).padStart(2, "0");
  return `${nextYear}-${mm}-25`;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generează lista obligațiilor pentru luna dată.
 *
 * Returnat cu sume în cenți. Dacă `grossPayrollCents` e 0, CAS/CNAM/salariu au amount 0
 * (marchează ca „de verificat"). Dacă `vatDueCents` e 0, TVA are amount 0.
 *
 * Idempotent: returnează aceeași listă dacă datele de intrare sunt identice.
 * Duplicatele se evită cu UPSERT pe (tenant_id, obligation_type, period_year, period_month).
 */
export function generateObligations(input: ObligationInput): GeneratedObligation[] {
  const { year, month, grossPayrollCents = 0, vatDueCents = 0, currency = "MDL" } = input;

  const obligations: GeneratedObligation[] = [];

  // Format lună pentru descrieri
  const monthNames = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
  ];
  const monthName = monthNames[(month - 1)] ?? `Luna ${month}`;
  const periodLabel = `${monthName} ${year}`;

  const day25Next = dueDateDay25NextMonth(year, month);
  const lastDay = lastDayOfMonth(year, month);

  // ── TVA-MD ────────────────────────────────────────────────────────────────
  obligations.push({
    obligationType: "tva_md",
    description: `TVA lunar ${periodLabel}`,
    periodYear: year,
    periodMonth: month,
    dueDate: day25Next,
    amountCents: vatDueCents,
    currency,
  });

  // ── CAS angajat ───────────────────────────────────────────────────────────
  const casEmployeeCents = Math.round((grossPayrollCents * CAS_EMPLOYEE_BP) / 10000);
  obligations.push({
    obligationType: "cas_employee",
    description: `CAS angajat ${periodLabel}`,
    periodYear: year,
    periodMonth: month,
    dueDate: day25Next,
    amountCents: casEmployeeCents,
    currency,
  });

  // ── CAS angajator ─────────────────────────────────────────────────────────
  const casEmployerCents = Math.round((grossPayrollCents * CAS_EMPLOYER_BP) / 10000);
  obligations.push({
    obligationType: "cas_employer",
    description: `CAS angajator ${periodLabel}`,
    periodYear: year,
    periodMonth: month,
    dueDate: day25Next,
    amountCents: casEmployerCents,
    currency,
  });

  // ── CNAM ──────────────────────────────────────────────────────────────────
  const cnamCents = Math.round((grossPayrollCents * CNAM_BP) / 10000);
  obligations.push({
    obligationType: "cnam",
    description: `CNAM ${periodLabel}`,
    periodYear: year,
    periodMonth: month,
    dueDate: day25Next,
    amountCents: cnamCents,
    currency,
  });

  // ── Salariu ───────────────────────────────────────────────────────────────
  // Salariul net = brut - CAS angajat - CNAM angajat (aproximativ)
  const salaryNetCents = Math.max(0, grossPayrollCents - casEmployeeCents - cnamCents);
  obligations.push({
    obligationType: "salary",
    description: `Salariu ${periodLabel}`,
    periodYear: year,
    periodMonth: month,
    dueDate: lastDay,
    amountCents: salaryNetCents,
    currency,
  });

  return obligations;
}

/**
 * Calculează câte zile rămân până la `dueDate` față de `today`.
 * Negativ dacă termenul a trecut.
 */
export function daysUntilDue(dueDate: string, today: Date = new Date()): number {
  const due = new Date(dueDate + "T00:00:00Z");
  const now = new Date(today.toISOString().split("T")[0]! + "T00:00:00Z");
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}
