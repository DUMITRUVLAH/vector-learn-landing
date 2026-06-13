/**
 * PARTY-003: FinDesk — client API for /api/fin/parties
 *
 * Covers: list, get, create, update, soft-delete,
 *         contacts CRUD, and per-party financial metrics.
 */

import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PartyKind = "client" | "supplier" | "both";

export interface Party {
  id: string;
  tenantId: string;
  kind: PartyKind;
  name: string;
  country: string;
  idno: string | null;
  vatCode: string | null;
  iban: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartyContact {
  id: string;
  partyId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartyMetrics {
  totalRevenue: number;  // cents, total invoiced to this party
  openBalance: number;   // cents, unpaid invoices
  aging: {
    d0_30: number;   // cents
    d31_60: number;
    d61_90: number;
    d90plus: number;
  };
}

export interface ListPartiesParams {
  kind?: PartyKind;
  country?: string;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreatePartyPayload {
  kind: PartyKind;
  name: string;
  country: string;
  idno?: string | null;
  vatCode?: string | null;
  iban?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface CreateContactPayload {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
}

// ─── Parties CRUD ──────────────────────────────────────────────────────────

export async function listParties(params: ListPartiesParams = {}): Promise<{ data: Party[]; total: number }> {
  const q = new URLSearchParams();
  if (params.kind) q.set("kind", params.kind);
  if (params.country) q.set("country", params.country);
  if (params.isActive !== undefined) q.set("isActive", params.isActive ? "true" : "false");
  if (params.search) q.set("search", params.search);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<{ data: Party[]; total: number }>(`/api/fin/parties${qs ? `?${qs}` : ""}`);
}

export async function getParty(id: string): Promise<{ data: Party }> {
  return api<{ data: Party }>(`/api/fin/parties/${id}`);
}

export async function createParty(payload: CreatePartyPayload): Promise<{ data: Party }> {
  return api<{ data: Party }>("/api/fin/parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateParty(id: string, payload: Partial<CreatePartyPayload>): Promise<{ data: Party }> {
  return api<{ data: Party }>(`/api/fin/parties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteParty(id: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/fin/parties/${id}`, { method: "DELETE" });
}

// ─── Contacts CRUD ─────────────────────────────────────────────────────────

export async function listPartyContacts(partyId: string): Promise<{ data: PartyContact[] }> {
  return api<{ data: PartyContact[] }>(`/api/fin/parties/${partyId}/contacts`);
}

export async function createContact(
  partyId: string,
  payload: CreateContactPayload
): Promise<{ data: PartyContact }> {
  return api<{ data: PartyContact }>(`/api/fin/parties/${partyId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteContact(partyId: string, contactId: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/fin/parties/${partyId}/contacts/${contactId}`, {
    method: "DELETE",
  });
}

// ─── Metrics ───────────────────────────────────────────────────────────────

export async function getPartyMetrics(partyId: string): Promise<{ data: PartyMetrics }> {
  return api<{ data: PartyMetrics }>(`/api/fin/parties/${partyId}/metrics`);
}
