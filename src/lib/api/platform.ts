/**
 * PLATFORM-001 — clientul tipat pentru Consola Platformă (`/api/platform/*`).
 * Toate apelurile cer superadmin; un 403 aici înseamnă „nu ești proprietarul platformei".
 */
import { api } from "@/lib/api";

export interface PlatformModule {
  key: string;
  label: string;
  description: string;
  route: string;
}

export interface PlatformOverview {
  workspaces: {
    total: number;
    business: number;
    learn: number;
    suspended: number;
    new30d: number;
    active7d: number;
  };
  users: { total: number };
  logins: { last24h: number; last7d: number; failed7d: number };
  adoption: { key: string; label: string; enabled: number; total: number }[];
  plans: { plan: string; count: number }[];
}

export interface PlatformWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  appKind: string;
  status: string;
  trialEndsAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  userCount: number;
  lastLoginAt: string | null;
  logins30d: number;
  parRequests: number;
  modules: Record<string, boolean>;
  churnRisk: boolean;
}

export interface PlatformMember {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  authProvider: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PlatformLoginEvent {
  id: string;
  email: string;
  success: boolean;
  failureReason: string | null;
  app: string;
  method: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  tenantId?: string | null;
  tenantName?: string | null;
  userName?: string | null;
}

export interface PlatformNote {
  id: string;
  body: string;
  authorEmail: string | null;
  createdAt: string;
}

export interface PlatformAuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface PlatformAdmin {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  tenantName: string | null;
  createdAt: string;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const getPlatformCatalog = () =>
  api<{ modules: PlatformModule[]; defaults: Record<string, boolean> }>("/api/platform/catalog");

export const setModuleDefault = (module: string, enabled: boolean) =>
  api<{ ok: true }>("/api/platform/catalog/defaults", { method: "PUT", ...json({ module, enabled }) });

export const applyDefaults = (overwrite: boolean) =>
  api<{ ok: true; inserted: number; updated: number; workspaces: number }>(
    "/api/platform/catalog/apply-defaults",
    { method: "POST", ...json({ overwrite }) },
  );

export const getPlatformOverview = () => api<PlatformOverview>("/api/platform/overview");

export const getPlatformWorkspaces = () =>
  api<{ workspaces: PlatformWorkspace[]; churnRiskDays: number }>("/api/platform/workspaces");

export const getPlatformWorkspace = (tenantId: string) =>
  api<{
    workspace: PlatformWorkspace;
    members: PlatformMember[];
    recentLogins: PlatformLoginEvent[];
    notes: PlatformNote[];
    payers: { id: string; name: string; idno: string | null }[];
  }>(`/api/platform/workspaces/${tenantId}`);

export const setWorkspaceModule = (tenantId: string, module: string, enabled: boolean) =>
  api<{ ok: true }>(`/api/platform/workspaces/${tenantId}/modules`, {
    method: "PUT",
    ...json({ module, enabled }),
  });

export const setWorkspaceStatus = (tenantId: string, status: string, reason?: string) =>
  api<{ ok: true }>(`/api/platform/workspaces/${tenantId}/status`, {
    method: "PUT",
    ...json({ status, reason }),
  });

export const setWorkspacePlan = (tenantId: string, plan: string) =>
  api<{ ok: true }>(`/api/platform/workspaces/${tenantId}/plan`, { method: "PUT", ...json({ plan }) });

export const addWorkspaceNote = (tenantId: string, body: string) =>
  api<{ note: PlatformNote }>(`/api/platform/workspaces/${tenantId}/notes`, {
    method: "POST",
    ...json({ body }),
  });

export interface LoginQuery {
  q?: string;
  tenantId?: string;
  result?: "success" | "failed";
  days?: number;
  limit?: number;
  offset?: number;
}

export function loginQueryString(query: LoginQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.tenantId) params.set("tenantId", query.tenantId);
  if (query.result) params.set("result", query.result);
  if (query.days) params.set("days", String(query.days));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  return params.toString();
}

export const getPlatformLogins = (query: LoginQuery) =>
  api<{
    events: PlatformLoginEvent[];
    total: number;
    limit: number;
    offset: number;
    suspicious: { email: string; failures: number }[];
  }>(`/api/platform/logins?${loginQueryString(query)}`);

export const getPlatformAdmins = () =>
  api<{ admins: PlatformAdmin[]; self: string }>("/api/platform/admins");

export const addPlatformAdmin = (email: string) =>
  api<{ ok: true }>("/api/platform/admins", { method: "POST", ...json({ email }) });

export const removePlatformAdmin = (userId: string) =>
  api<{ ok: true }>(`/api/platform/admins/${userId}`, { method: "DELETE" });

export const getPlatformAudit = () =>
  api<{ entries: PlatformAuditEntry[] }>("/api/platform/audit?limit=200");

// ─── PLATFORM-002: erori + creștere ───────────────────────────────────────────

export interface PlatformErrorGroup {
  id: string;
  fingerprint: string;
  kind: string;
  title: string;
  location: string | null;
  occurrences: number;
  affectedTenants: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
}

export interface PlatformErrorEvent {
  id: string;
  message: string;
  stack: string | null;
  location: string | null;
  method: string | null;
  statusCode: number | null;
  url: string | null;
  userEmail: string | null;
  userAgent: string | null;
  createdAt: string;
  tenantName: string | null;
}

export interface PlatformGrowth {
  windowDays: number;
  funnel: { signedUp: number; loggedIn: number; activated: number };
  sources: { source: string; signups: number; activated: number }[];
  adoption: { key: string; label: string; enabled: number; used: number; total: number }[];
  callList: {
    id: string;
    name: string;
    plan: string;
    contactEmail: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    activatedAt: string | null;
    activated: boolean;
    reasons: string[];
  }[];
  contactsAvailable: number;
}

export const getPlatformErrors = (status: string, days: number) =>
  api<{ groups: PlatformErrorGroup[]; openCount: number }>(
    `/api/platform/errors?status=${encodeURIComponent(status)}&days=${days}`,
  );

export const getPlatformErrorDetail = (groupId: string) =>
  api<{ group: PlatformErrorGroup; events: PlatformErrorEvent[] }>(`/api/platform/errors/${groupId}`);

export const setErrorStatus = (groupId: string, status: "open" | "resolved" | "ignored") =>
  api<{ ok: true }>(`/api/platform/errors/${groupId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

export const getPlatformGrowth = (days: number) =>
  api<PlatformGrowth>(`/api/platform/growth?days=${days}`);
