/**
 * PAY-004: Stripe payment routes.
 *
 * POST /api/invoices/:id/stripe-link  — create Stripe Checkout session for an invoice
 * POST /api/webhooks/stripe           — receive Stripe webhooks (payment_intent.succeeded, etc.)
 * GET  /api/settings/stripe           — get Stripe settings for tenant (masked)
 * POST /api/settings/stripe           — upsert Stripe settings
 * POST /api/settings/stripe/test      — test Stripe connection (list charges limit 0)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, stripeSettings, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  buildStripeClient,
  createInvoiceCheckoutSession,
  constructWebhookEvent,
  encryptKey,
  decryptKey,
} from "../lib/stripe";

export const stripeRoutes = new Hono<{ Variables: AuthVariables }>();
/** Public webhook endpoint — no auth, signature validation instead */
export const stripeWebhookRoutes = new Hono();

// ─── Stripe Settings ─────────────────────────────────────────────────────────

stripeRoutes.use("*", requireAuth);

const stripeSettingsSchema = z.object({
  publishableKey: z.string().min(1).startsWith("pk_"),
  secretKey: z.string().min(1).startsWith("sk_"),
  webhookSecret: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
});

/** GET /api/settings/stripe — return current settings (keys masked) */
stripeRoutes.get("/settings/stripe", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(stripeSettings)
    .where(eq(stripeSettings.tenantId, tenantId))
    .limit(1);
  const setting = rows[0];
  if (!setting) {
    return c.json({ configured: false, enabled: false });
  }
  return c.json({
    configured: true,
    enabled: setting.enabled,
    publishableKey: setting.publishableKey,
    // Mask secret keys — show only last 4 chars
    secretKeyMasked: setting.secretKeyEncrypted
      ? "sk_...".padEnd(20, "*") + decryptKey(setting.secretKeyEncrypted).slice(-4)
      : null,
    webhookSecretConfigured: !!setting.webhookSecretEncrypted,
  });
});

/** POST /api/settings/stripe — save Stripe keys */
stripeRoutes.post(
  "/settings/stripe",
  zValidator("json", stripeSettingsSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { publishableKey, secretKey, webhookSecret, enabled } = c.req.valid("json");

    const existing = await db
      .select({ id: stripeSettings.id })
      .from(stripeSettings)
      .where(eq(stripeSettings.tenantId, tenantId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(stripeSettings)
        .set({
          publishableKey,
          secretKeyEncrypted: encryptKey(secretKey),
          webhookSecretEncrypted: webhookSecret ? encryptKey(webhookSecret) : null,
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(stripeSettings.tenantId, tenantId));
    } else {
      await db.insert(stripeSettings).values({
        tenantId,
        publishableKey,
        secretKeyEncrypted: encryptKey(secretKey),
        webhookSecretEncrypted: webhookSecret ? encryptKey(webhookSecret) : null,
        enabled,
      });
    }

    return c.json({ ok: true });
  }
);

/** POST /api/settings/stripe/test — test Stripe connection */
stripeRoutes.post("/settings/stripe/test", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(stripeSettings)
    .where(and(eq(stripeSettings.tenantId, tenantId), eq(stripeSettings.enabled, true)))
    .limit(1);
  const setting = rows[0];
  if (!setting?.secretKeyEncrypted) {
    return c.json({ ok: false, error: "stripe_not_configured" }, 400);
  }
  try {
    const stripe = buildStripeClient(decryptKey(setting.secretKeyEncrypted));
    await stripe.charges.list({ limit: 1 });
    return c.json({ ok: true, message: "Stripe connection successful" });
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "stripe_error" },
      400
    );
  }
});

// ─── Invoice Payment Link ─────────────────────────────────────────────────────

const stripeLinkSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/** POST /api/invoices/:id/stripe-link — create or return existing Stripe payment link */
stripeRoutes.post(
  "/invoices/:id/stripe-link",
  zValidator("json", stripeLinkSchema.optional()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const invoiceId = c.req.param("id");

    // Load invoice
    const invRows = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        studentId: invoices.studentId,
        invoiceNumber: invoices.invoiceNumber,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
        stripePaymentLinkUrl: invoices.stripePaymentLinkUrl,
        stripePaymentIntentId: invoices.stripePaymentIntentId,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    const invoice = invRows[0];
    if (!invoice) return c.json({ error: "not_found" }, 404);
    if (invoice.status === "paid") {
      return c.json({ error: "invoice_already_paid" }, 400);
    }
    if (invoice.status === "cancelled") {
      return c.json({ error: "invoice_cancelled" }, 400);
    }

    // Load Stripe settings for this tenant
    const settingsRows = await db
      .select()
      .from(stripeSettings)
      .where(and(eq(stripeSettings.tenantId, tenantId), eq(stripeSettings.enabled, true)))
      .limit(1);
    const settings = settingsRows[0];
    if (!settings?.secretKeyEncrypted) {
      return c.json({ error: "stripe_not_configured" }, 400);
    }

    // Return existing link if still valid (reuse)
    if (invoice.stripePaymentLinkUrl) {
      return c.json({
        url: invoice.stripePaymentLinkUrl,
        paymentIntentId: invoice.stripePaymentIntentId,
        reused: true,
      });
    }

    // Load student name
    const stuRows = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(eq(students.id, invoice.studentId))
      .limit(1);
    const studentName = stuRows[0]?.fullName ?? "Student";

    const baseUrl = process.env.APP_URL ?? "http://localhost:5173";
    const body = c.req.valid("json") ?? {};
    const successUrl =
      (body as { successUrl?: string }).successUrl ?? `${baseUrl}/#/app/payments?paid=1`;
    const cancelUrl =
      (body as { cancelUrl?: string }).cancelUrl ?? `${baseUrl}/#/app/payments`;

    const stripe = buildStripeClient(decryptKey(settings.secretKeyEncrypted));
    const session = await createInvoiceCheckoutSession(stripe, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      studentName,
      successUrl,
      cancelUrl,
    });

    // Persist payment intent ID and link URL on invoice
    await db
      .update(invoices)
      .set({
        stripePaymentIntentId: session.paymentIntentId,
        stripePaymentLinkUrl: session.url,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    return c.json({
      url: session.url,
      paymentIntentId: session.paymentIntentId,
      expiresAt: session.expiresAt.toISOString(),
      reused: false,
    });
  }
);

// ─── Webhook Handler ──────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/stripe — Stripe sends events here.
 * No requireAuth — uses webhook signature verification instead.
 */
stripeWebhookRoutes.post("/webhooks/stripe", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("stripe-signature");

  if (!sig) {
    return c.json({ error: "missing_signature" }, 400);
  }

  // We must verify the signature but we don't know which tenant this is for
  // without parsing the event first. Strategy: parse unverified, find invoice,
  // load tenant's webhook secret, re-verify. This is safe because we verify
  // before acting on the data.
  let unverifiedEvent: {
    type: string;
    data: { object: Record<string, unknown> };
    id: string;
  };
  try {
    unverifiedEvent = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const eventType = unverifiedEvent.type;
  const paymentIntent = unverifiedEvent.data?.object as {
    id?: string;
    metadata?: { invoice_id?: string };
    amount_received?: number;
    currency?: string;
  };

  if (!paymentIntent?.metadata?.invoice_id) {
    // Event not related to our invoices — acknowledge anyway
    return c.json({ received: true });
  }

  const invoiceId = paymentIntent.metadata.invoice_id;

  // Load invoice to get tenantId
  const invRows = await db
    .select({ tenantId: invoices.tenantId, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  const invoice = invRows[0];
  if (!invoice) {
    return c.json({ error: "invoice_not_found" }, 400);
  }

  // Load tenant's Stripe settings for signature verification
  const settingsRows = await db
    .select()
    .from(stripeSettings)
    .where(eq(stripeSettings.tenantId, invoice.tenantId))
    .limit(1);
  const settings = settingsRows[0];

  // Signature verification is MANDATORY (security C-1 / IMPROVEMENTS #2). An event we cannot
  // cryptographically verify is rejected and NEVER mutates an invoice. Previously, if a tenant
  // had no webhook secret configured, this block was skipped and the code fell through to mark
  // the invoice paid — so an unauthenticated attacker who guessed an invoice UUID could POST a
  // fake `payment_intent.succeeded` and get a free enrollment. No secret ⇒ no trust ⇒ 400.
  if (!settings?.webhookSecretEncrypted || !settings?.secretKeyEncrypted) {
    return c.json({ error: "webhook_not_configured" }, 400);
  }
  try {
    const stripe = buildStripeClient(decryptKey(settings.secretKeyEncrypted));
    constructWebhookEvent(stripe, rawBody, sig, decryptKey(settings.webhookSecretEncrypted));
  } catch {
    return c.json({ error: "invalid_signature" }, 400);
  }

  // Process events
  if (eventType === "payment_intent.succeeded") {
    if (invoice.status !== "paid") {
      await db
        .update(invoices)
        .set({
          status: "paid",
          paymentMethod: "card",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));
    }
    return c.json({ received: true, action: "invoice_marked_paid" });
  }

  if (eventType === "payment_intent.payment_failed") {
    // Log but don't change status — invoice remains pending
    // In production, insert into invoice_events table
    return c.json({ received: true, action: "failure_logged" });
  }

  if (eventType === "checkout.session.completed") {
    // Also mark paid from checkout session complete (belt-and-suspenders)
    if (invoice.status !== "paid") {
      await db
        .update(invoices)
        .set({
          status: "paid",
          paymentMethod: "card",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));
    }
    return c.json({ received: true, action: "invoice_marked_paid_via_checkout" });
  }

  return c.json({ received: true, action: "noop" });
});
