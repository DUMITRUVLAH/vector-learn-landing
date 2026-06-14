/**
 * SPEND-002: FinDesk Cheltuieli — frontend API client
 *
 * Wraps the backend routes from SPEND-002:
 *   GET    /api/fin/expenses
 *   POST   /api/fin/expenses
 *   GET    /api/fin/expenses/categories
 *   GET    /api/fin/expenses/summary
 *   GET    /api/fin/expenses/:id
 *   PUT    /api/fin/expenses/:id
 *   DELETE /api/fin/expenses/:id
 *   POST   /api/fin/expenses/:id/approve
 */

import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "salaries"
  | "marketing"
  | "supplies"
  | "software"
  | "maintenance"
  | "other";

export type ExpenseSource = "manual" | "capture" | "payroll" | "asset" | "par";
export type ExpenseStatus = "draft" | "approved" | "rejected" | "paid";

export interface FinExpense {
  id: string;
  tenantId: string;
  category: ExpenseCategory;
  amountCents: number;
  currency: string;
  vatDeductible: boolean;
  vatAmountCents: number;
  source: ExpenseSource;
  status: ExpenseStatus;
  description: string | null;
  reference: string | null;
  vendorName: string | null;
  expenseDate: string;
  paidAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  /**
   * SPLIT-202: FK to par_requests.id when source='par'.
   * Null for manually-created or other-source expenses.
   */
  parRequestId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummaryItem {
  category: ExpenseCategory;
  label: string;
  totalCents: number;
  vatDeductibleCents: number;
}

export interface ExpenseSummary {
  byCategory: ExpenseSummaryItem[];
  vatDeductibleTotal: number;
  grandTotalCents: number;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amountCents: number;
  currency?: string;
  vatDeductible: boolean; // OBLIGATORIU — regula #1 FIN-CORE
  vatAmountCents?: number;
  source?: ExpenseSource;
  description?: string;
  reference?: string;
  vendorName?: string;
  expenseDate: string; // YYYY-MM-DD
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

// ─── API functions ────────────────────────────────────────────────────────────

export function listExpenses(params?: {
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  source?: ExpenseSource;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: FinExpense[] }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.status) qs.set("status", params.status);
  if (params?.source) qs.set("source", params.source);
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return api<{ items: FinExpense[] }>(
    `/api/fin/expenses${query ? `?${query}` : ""}`
  );
}

export function createExpense(
  input: CreateExpenseInput
): Promise<{ data: FinExpense }> {
  return api<{ data: FinExpense }>("/api/fin/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getExpense(id: string): Promise<{ data: FinExpense }> {
  return api<{ data: FinExpense }>(`/api/fin/expenses/${id}`);
}

export function updateExpense(
  id: string,
  input: UpdateExpenseInput
): Promise<{ data: FinExpense }> {
  return api<{ data: FinExpense }>(`/api/fin/expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteExpense(id: string): Promise<{ data: FinExpense }> {
  return api<{ data: FinExpense }>(`/api/fin/expenses/${id}`, {
    method: "DELETE",
  });
}

export function approveExpense(id: string): Promise<{ data: FinExpense }> {
  return api<{ data: FinExpense }>(`/api/fin/expenses/${id}/approve`, {
    method: "POST",
  });
}

export function getExpenseCategories(): Promise<{
  items: { value: string; label: string }[];
}> {
  return api<{ items: { value: string; label: string }[] }>(
    "/api/fin/expenses/categories"
  );
}

export function getExpenseSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExpenseSummary> {
  const qs = new URLSearchParams();
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  const query = qs.toString();
  return api<ExpenseSummary>(
    `/api/fin/expenses/summary${query ? `?${query}` : ""}`
  );
}
