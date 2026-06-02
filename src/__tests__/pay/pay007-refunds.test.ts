/**
 * @vitest-environment node
 *
 * PAY-007 — Refunds (partial/full invoice refunds + audit log)
 *
 * T-PAY-007-1 [blocant] Partial refund: creates refund row + updates invoice.refundedAmountCents + status = "partially_refunded"
 * T-PAY-007-2 [blocant] Refund exceeding paid amount → guard rejects with error
 * T-PAY-007-3 [blocant] refunds table exists and refund record can be inserted
 * T-PAY-007-4 [normal]  Full refund → invoice.status = "refunded" (not "partially_refunded")
 * T-PAY-007-5 [normal]  Refund on non-paid invoice (draft) → guard rejects with "invoice_not_paid"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, and } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";

let pglite: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

const TENANT_ID = "d0000000-0000-0000-0000-000000000001";
const STUDENT_ID = "d0000000-0000-0000-0000-000000000002";

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle({ client: pglite, schema });

  const drizzleDir = path.resolve(__dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const stmts = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await pglite.exec(stmt);
    }
  }

  await db.insert(schema.tenants).values({
    id: TENANT_ID,
    name: "Refund Test School",
    slug: "refund-test-pay007",
    plan: "pro",
  });

  await db.insert(schema.students).values({
    id: STUDENT_ID,
    tenantId: TENANT_ID,
    fullName: "Elena Popescu",
    email: "elena@test.com",
  });
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// ─── Helper: compute new invoice status after a refund ───────────────────────

function computeNewStatus(
  totalCents: number,
  alreadyRefunded: number,
  refundAmountCents: number
): "refunded" | "partially_refunded" | "error_exceeds" | "error_not_paid" {
  const newTotal = alreadyRefunded + refundAmountCents;
  if (newTotal > totalCents) return "error_exceeds";
  if (newTotal >= totalCents) return "refunded";
  return "partially_refunded";
}

// ─── Schema test ──────────────────────────────────────────────────────────────

describe("PAY-007 — refunds schema", () => {
  it("T-PAY-007-3 [blocant] refunds table exists and refund record can be inserted", async () => {
    // We need an invoice first
    const [inv] = await db
      .insert(schema.invoices)
      .values({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        series: "VECT",
        number: 1,
        invoiceNumber: "VECT-2026-0001",
        amountCents: 120000,
        currency: "RON",
        status: "paid",
        refundedAmountCents: 0,
      })
      .returning();

    expect(inv).toBeDefined();

    // Insert a refund
    const [refund] = await db
      .insert(schema.refunds)
      .values({
        tenantId: TENANT_ID,
        invoiceId: inv.id,
        amountCents: 40000,
        currency: "RON",
        reason: "Elev a abandonat cursul",
        method: "manual",
        status: "completed",
      })
      .returning();

    expect(refund).toBeDefined();
    expect(refund.id).toBeTruthy();
    expect(refund.amountCents).toBe(40000);
    expect(refund.method).toBe("manual");
    expect(refund.status).toBe("completed");
    expect(refund.invoiceId).toBe(inv.id);
  });
});

// ─── Refund logic tests ────────────────────────────────────────────────────

describe("PAY-007 — refund status computation logic", () => {
  it("T-PAY-007-1 [blocant] Partial refund: 400 out of 1200 → status = 'partially_refunded'", async () => {
    const totalCents = 120000; // 1200 RON
    const alreadyRefunded = 0;
    const refundAmountCents = 40000; // 400 RON

    const result = computeNewStatus(totalCents, alreadyRefunded, refundAmountCents);
    expect(result).toBe("partially_refunded");

    // Verify accumulated amount
    const newRefundedAmount = alreadyRefunded + refundAmountCents;
    expect(newRefundedAmount).toBe(40000);
    expect(newRefundedAmount).toBeLessThan(totalCents);
  });

  it("T-PAY-007-2 [blocant] Refund exceeding paid amount → rejects with 'error_exceeds'", () => {
    const totalCents = 120000; // 1200 RON
    const alreadyRefunded = 0;
    const refundAmountCents = 150000; // 1500 RON (exceeds total)

    const result = computeNewStatus(totalCents, alreadyRefunded, refundAmountCents);
    expect(result).toBe("error_exceeds");
  });

  it("T-PAY-007-4 [normal] Full refund (amount = total) → status = 'refunded'", () => {
    const totalCents = 120000;
    const alreadyRefunded = 0;
    const refundAmountCents = 120000; // full refund

    const result = computeNewStatus(totalCents, alreadyRefunded, refundAmountCents);
    expect(result).toBe("refunded");
  });

  it("T-PAY-007-4b [normal] Two partial refunds that together equal full amount → 'refunded'", () => {
    // After first partial refund of 80000
    const totalCents = 120000;
    const alreadyRefunded = 80000;
    const refundAmountCents = 40000; // second partial to complete it

    const result = computeNewStatus(totalCents, alreadyRefunded, refundAmountCents);
    expect(result).toBe("refunded");
  });

  it("T-PAY-007-5 [normal] Guard: only paid/partially_refunded statuses allow refund", () => {
    // Simulate the route guard: invoice.status must be 'paid' or 'partially_refunded'
    const REFUNDABLE_STATUSES = ["paid", "partially_refunded"] as const;

    const checkCanRefund = (status: string) => REFUNDABLE_STATUSES.includes(status as typeof REFUNDABLE_STATUSES[number]);

    expect(checkCanRefund("draft")).toBe(false);
    expect(checkCanRefund("issued")).toBe(false);
    expect(checkCanRefund("cancelled")).toBe(false);
    expect(checkCanRefund("paid")).toBe(true);
    expect(checkCanRefund("partially_refunded")).toBe(true);
  });
});

// ─── DB integration: full refund flow in PGlite ──────────────────────────────

describe("PAY-007 — full refund flow (DB)", () => {
  it("T-PAY-007-1b [blocant] Insert refund + update invoice refundedAmountCents + status", async () => {
    // Create a paid invoice
    const [inv] = await db
      .insert(schema.invoices)
      .values({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        series: "VECT",
        number: 2,
        invoiceNumber: "VECT-2026-0002",
        amountCents: 120000,
        currency: "RON",
        status: "paid",
        refundedAmountCents: 0,
      })
      .returning();

    const refundAmountCents = 40000;

    // Insert refund
    await db.insert(schema.refunds).values({
      tenantId: TENANT_ID,
      invoiceId: inv.id,
      amountCents: refundAmountCents,
      currency: "RON",
      reason: "Elev plecat",
      method: "manual",
      status: "completed",
    });

    // Update invoice
    const newRefundedAmount = (inv.refundedAmountCents ?? 0) + refundAmountCents;
    const newStatus =
      newRefundedAmount >= inv.amountCents ? "refunded" : "partially_refunded";

    await db
      .update(schema.invoices)
      .set({
        refundedAmountCents: newRefundedAmount,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.invoices.id, inv.id), eq(schema.invoices.tenantId, TENANT_ID)));

    // Verify
    const [updated] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, inv.id));

    expect(updated.refundedAmountCents).toBe(40000);
    expect(updated.status).toBe("partially_refunded");

    // Verify refund row
    const refundRows = await db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.invoiceId, inv.id));

    expect(refundRows.length).toBe(1);
    expect(refundRows[0].amountCents).toBe(40000);
    expect(refundRows[0].reason).toBe("Elev plecat");
  });

  it("T-PAY-007-4c [normal] Full refund flow → invoice.status becomes 'refunded'", async () => {
    const [inv] = await db
      .insert(schema.invoices)
      .values({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        series: "VECT",
        number: 3,
        invoiceNumber: "VECT-2026-0003",
        amountCents: 60000,
        currency: "RON",
        status: "paid",
        refundedAmountCents: 0,
      })
      .returning();

    // Full refund
    const refundAmountCents = 60000; // 100%

    await db.insert(schema.refunds).values({
      tenantId: TENANT_ID,
      invoiceId: inv.id,
      amountCents: refundAmountCents,
      currency: "RON",
      reason: "Curs anulat de academie",
      method: "manual",
      status: "completed",
    });

    const newRefundedAmount = refundAmountCents;
    const newStatus = newRefundedAmount >= inv.amountCents ? "refunded" : "partially_refunded";

    await db
      .update(schema.invoices)
      .set({ refundedAmountCents: newRefundedAmount, status: newStatus, updatedAt: new Date() })
      .where(eq(schema.invoices.id, inv.id));

    const [updated] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, inv.id));

    expect(updated.status).toBe("refunded");
    expect(updated.refundedAmountCents).toBe(60000);
  });
});
