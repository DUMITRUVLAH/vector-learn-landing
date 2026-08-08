/**
 * CORE-004: FinDesk client-side API helpers + types.
 * Mirrors the server's fin_role enum and provides typed fetchers.
 * CORE: backlog/fin/FIN-CORE.md §2
 */
import { dedupe } from "@/lib/apiCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinRole = "owner" | "accountant" | "cfo" | "viewer";

export interface FinMember {
  id: string;
  userId: string;
  role: FinRole;
  permissions: Record<string, boolean>;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export interface FinOrgProfile {
  id: string;
  tenantId: string;
  legalName: string;
  idno: string | null;
  country: "MD" | "RO";
  vatRegime: "payer" | "non_payer";
  vatNumber: string | null;
  baseCurrency: string;
  address: string | null;
  logoUrl: string | null;
  fiscalYearStart: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinMeResponse {
  member: FinMember;
  profile: FinOrgProfile | null;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

const FIN_ROLE_LEVEL: Record<FinRole, number> = {
  viewer: 0,
  cfo: 1,
  accountant: 2,
  owner: 3,
};

/** Returns true if `role` satisfies the minimum required role. */
export function finCanWrite(role: FinRole | null | undefined): boolean {
  if (!role) return false;
  return FIN_ROLE_LEVEL[role] >= FIN_ROLE_LEVEL["accountant"];
}

/** Returns true if the role is viewer or cfo (read-only). */
export function finIsReadOnly(role: FinRole | null | undefined): boolean {
  if (!role) return true;
  return FIN_ROLE_LEVEL[role] < FIN_ROLE_LEVEL["accountant"];
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/fin/members/me — current user's FinDesk role + workspace profile.
 * Returns null if the user is not a FinDesk member.
 */
export async function getFinMe(): Promise<FinMeResponse | null> {
  // PERF-002: `fetch` direct ocolește deduplicarea din src/lib/api.ts, iar shell-ul FinDesk
  // cerea asta de 3 ori pe încărcare de pagină. E un endpoint de identitate (rolul meu în
  // workspace), deci trece prin `dedupe` cu TTL-ul lung de identitate.
  // Nu poate folosi `api()` pentru că 401/403 înseamnă aici „nu ești membru FinDesk" (→ null),
  // nu o eroare de propagat.
  return dedupe("/api/fin/members/me", async () => {
    const res = await fetch("/api/fin/members/me", { credentials: "include" });
    if (res.status === 403 || res.status === 401) return null;
    if (!res.ok) throw new Error(`getFinMe: ${res.status}`);
    return res.json() as Promise<FinMeResponse>;
  });
}

/**
 * GET /api/fin/org — tenant org profile (read-only safe; requires viewer+).
 */
export async function getFinOrgProfile(): Promise<FinOrgProfile | null> {
  const res = await fetch("/api/fin/org", { credentials: "include" });
  if (res.status === 404 || res.status === 403 || res.status === 401) return null;
  if (!res.ok) throw new Error(`getFinOrgProfile: ${res.status}`);
  const data = await res.json() as { profile: FinOrgProfile | null };
  return data.profile;
}
