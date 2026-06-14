/**
 * PAY-002 (FIN): Motor calcul salarii — DETERMINIST, nu AI (FIN-CORE regula #4).
 *
 * Calculul brut→net urmează cotele legale din jurisdicție:
 *
 * REPUBLICA MOLDOVA (MD):
 *   - CAS angajat:     24% din brut
 *   - CASS angajat:     9% din brut
 *   - Impozit venit:   12% din (brut − CAS − CASS) [net impozabil]
 *   - CAS angajator:   24% din brut (contribuție separată a angajatorului)
 *   - CASS angajator:    4% din brut
 *
 * ROMÂNIA (RO):
 *   - CAS angajat:     10% din brut
 *   - CASS angajat:    10% din brut
 *   - Impozit venit:   10% din (brut − CAS − CASS − scutiri)
 *   - CAS angajator:    0% (din 2018, angajatorul nu mai plătește CAS în RO)
 *   - CASS angajator:   0%
 *
 * FIN-CORE regula #2: cotele vin din `fin_registry_items` (category='payroll_rates') per
 * jurisdicție dacă tabelul există, altfel fall-back la constantele de mai sus.
 * FIN-CORE regula #3: la confirmare, motorul postează cheltuiala în `fin_expenses`.
 *
 * Toate calculele sunt PURE (niciun I/O, niciun AI) — uşor de testat unit.
 */

export type PayrollJurisdiction = "MD" | "RO";

// ─── Cote default ──────────────────────────────────────────────────────────────

export interface PayrollRates {
  /** CAS reținut angajat (basis points, ex: 2400 = 24%) */
  casEmployeeBp: number;
  /** CASS reținut angajat (basis points) */
  cassEmployeeBp: number;
  /** Impozit venit (basis points, aplicat pe baza impozabilă) */
  incomeTaxBp: number;
  /** CAS angajator (basis points, contribuție a angajatorului) */
  casEmployerBp: number;
  /** CASS angajator (basis points) */
  cassEmployerBp: number;
}

export const DEFAULT_PAYROLL_RATES: Record<PayrollJurisdiction, PayrollRates> = {
  MD: {
    casEmployeeBp: 2400,   // 24%
    cassEmployeeBp: 900,   // 9%
    incomeTaxBp: 1200,     // 12% pe baza impozabilă
    casEmployerBp: 2400,   // 24%
    cassEmployerBp: 400,   // 4%
  },
  RO: {
    casEmployeeBp: 1000,   // 10%
    cassEmployeeBp: 1000,  // 10%
    incomeTaxBp: 1000,     // 10% pe baza impozabilă
    casEmployerBp: 0,      // 0% (din 2018)
    cassEmployerBp: 0,     // 0%
  },
};

// ─── Input / Output ────────────────────────────────────────────────────────────

export interface PayrollCalculationInput {
  /** Salariu brut lunar, în cenți. */
  grossCents: number;
  /** Cotele aplicate (din REGISTRY sau default). */
  rates: PayrollRates;
}

export interface PayrollCalculationResult {
  grossCents: number;
  /** CAS reținut din salariul angajatului, cenți. */
  casEmployeeCents: number;
  /** CASS reținut din salariul angajatului, cenți. */
  cassEmployeeCents: number;
  /** Baza impozabilă = brut − CAS − CASS, cenți. */
  taxableBaseCents: number;
  /** Impozit pe venit reținut, cenți. */
  incomeTaxCents: number;
  /** Total rețineri angajat = CAS + CASS + impozit venit, cenți. */
  totalDeductionsCents: number;
  /** Salariu net de plătit = brut − totalDeductions, cenți. */
  netCents: number;
  /** CAS angajator (contribuție plătită de angajator separat), cenți. */
  casEmployerCents: number;
  /** CASS angajator, cenți. */
  cassEmployerCents: number;
  /** Costul total al angajatorului = brut + CAS angajator + CASS angajator, cenți. */
  employerCostCents: number;
}

// ─── Calcul determinist ────────────────────────────────────────────────────────

/**
 * Calculează brut→net pentru un singur angajat.
 * 100% determinist — niciun apel AI, nicio aleatorie.
 *
 * @param input — { grossCents, rates }
 * @returns PayrollCalculationResult
 */
export function calculatePayroll(
  input: PayrollCalculationInput
): PayrollCalculationResult {
  const { grossCents, rates } = input;

  // CAS + CASS angajat (rețineri)
  const casEmployeeCents = Math.round((grossCents * rates.casEmployeeBp) / 10000);
  const cassEmployeeCents = Math.round((grossCents * rates.cassEmployeeBp) / 10000);

  // Baza impozabilă = brut − CAS − CASS (nu poate fi negativă)
  const taxableBaseCents = Math.max(0, grossCents - casEmployeeCents - cassEmployeeCents);

  // Impozit venit pe baza impozabilă
  const incomeTaxCents = Math.round((taxableBaseCents * rates.incomeTaxBp) / 10000);

  // Total rețineri angajat
  const totalDeductionsCents = casEmployeeCents + cassEmployeeCents + incomeTaxCents;

  // Net de plătit
  const netCents = grossCents - totalDeductionsCents;

  // Contribuții angajator (separate de salariul angajatului)
  const casEmployerCents = Math.round((grossCents * rates.casEmployerBp) / 10000);
  const cassEmployerCents = Math.round((grossCents * rates.cassEmployerBp) / 10000);

  // Costul total angajator
  const employerCostCents = grossCents + casEmployerCents + cassEmployerCents;

  return {
    grossCents,
    casEmployeeCents,
    cassEmployeeCents,
    taxableBaseCents,
    incomeTaxCents,
    totalDeductionsCents,
    netCents,
    casEmployerCents,
    cassEmployerCents,
    employerCostCents,
  };
}

/**
 * Convertește PayrollCalculationResult în deductions_jsonb stocat în fin_payroll_items.
 */
export function toDeductionsJsonb(
  result: PayrollCalculationResult
): Record<string, number> {
  return {
    cas_employee_cents: result.casEmployeeCents,
    cass_employee_cents: result.cassEmployeeCents,
    taxable_base_cents: result.taxableBaseCents,
    income_tax_cents: result.incomeTaxCents,
    total_deductions_cents: result.totalDeductionsCents,
    cas_employer_cents: result.casEmployerCents,
    cass_employer_cents: result.cassEmployerCents,
  };
}
