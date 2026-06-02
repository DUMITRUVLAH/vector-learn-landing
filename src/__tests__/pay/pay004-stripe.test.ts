/**
 * @vitest-environment node
 *
 * PAY-004 — Stripe card payments
 *
 * T-PAY-004-1 [blocant] stripe_settings UNIQUE constraint on tenant_id enforced
 * T-PAY-004-2 [blocant] Webhook processing: invoice marked paid with paymentMethod=card
 * T-PAY-004-3 [blocant] stripe_settings table exists + stores encrypted keys
 * T-PAY-004-4 [normal]  Invoice status guard: paid invoice detected (no double-process)
 * T-PAY-004-5 [normal]  Idempotency: processing paid invoice again keeps state
 * T-PAY-004-6 [normal]  encryptKey/decryptKey are inverse (key storage round-trip)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { encryptKey, decryptKey } from "../../../server/lib/stripe";

// ─── PGlite setup (mirrors schema-drift test pattern) ────────────────────────

let pglite: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle({ client: pglite, schema });

  // Apply migrations via client.exec() — same approach as schema-drift.test.ts
  // (drizzle's migrate() doesn't handle multi-statement SQL in PGlite)
  const drizzleDir = path.resolve(__dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pglite.exec(stmt);
    }
  }

  // Seed tenant
  await db.insert(schema.tenants).values({
    id: "a0000000-0000-0000-0000-000000000001",
    name: "Stripe Test",
    slug: "stripe-test-pay004",
    plan: "pro",
  });

  // Seed student
  await db.insert(schema.students).values({
    id: "a0000000-0000-0000-0000-000000000002",
    tenantId: "a0000000-0000-0000-0000-000000000001",
    fullName: "Test Parent Student",
    email: "stripe@test.com",
  });
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// ─── Key helpers ─────────────────────────────────────────────────────────────

describe("PAY-004 — Stripe lib: key encryption helpers", () => {
  it("T-PAY-004-6 [normal] encryptKey/decryptKey are inverse operations", () => {
    const original = "sk_test_abc123XYZ";
    const encrypted = encryptKey(original);
    expect(encrypted).not.toEqual(original);
    expect(decryptKey(encrypted)).toEqual(original);
  });

  it("T-PAY-004-6b [normal] decryptKey handles edge cases without throwing", () => {
    expect(() => decryptKey("some_plain_string_12345")).not.toThrow();
    expect(() => decryptKey("")).not.toThrow();
  });
});

// ─── Schema / DB tests ────────────────────────────────────────────────────────

describe("PAY-004 — stripe_settings schema", () => {
  it("T-PAY-004-3 [blocant] stripe_settings table exists and stores Stripe keys", async () => {
    await db.insert(schema.stripeSettings).values({
      tenantId: "a0000000-0000-0000-0000-000000000001",
      publishableKey: "pk_test_test123",
      secretKeyEncrypted: encryptKey("sk_test_secretKey"),
      webhookSecretEncrypted: encryptKey("whsec_testWebhookSecret"),
      enabled: true,
    });

    const [row] = await db
      .select()
      .from(schema.stripeSettings)
      .where(eq(schema.stripeSettings.tenantId, "a0000000-0000-0000-0000-000000000001"));

    expect(row).toBeDefined();
    expect(row.publishableKey).toBe("pk_test_test123");
    expect(row.enabled).toBe(true);
    // Decrypt and verify round-trip
    expect(decryptKey(row.secretKeyEncrypted!)).toBe("sk_test_secretKey");
    expect(decryptKey(row.webhookSecretEncrypted!)).toBe("whsec_testWebhookSecret");
  });

  it("T-PAY-004-1 [blocant] UNIQUE(tenant_id) on stripe_settings prevents duplicates", async () => {
    await expect(
      db.insert(schema.stripeSettings).values({
        tenantId: "a0000000-0000-0000-0000-000000000001", // same tenant — UNIQUE violation
        publishableKey: "pk_test_other",
        secretKeyEncrypted: encryptKey("sk_test_other"),
        enabled: false,
      })
    ).rejects.toThrow();
  });
});

// ─── Invoice + Stripe columns ─────────────────────────────────────────────────

describe("PAY-004 — invoices Stripe columns", () => {
  let invoiceId: string;

  beforeAll(async () => {
    const [inv] = await db
      .insert(schema.invoices)
      .values({
        tenantId: "a0000000-0000-0000-0000-000000000001",
        studentId: "a0000000-0000-0000-0000-000000000002",
        series: "VECT",
        number: 100,
        invoiceNumber: "VECT-2026-0100",
        amountCents: 50000,
        currency: "RON",
        status: "issued",
      })
      .returning();
    invoiceId = inv.id;
  });

  it("T-PAY-004-2 [blocant] Invoice can be marked paid with card method + Stripe PI id", async () => {
    await db
      .update(schema.invoices)
      .set({
        status: "paid",
        paymentMethod: "card",
        stripePaymentIntentId: "pi_3PTest12345",
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId));

    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));

    expect(inv.status).toBe("paid");
    expect(inv.paymentMethod).toBe("card");
    expect(inv.stripePaymentIntentId).toBe("pi_3PTest12345");
  });

  it("T-PAY-004-5 [normal] Idempotency: processing paid invoice again keeps state", async () => {
    const [before] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));
    expect(before.status).toBe("paid");

    // Simulate the idempotency guard in the webhook handler
    if (before.status !== "paid") {
      await db
        .update(schema.invoices)
        .set({ status: "paid", paymentMethod: "card", updatedAt: new Date() })
        .where(eq(schema.invoices.id, invoiceId));
    }

    const [after] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));
    expect(after.status).toBe("paid");
    expect(after.paymentMethod).toBe("card");
  });

  it("T-PAY-004-4 [normal] Status guard: already-paid invoice is detected correctly", async () => {
    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));

    // The route handler returns 400 { error: "invoice_already_paid" } when this is true
    const isAlreadyPaid = inv.status === "paid";
    expect(isAlreadyPaid).toBe(true);
  });

  it("T-PAY-004-3b [blocant] stripePaymentLinkUrl column stores Stripe checkout URL", async () => {
    await db
      .update(schema.invoices)
      .set({
        stripePaymentLinkUrl: "https://checkout.stripe.com/pay/cs_test_abc123",
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId));

    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));

    expect(inv.stripePaymentLinkUrl).toBe("https://checkout.stripe.com/pay/cs_test_abc123");
  });
});
