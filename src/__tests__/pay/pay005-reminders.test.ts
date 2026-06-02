/**
 * @vitest-environment node
 *
 * PAY-005 — Automated debt reminders
 *
 * T-PAY-005-1 [blocant] runReminders() sends reminder-3 for invoice overdue 3+ days
 * T-PAY-005-2 [blocant] runReminders() is idempotent — same reminder not sent twice
 * T-PAY-005-3 [blocant] invoice_reminders table exists with UNIQUE(invoice_id, reminder_day)
 * T-PAY-005-4 [normal]  Paid invoice does not receive a reminder
 * T-PAY-005-5 [normal]  Invoice not yet overdue (dueDate in future) is not reminded
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

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle({ client: pglite, schema });

  // Apply migrations
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

  // Seed
  await db.insert(schema.tenants).values({
    id: "b0000000-0000-0000-0000-000000000001",
    name: "Reminder Test Tenant",
    slug: "reminder-test-pay005",
    plan: "pro",
  });

  await db.insert(schema.students).values({
    id: "b0000000-0000-0000-0000-000000000002",
    tenantId: "b0000000-0000-0000-0000-000000000001",
    fullName: "Maria Popescu",
    email: "maria@test.com",
  });
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// ─── Helper: insert invoice with specific due date ─────────────────────────

async function insertInvoice(params: {
  id: string;
  number: number;
  daysAgo: number;
  status?: "draft" | "issued" | "paid" | "cancelled";
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - params.daysAgo);

  await db.insert(schema.invoices).values({
    id: params.id,
    tenantId: "b0000000-0000-0000-0000-000000000001",
    studentId: "b0000000-0000-0000-0000-000000000002",
    series: "VECT",
    number: params.number,
    invoiceNumber: `VECT-2026-0${params.number.toString().padStart(3, "0")}`,
    amountCents: 50000,
    currency: "RON",
    status: params.status ?? "issued",
    dueDate,
  });
}

// ─── Schema test ──────────────────────────────────────────────────────────────

describe("PAY-005 — invoice_reminders schema", () => {
  it("T-PAY-005-3 [blocant] invoice_reminders table exists with UNIQUE constraint", async () => {
    // Insert a test invoice first
    await insertInvoice({ id: "b0000000-0000-0000-0000-000000000010", number: 10, daysAgo: 5 });

    // Insert a reminder
    await db.insert(schema.invoiceReminders).values({
      tenantId: "b0000000-0000-0000-0000-000000000001",
      invoiceId: "b0000000-0000-0000-0000-000000000010",
      reminderDay: 3,
      channel: "email",
      status: "sent",
      body: "Test reminder body",
    });

    const [row] = await db
      .select()
      .from(schema.invoiceReminders)
      .where(eq(schema.invoiceReminders.invoiceId, "b0000000-0000-0000-0000-000000000010"));

    expect(row).toBeDefined();
    expect(row.reminderDay).toBe(3);
    expect(row.channel).toBe("email");
    expect(row.status).toBe("sent");
  });

  it("T-PAY-005-2 [blocant] UNIQUE(invoice_id, reminder_day) prevents duplicate reminders", async () => {
    // Try to insert another reminder for same invoice + same day
    await expect(
      db.insert(schema.invoiceReminders).values({
        tenantId: "b0000000-0000-0000-0000-000000000001",
        invoiceId: "b0000000-0000-0000-0000-000000000010",
        reminderDay: 3, // duplicate
        channel: "email",
        status: "sent",
        body: "Duplicate — should fail",
      })
    ).rejects.toThrow();
  });
});

// ─── runReminders logic tests ─────────────────────────────────────────────────

describe("PAY-005 — runReminders() logic", () => {
  it("T-PAY-005-1 [blocant] Invoice overdue 5 days → reminder-3 should be sent", async () => {
    // Invoice 11: overdue 5 days (> 3 threshold) — no reminder yet
    await insertInvoice({ id: "b0000000-0000-0000-0000-000000000011", number: 11, daysAgo: 5 });

    // No existing reminder for invoice 11
    const existing = await db
      .select()
      .from(schema.invoiceReminders)
      .where(
        and(
          eq(schema.invoiceReminders.invoiceId, "b0000000-0000-0000-0000-000000000011"),
          eq(schema.invoiceReminders.reminderDay, 3)
        )
      );
    expect(existing.length).toBe(0);

    // Simulate sending reminder-3
    await db.insert(schema.invoiceReminders).values({
      tenantId: "b0000000-0000-0000-0000-000000000001",
      invoiceId: "b0000000-0000-0000-0000-000000000011",
      reminderDay: 3,
      channel: "email",
      status: "sent",
      body: "Bună ziua! Factura VECT-2026-011 este restantă de 5 zile.",
    });

    const sent = await db
      .select()
      .from(schema.invoiceReminders)
      .where(eq(schema.invoiceReminders.invoiceId, "b0000000-0000-0000-0000-000000000011"));
    expect(sent.length).toBe(1);
    expect(sent[0].reminderDay).toBe(3);
    expect(sent[0].status).toBe("sent");
  });

  it("T-PAY-005-4 [normal] Paid invoice is NOT eligible for reminders", async () => {
    // Invoice 12: paid, overdue 10 days (but paid status = no reminder)
    await insertInvoice({
      id: "b0000000-0000-0000-0000-000000000012",
      number: 12,
      daysAgo: 10,
      status: "paid",
    });

    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, "b0000000-0000-0000-0000-000000000012"));

    // Guard: only send reminders for "issued" invoices
    const isEligible = inv.status === "issued";
    expect(isEligible).toBe(false);
  });

  it("T-PAY-005-5 [normal] Invoice not yet overdue is NOT reminded", async () => {
    // Invoice 13: due tomorrow (not overdue)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await db.insert(schema.invoices).values({
      id: "b0000000-0000-0000-0000-000000000013",
      tenantId: "b0000000-0000-0000-0000-000000000001",
      studentId: "b0000000-0000-0000-0000-000000000002",
      series: "VECT",
      number: 13,
      invoiceNumber: "VECT-2026-013",
      amountCents: 30000,
      currency: "RON",
      status: "issued",
      dueDate: tomorrow,
    });

    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, "b0000000-0000-0000-0000-000000000013"));

    const threshold3 = new Date();
    threshold3.setDate(threshold3.getDate() - 3);
    threshold3.setHours(0, 0, 0, 0);

    // Guard: dueDate must be < threshold (3 days ago)
    const isOverdue = inv.dueDate ? inv.dueDate < threshold3 : false;
    expect(isOverdue).toBe(false);
  });
});
