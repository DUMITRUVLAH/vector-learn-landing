/**
 * PAY-006: Payment plans API client.
 */
import { api } from "../api";
import type { Invoice } from "./invoices";

export type PaymentPlanStatus = "active" | "completed" | "cancelled";

export interface PaymentPlan {
  id: string;
  tenantId?: string;
  studentId: string;
  studentName?: string;
  description: string | null;
  totalAmountCents: number;
  currency: string;
  installmentsCount: number;
  intervalDays: number;
  status: PaymentPlanStatus;
  createdAt: string;
  progress?: {
    paid: number;
    total: number;
    paidAmount: number;
    remainingAmount: number;
  };
}

export interface CreatePlanInput {
  studentId: string;
  totalAmountCents: number;
  currency?: string;
  installments: number;
  intervalDays?: number;
  firstDueDate: string;
  description?: string | null;
}

export function listPaymentPlans(): Promise<{ items: PaymentPlan[] }> {
  return api<{ items: PaymentPlan[] }>("/api/payment-plans");
}

export function getPaymentPlan(
  id: string
): Promise<{ plan: PaymentPlan; invoices: Invoice[] }> {
  return api<{ plan: PaymentPlan; invoices: Invoice[] }>(`/api/payment-plans/${id}`);
}

export function createPaymentPlan(
  input: CreatePlanInput
): Promise<{ plan: PaymentPlan; invoices: Invoice[] }> {
  return api<{ plan: PaymentPlan; invoices: Invoice[] }>("/api/payment-plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelPaymentPlan(id: string): Promise<{ ok: boolean; planId: string }> {
  return api<{ ok: boolean; planId: string }>(`/api/payment-plans/${id}`, {
    method: "DELETE",
  });
}
