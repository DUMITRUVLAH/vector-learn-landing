/**
 * INVENTORY-003: API client pentru modulul Inventar
 * Endpoint-uri: /api/fin/inventory/*
 */

import { api } from "../api";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type InventoryCategory =
  | "consumabile"
  | "active_mici"
  | "materiale_didactice"
  | "papetarie"
  | "electronice"
  | "altele";

export type MovementType =
  | "purchase"
  | "sale"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";

export type InventoryUnit = "buc" | "kg" | "l" | "m" | "set" | "pachet";

export interface InventoryItem {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  unit: InventoryUnit;
  description: string | null;
  qtyOnHand: number;
  avgCostCents: number;
  minQtyAlert: number | null;
  category: InventoryCategory | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  itemId: string;
  movementType: MovementType;
  qty: number;
  unitCostCents: number;
  totalCostCents: number;
  invoiceId: string | null;
  reference: string | null;
  notes: string | null;
  branchId: string | null;
  movedBy: string | null;
  spendId: string | null;
  movedAt: string;
  createdAt: string;
}

export interface StockValueSummary {
  totalItems: number;
  totalQty: number;
  totalValueCents: number;
  belowMinAlert: number;
}

export interface CreateInventoryItemInput {
  name: string;
  sku?: string | null;
  unit?: InventoryUnit;
  description?: string | null;
  category?: InventoryCategory | null;
  minQtyAlert?: number;
}

export interface UpdateInventoryItemInput {
  name?: string;
  sku?: string | null;
  unit?: InventoryUnit;
  description?: string | null;
  category?: InventoryCategory | null;
  minQtyAlert?: number;
  isActive?: boolean;
}

export interface CreateMovementInput {
  itemId: string;
  movementType: MovementType;
  qty: number;
  unitCostCents?: number;
  invoiceId?: string | null;
  reference?: string | null;
  notes?: string | null;
  branchId?: string | null;
}

// ─── Articole ─────────────────────────────────────────────────────────────────

export function listInventoryItems(params?: {
  category?: InventoryCategory;
  includeInactive?: boolean;
}): Promise<{ items: InventoryItem[] }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.includeInactive) qs.set("includeInactive", "true");
  const query = qs.toString();
  return api<{ items: InventoryItem[] }>(`/api/fin/inventory/items${query ? `?${query}` : ""}`);
}

export function createInventoryItem(
  input: CreateInventoryItemInput
): Promise<{ item: InventoryItem }> {
  return api<{ item: InventoryItem }>("/api/fin/inventory/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput
): Promise<{ item: InventoryItem }> {
  return api<{ item: InventoryItem }>(`/api/fin/inventory/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ─── Mișcări ──────────────────────────────────────────────────────────────────

export function listStockMovements(params?: {
  itemId?: string;
  type?: MovementType;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ movements: StockMovement[]; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params?.itemId) qs.set("itemId", params.itemId);
  if (params?.type) qs.set("type", params.type);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return api<{ movements: StockMovement[]; page: number; limit: number }>(
    `/api/fin/inventory/movements${query ? `?${query}` : ""}`
  );
}

export function createStockMovement(
  input: CreateMovementInput
): Promise<{ movement: StockMovement; newQtyOnHand: number; newAvgCostCents: number }> {
  return api<{ movement: StockMovement; newQtyOnHand: number; newAvgCostCents: number }>(
    "/api/fin/inventory/movements",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

// ─── Sumar valoare stoc ───────────────────────────────────────────────────────

export function getStockValue(): Promise<StockValueSummary> {
  return api<StockValueSummary>("/api/fin/inventory/stock-value");
}

// ─── INVENTORY-004: Rapoarte ──────────────────────────────────────────────────

export interface StockSnapshotRow {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  qty: number;
  avgCostCents: number;
  valueCents: number;
  minQtyAlert: number;
}

export interface StockSnapshot {
  date: string;
  rows: StockSnapshotRow[];
  totalValueCents: number;
}

export interface PeriodReportRow {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  inQty: number;
  inValueCents: number;
  outQty: number;
  outValueCents: number;
  netQty: number;
}

export interface PeriodReport {
  from: string;
  to: string;
  rows: PeriodReportRow[];
}

export function getStockSnapshot(date?: string): Promise<StockSnapshot> {
  const qs = date ? `?date=${date}` : "";
  return api<StockSnapshot>(`/api/fin/inventory/report/stock-snapshot${qs}`);
}

export function getPeriodReport(from?: string, to?: string): Promise<PeriodReport> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = qs.toString();
  return api<PeriodReport>(`/api/fin/inventory/report/period${q ? `?${q}` : ""}`);
}
