/**
 * PAY-004: Stripe integration helpers.
 *
 * Key management: in this version, keys are stored as-is in the DB (masked in UI).
 * Production hardening: replace encode/decode with AES-256-GCM using ENCRYPTION_KEY env.
 */
import Stripe from "stripe";

/** Simple reversible encoding — swap with AES-256 in production */
export function encryptKey(raw: string): string {
  return Buffer.from(raw).toString("base64");
}

export function decryptKey(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return encoded; // fallback: stored as plaintext
  }
}

/** Build a Stripe client from a decrypted secret key. */
export function buildStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16",
    typescript: true,
  });
}

/**
 * Create a Stripe Checkout Session (hosted payment page) for a given invoice.
 * Returns the URL and the payment intent ID.
 */
export async function createInvoiceCheckoutSession(
  stripe: Stripe,
  params: {
    invoiceId: string;
    invoiceNumber: string;
    amountCents: number;
    currency: string;
    studentName: string;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<{ url: string; paymentIntentId: string; expiresAt: Date }> {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: params.amountCents,
          product_data: {
            name: `Factură ${params.invoiceNumber}`,
            description: `Student: ${params.studentName}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      invoice_id: params.invoiceId,
    },
    // Session expires after 30 minutes by default for unpaid invoices
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  if (!session.url) {
    throw new Error("Stripe checkout session has no URL");
  }

  // payment_intent can be a string or Stripe.PaymentIntent object
  const piId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? "");

  const expiresAt = new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 1800) * 1000);

  return {
    url: session.url,
    paymentIntentId: piId,
    expiresAt,
  };
}

/**
 * Create a Stripe Refund for a given payment intent.
 */
export async function createStripeRefund(
  stripe: Stripe,
  params: {
    paymentIntentId: string;
    amountCents: number;
    reason?: string;
  }
): Promise<{ refundId: string; status: string }> {
  const refund = await stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    amount: params.amountCents,
    reason: "requested_by_customer",
  });
  return { refundId: refund.id, status: refund.status ?? "pending" };
}

/** Verify a Stripe webhook signature. Throws on invalid signature. */
export function constructWebhookEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
