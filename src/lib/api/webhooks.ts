/**
 * INT-902 — Webhook endpoints client API
 */
import { api } from "../api";

export type WebhookEvent = "lead.created" | "lead.updated" | "student.enrolled" | "payment.received";

export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  "lead.created",
  "lead.updated",
  "student.enrolled",
  "payment.received",
];

export interface WebhookEndpointRow {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointCreated extends WebhookEndpointRow {
  secret: string;
}

export interface WebhookDeliveryRow {
  id: string;
  endpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  deliveredAt: string | null;
  error: string | null;
  createdAt: string;
}

export async function listWebhooks(): Promise<WebhookEndpointRow[]> {
  return api<WebhookEndpointRow[]>("/api/settings/webhooks");
}

export async function createWebhook(opts: {
  url: string;
  events: WebhookEvent[];
}): Promise<WebhookEndpointCreated> {
  return api<WebhookEndpointCreated>("/api/settings/webhooks", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function toggleWebhook(id: string, active: boolean): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/settings/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function deleteWebhook(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/settings/webhooks/${id}`, {
    method: "DELETE",
  });
}

export async function listDeliveries(endpointId: string): Promise<WebhookDeliveryRow[]> {
  return api<WebhookDeliveryRow[]>(`/api/settings/webhooks/${endpointId}/deliveries`);
}
