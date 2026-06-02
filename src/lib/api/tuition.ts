/**
 * SCHOOL-004 — Client API pentru taxe școlare (tuition billing)
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingCycle = "annual" | "per_term" | "monthly";

export interface TuitionPlan {
  id: string;
  tenantId: string;
  academicYearId: string;
  name: string;
  amountCents: number;
  currency: string;
  billingCycle: BillingCycle;
  siblingDiscountPercent: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuitionInstallment {
  id: string;
  tenantId: string;
  planId: string;
  dueDate: string;
  amountCents: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentTuition {
  id: string;
  tenantId: string;
  studentId: string;
  planId: string;
  classId: string | null;
  siblingRank: number;
  scholarshipAmountCents: number;
  scholarshipPercent: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreatePlanPayload {
  academicYearId: string;
  name: string;
  amountCents: number;
  currency?: string;
  billingCycle?: BillingCycle;
  siblingDiscountPercent?: number;
}

export interface CreateInstallmentPayload {
  dueDate: string;
  amountCents: number;
  orderIndex: number;
}

export interface AssignStudentPayload {
  studentId: string;
  planId: string;
  classId?: string | null;
  siblingRank?: number;
  scholarshipAmountCents?: number;
  scholarshipPercent?: number;
  notes?: string | null;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listTuitionPlans(yearId?: string): Promise<TuitionPlan[]> {
  const qs = yearId ? `?yearId=${encodeURIComponent(yearId)}` : "";
  const data = await api<{ plans: TuitionPlan[] }>(`/api/school/tuition/plans${qs}`);
  return data.plans;
}

export async function createTuitionPlan(payload: CreatePlanPayload): Promise<TuitionPlan> {
  const data = await api<{ plan: TuitionPlan }>("/api/school/tuition/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.plan;
}

export async function updateTuitionPlan(
  id: string,
  payload: Partial<CreatePlanPayload>
): Promise<TuitionPlan> {
  const data = await api<{ plan: TuitionPlan }>(`/api/school/tuition/plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.plan;
}

export async function deleteTuitionPlan(id: string): Promise<void> {
  await api(`/api/school/tuition/plans/${id}`, { method: "DELETE" });
}

export async function listInstallments(planId: string): Promise<TuitionInstallment[]> {
  const data = await api<{ installments: TuitionInstallment[] }>(
    `/api/school/tuition/plans/${planId}/installments`
  );
  return data.installments;
}

export async function addInstallment(
  planId: string,
  payload: CreateInstallmentPayload
): Promise<TuitionInstallment> {
  const data = await api<{ installment: TuitionInstallment }>(
    `/api/school/tuition/plans/${planId}/installments`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.installment;
}

export async function listStudentTuitions(planId?: string): Promise<StudentTuition[]> {
  const qs = planId ? `?planId=${encodeURIComponent(planId)}` : "";
  const data = await api<{ studentTuitions: StudentTuition[] }>(
    `/api/school/tuition/students${qs}`
  );
  return data.studentTuitions;
}

export async function assignStudentToPlan(
  payload: AssignStudentPayload
): Promise<StudentTuition> {
  const data = await api<{ studentTuition: StudentTuition }>(
    "/api/school/tuition/students",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.studentTuition;
}

export async function generateInvoicesForStudent(
  studentTuitionId: string
): Promise<{ invoices: { id: string; invoiceNumber: string }[]; count: number }> {
  return api<{ invoices: { id: string; invoiceNumber: string }[]; count: number }>(
    `/api/school/tuition/students/${studentTuitionId}/generate-invoices`,
    { method: "POST" }
  );
}
