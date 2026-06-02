/**
 * INT-901 — API key management client functions
 */
import { api } from "../api";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Returned only on creation — key is in clear ONE time. */
export interface ApiKeyCreated extends ApiKeyRow {
  key: string;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return api<ApiKeyRow[]>("/api/settings/api-keys");
}

export async function createApiKey(name: string): Promise<ApiKeyCreated> {
  return api<ApiKeyCreated>("/api/settings/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/settings/api-keys/${id}`, {
    method: "DELETE",
  });
}
