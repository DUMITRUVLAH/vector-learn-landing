/**
 * INT-902: Outbound webhook dispatcher.
 *
 * Finds all active webhook endpoints for a tenant that subscribe to the event type,
 * then POSTs the payload to each. Signs the body with HMAC-SHA256 using the endpoint's
 * secret. Saves a delivery record (success or failure) for each attempt.
 *
 * This is best-effort (no retry backoff). Errors are swallowed after recording.
 */

import { createHmac } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { webhookEndpoints, webhookDeliveries } from "../db/schema";

export type WebhookEventType =
  | "lead.created"
  | "lead.updated"
  | "student.enrolled"
  | "payment.received";

export interface WebhookPayload {
  event: WebhookEventType;
  tenantId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/** Compute HMAC-SHA256 signature for the body */
export function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/**
 * Dispatch a webhook event to all active endpoints for the tenant.
 * Called fire-and-forget — awaiting is optional.
 */
export async function dispatchWebhook(
  tenantId: string,
  event: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    tenantId,
    data,
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  // Find active endpoints subscribed to this event type
  const endpoints = await db.query.webhookEndpoints.findMany({
    where: and(
      eq(webhookEndpoints.tenantId, tenantId),
      eq(webhookEndpoints.active, true)
    ),
  });

  // Filter to endpoints that subscribe to this event type
  const relevant = endpoints.filter((ep) => {
    if (!ep.events || (ep.events as string[]).length === 0) return true; // subscribe to all
    return (ep.events as string[]).includes(event);
  });

  if (relevant.length === 0) return;

  // Dispatch to each endpoint
  await Promise.allSettled(
    relevant.map((ep) => deliverToEndpoint(ep.id, ep.url, ep.secret, tenantId, event, body, payload))
  );
}

async function deliverToEndpoint(
  endpointId: string,
  url: string,
  secret: string,
  tenantId: string,
  eventType: WebhookEventType,
  body: string,
  payload: WebhookPayload
): Promise<void> {
  const signature = signPayload(body, secret);
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let deliveredAt: Date | null = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VL-Event": eventType,
        "X-VL-Signature": signature,
        "X-VL-Timestamp": payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10 second timeout
    });

    statusCode = response.status;
    responseBody = (await response.text()).slice(0, 4096); // cap at 4KB
    deliveredAt = new Date();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Save delivery record
  await db.insert(webhookDeliveries).values({
    endpointId,
    tenantId,
    eventType,
    payload: payload as unknown as Record<string, unknown>,
    statusCode,
    responseBody,
    deliveredAt,
    error,
  });
}
