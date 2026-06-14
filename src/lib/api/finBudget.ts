/**
 * BUDGET-002: API client pentru modulul Bugete FinDesk
 * Endpoint-uri: /api/fin/budget/*
 */

import { api } from "../api";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type BudgetStatus = "draft" | "active" | "closed";

export interface FinBudget {
  id: string;
  tenantId: string;
  name: string;
  fiscalYear: number;
  department: string | null;
  branchId: string | null;
  status: BudgetStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinBudgetLine {
  id: string;
  tenantId: string;
  budgetId: string;
  category: string;
  label: string;
  budgetedCents: number;
  displayOrder: number;
  createdAt: string;
}

export interface BudgetReportLine {
  id: string;
  category: string;
  label: string;
  budgetedCents: number;
  actualCents: number;
  remainingCents: number;
  pct: number | null;
  displayOrder: number;
}

export interface BudgetReport {
  budget: FinBudget;
  lines: BudgetReportLine[];
  totalBudgetedCents: number;
  totalActualCents: number;
  totalRemainingCents: number;
}

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  department?: string | null;
  branchId?: string | null;
  status?: BudgetStatus;
  notes?: string | null;
  lines?: Array<{
    category: string;
    label: string;
    budgetedCents: number;
    displayOrder?: number;
  }>;
}

export interface UpdateBudgetInput {
  name?: string;
  department?: string | null;
  status?: BudgetStatus;
  notes?: string | null;
}

export interface CreateLineInput {
  category: string;
  label: string;
  budgetedCents: number;
  displayOrder?: number;
}

export interface UpdateLineInput {
  label?: string;
  budgetedCents?: number;
  displayOrder?: number;
}

export interface AlertsResult {
  alertsCreated: string[];
  count: number;
}

// ─── Lista bugete ─────────────────────────────────────────────────────────────

export function listBudgets(params?: {
  status?: BudgetStatus;
  fiscalYear?: number;
}): Promise<{ budgets: FinBudget[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
  const q = qs.toString();
  return api<{ budgets: FinBudget[] }>(`/api/fin/budget${q ? `?${q}` : ""}`);
}

// ─── Creare buget ─────────────────────────────────────────────────────────────

export function createBudget(
  input: CreateBudgetInput
): Promise<{ budget: FinBudget; lines: FinBudgetLine[] }> {
  return api<{ budget: FinBudget; lines: FinBudgetLine[] }>("/api/fin/budget", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Detaliu buget ───────────────────────────────────────────────────────────

export function getBudget(
  id: string
): Promise<{ budget: FinBudget; lines: FinBudgetLine[] }> {
  return api<{ budget: FinBudget; lines: FinBudgetLine[] }>(`/api/fin/budget/${id}`);
}

// ─── Actualizare antet ────────────────────────────────────────────────────────

export function updateBudget(
  id: string,
  input: UpdateBudgetInput
): Promise<{ budget: FinBudget }> {
  return api<{ budget: FinBudget }>(`/api/fin/budget/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// ─── Linii ────────────────────────────────────────────────────────────────────

export function addBudgetLine(
  budgetId: string,
  input: CreateLineInput
): Promise<{ line: FinBudgetLine }> {
  return api<{ line: FinBudgetLine }>(`/api/fin/budget/${budgetId}/lines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBudgetLine(
  budgetId: string,
  lineId: string,
  input: UpdateLineInput
): Promise<{ line: FinBudgetLine }> {
  return api<{ line: FinBudgetLine }>(`/api/fin/budget/${budgetId}/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBudgetLine(budgetId: string, lineId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/fin/budget/${budgetId}/lines/${lineId}`, {
    method: "DELETE",
  });
}

// ─── Raport buget vs realizat ─────────────────────────────────────────────────

export function getBudgetReport(budgetId: string): Promise<BudgetReport> {
  return api<BudgetReport>(`/api/fin/budget/${budgetId}/report`);
}

// ─── Verifică alerte ─────────────────────────────────────────────────────────

export function checkBudgetAlerts(budgetId: string): Promise<AlertsResult> {
  return api<AlertsResult>(`/api/fin/budget/${budgetId}/check-alerts`, {
    method: "POST",
  });
}
