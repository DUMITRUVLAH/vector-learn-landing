/**
 * PAY-004: Stripe API client functions.
 */
import { api } from "../api";

export interface StripeSettings {
  configured: boolean;
  enabled: boolean;
  publishableKey?: string;
  secretKeyMasked?: string | null;
  webhookSecretConfigured?: boolean;
}

export interface StripeLinkResult {
  url: string;
  paymentIntentId?: string;
  expiresAt?: string;
  reused?: boolean;
}

export interface StripeTestResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export function getStripeSettings(): Promise<StripeSettings> {
  return api<StripeSettings>("/api/settings/stripe");
}

export function saveStripeSettings(params: {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
  enabled?: boolean;
}): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/settings/stripe", {
    method: "POST",
    body: JSON.stringify({
      publishableKey: params.publishableKey,
      secretKey: params.secretKey,
      webhookSecret: params.webhookSecret ?? null,
      enabled: params.enabled ?? true,
    }),
  });
}

export function testStripeConnection(): Promise<StripeTestResult> {
  return api<StripeTestResult>("/api/settings/stripe/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function createStripePaymentLink(
  invoiceId: string
): Promise<StripeLinkResult> {
  return api<StripeLinkResult>(`/api/invoices/${invoiceId}/stripe-link`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
