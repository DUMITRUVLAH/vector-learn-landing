/**
 * GAP-014 — Stripe Checkout routes
 *
 * Routes:
 *   POST /api/payments/stripe/checkout   — create Stripe Checkout session
 *   POST /api/payments/stripe/webhook    — handle Stripe webhook (no-auth)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { invoices } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const router = new Hono<{ Variables: AuthVariables }>();

// ─── POST /api/payments/stripe/checkout ──────────────────────────────────────
// Authenticated: manager creates checkout session for an invoice
router.post(
  "/checkout",
  requireAuth,
  zValidator("json", z.object({ invoiceId: z.string().uuid() })),
  async (c) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return c.json({ error: "stripe_not_configured" }, 503);

    const tenantId = c.get("tenantId");
    const { invoiceId } = c.req.valid("json");

    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!rows.length) return c.json({ error: "invoice_not_found" }, 404);
    const invoice = rows[0];
    if (invoice.status === "paid") return c.json({ error: "already_paid" }, 409);

    // Dynamically import stripe to avoid crashing when not installed
    let Stripe: typeof import("stripe").default;
    try {
      Stripe = (await import("stripe")).default;
    } catch {
      return c.json({ error: "stripe_sdk_missing" }, 503);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: { name: `Factură ${invoice.invoiceNumber}` },
            unit_amount: invoice.amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appUrl}/#/app/invoices?paid=1`,
      cancel_url: `${appUrl}/#/app/invoices`,
      metadata: { invoiceId, tenantId },
    });

    // Persist session id
    await db
      .update(invoices)
      .set({ stripeSessionId: session.id })
      .where(eq(invoices.id, invoiceId));

    return c.json({ checkoutUrl: session.url });
  }
);

// ─── POST /api/payments/stripe/webhook ───────────────────────────────────────
// No-auth: Stripe calls this endpoint
router.post("/webhook", async (c) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) return c.json({ error: "stripe_not_configured" }, 503);

  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "missing_signature" }, 401);

  let Stripe: typeof import("stripe").default;
  try {
    Stripe = (await import("stripe")).default;
  } catch {
    return c.json({ error: "stripe_sdk_missing" }, 503);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const body = await c.req.text();

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return c.json({ error: "invalid_signature" }, 401);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as import("stripe").Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    if (invoiceId) {
      await db
        .update(invoices)
        .set({
          status: "paid",
          stripePaymentIntentId: paymentIntentId ?? undefined,
          paidOnline: "true",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));
    }
  }

  return c.json({ received: true });
});

export { router as stripePaymentRoutes };
