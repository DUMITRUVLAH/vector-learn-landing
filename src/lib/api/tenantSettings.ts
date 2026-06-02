/**
 * PAY-001: Tenant settings API client
 */
import { api } from "../api";

export interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  invoicePrefix: string;
  iban: string | null;
  bic: string | null;
}

export function getTenantSettings(): Promise<TenantSettings> {
  return api<TenantSettings>("/api/settings/tenant");
}

export function updateTenantSettings(patch: {
  invoicePrefix?: string;
  iban?: string | null;
  bic?: string | null;
  timezone?: string;
}): Promise<TenantSettings> {
  return api<TenantSettings>("/api/settings/tenant", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
