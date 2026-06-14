/**
 * CALENDAR-003: API client pentru Calendar Fiscal (/api/fin/calendar/*)
 */

import { api } from "../api";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type FinObligationStatus = "pending" | "paid" | "overdue";

export type FinObligationType =
  | "tva_md"
  | "tva_ro"
  | "income_tax_md"
  | "income_tax_ro"
  | "cas_employee"
  | "cas_employer"
  | "cnam"
  | "salary"
  | "custom";

export interface FinObligation {
  id: string;
  tenantId: string;
  obligationType: FinObligationType | string;
  description: string | null;
  periodYear: number;
  periodMonth: number;
  dueDate: string; // ISO YYYY-MM-DD
  amountCents: number;
  currency: string;
  status: FinObligationStatus | string;
  paidAt: string | null;
  declarationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinPeriodLock {
  id: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  lockedAt: string;
  lockedBy: string | null;
  notes: string | null;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** POST /api/fin/calendar/generate — generează obligații pentru o lună */
export function generateObligationsApi(params: {
  year: number;
  month: number;
  grossPayrollCents?: number;
  vatDueCents?: number;
  currency?: string;
}): Promise<{ created: number; updated: number; obligations: FinObligation[] }> {
  return api<{ created: number; updated: number; obligations: FinObligation[] }>(
    "/api/fin/calendar/generate",
    { method: "POST", body: JSON.stringify(params) }
  );
}

/** GET /api/fin/calendar — listează obligații + perioade blocate */
export function listCalendar(params?: {
  year?: number;
  month?: number;
  status?: FinObligationStatus;
  type?: FinObligationType | string;
}): Promise<{ obligations: FinObligation[]; locked_periods: FinPeriodLock[] }> {
  const qs = new URLSearchParams();
  if (params?.year != null) qs.set("year", String(params.year));
  if (params?.month != null) qs.set("month", String(params.month));
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  const query = qs.toString();
  return api<{ obligations: FinObligation[]; locked_periods: FinPeriodLock[] }>(
    `/api/fin/calendar${query ? `?${query}` : ""}`
  );
}

/** PATCH /api/fin/calendar/:id/mark-paid — marchează obligație ca plătită */
export function markPaid(id: string): Promise<{ obligation: FinObligation }> {
  return api<{ obligation: FinObligation }>(
    `/api/fin/calendar/${id}/mark-paid`,
    { method: "PATCH" }
  );
}

/** POST /api/fin/calendar/lock-period — blochează o perioadă */
export function lockPeriod(params: {
  year: number;
  month: number;
  notes?: string;
}): Promise<{ lock: FinPeriodLock }> {
  return api<{ lock: FinPeriodLock }>(
    "/api/fin/calendar/lock-period",
    { method: "POST", body: JSON.stringify(params) }
  );
}

/** DELETE /api/fin/calendar/lock-period/:year/:month — deblochează */
export function unlockPeriod(
  year: number,
  month: number
): Promise<{ ok: boolean; year: number; month: number }> {
  return api<{ ok: boolean; year: number; month: number }>(
    `/api/fin/calendar/lock-period/${year}/${month}`,
    { method: "DELETE" }
  );
}

// ─── Constante label ──────────────────────────────────────────────────────────

export const OBLIGATION_TYPE_LABELS: Record<string, string> = {
  tva_md: "TVA (MD)",
  tva_ro: "TVA (RO)",
  income_tax_md: "Impozit venit (MD)",
  income_tax_ro: "Impozit venit (RO)",
  cas_employee: "CAS angajat",
  cas_employer: "CAS angajator",
  cnam: "CNAM",
  salary: "Salariu",
  custom: "Altă obligație",
};

export const OBLIGATION_STATUS_LABELS: Record<FinObligationStatus, string> = {
  pending: "De plătit",
  paid: "Plătit",
  overdue: "Restantă",
};

export const MONTH_NAMES = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];
