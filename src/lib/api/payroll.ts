/**
 * HR-401 — Client-side API helpers for payroll.
 */
import { api } from "../api";

export type PayrollStatus = "draft" | "approved" | "paid";

export interface PayrollEntry {
  id: string;
  teacherId: string;
  teacherName: string;
  month: string;
  totalHours: string;
  totalCents: number;
  commissionCents: number;
  bonusCents: number;
  status: PayrollStatus;
  breakdown?: Array<{
    lessonId: string;
    scheduledAt: string;
    durationMinutes: number;
    rateCents: number;
    subtotalCents: number;
  }> | null;
  createdAt: string;
}

export interface CalculatePayrollResponse {
  entries: PayrollEntry[];
  totalCents: number;
}

export function listPayroll(month?: string): Promise<{ items: PayrollEntry[] }> {
  const qs = month ? `?month=${month}` : "";
  return api<{ items: PayrollEntry[] }>(`/hr/payroll${qs}`);
}

export function calculatePayroll(month: string): Promise<CalculatePayrollResponse> {
  return api<CalculatePayrollResponse>("/hr/payroll/calculate", {
    method: "POST",
    body: JSON.stringify({ month }),
  });
}

export function updatePayrollStatus(
  id: string,
  status: PayrollStatus
): Promise<PayrollEntry> {
  return api<PayrollEntry>(`/hr/payroll/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
