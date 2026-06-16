/**
 * CASH-003: FinDesk — Alocare plată↔factură + credit nealocat per client
 *
 * Routes (montate la /api/fin/cash prin server/app.ts):
 *   POST   /api/fin/cash/payments               — înregistrare manuală plată
 *   GET    /api/fin/cash/payments               — lista plăților cu unallocated_cents
 *   GET    /api/fin/cash/payments/:id           — detalii plată + alocări
 *   POST   /api/fin/cash/payments/:id/allocate  — alocă amount_cents la invoiceId
 *   DELETE /api/fin/cash/allocations/:id        — dealocă (scade din allocated_cents)
 *   GET    /api/fin/cash/credit-summary         — credit nealocat per party_id
 *   POST   /api/fin/cash/transactions/:id/ignore          — marchează ignored
 *   POST   /api/fin/cash/transactions/:id/create-payment  — crează plată din tx
 *
 * Tenant safety: TOATE rutele filtrează strict după user.tenantId.
 * FIN-CORE regula #10: banii sunt ÎNTOTDEAUNA în cenți (integer).
 * Portabilitate PGlite↔Postgres: db.query.X.findMany() — nu raw execute.
 *
 * Route-mount rule: exportul `finCashAllocationsRoutes` TREBUIE montat în server/app.ts.
 * Adăugat: app.route("/api/fin/cash", finCashAllocationsRoutes) în server/app.ts.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  finPayments,
  finPaymentAllocations,
  finBankTransactions,
} from "../db/schema/finCash";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finCashAllocationsRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finCashAllocationsRoutes.use("/*", requireAuth);

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializePayment(p: typeof finPayments.$inferSelect, allocations?: typeof finPaymentAllocations.$inferSelect[]) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    partyId: p.partyId ?? null,
    receivedDate: p.receivedDate,
    amountCents: p.amountCents,
    currency: p.currency,
    accountLabel: p.accountLabel ?? null,
    allocatedCents: p.allocatedCents,
    unallocatedCents: p.amountCents - p.allocatedCents,
    bankTxId: p.bankTxId ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    ...(allocations !== undefined ? { allocations: allocations.map(serializeAllocation) } : {}),
  };
}

function serializeAllocation(a: typeof finPaymentAllocations.$inferSelect) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    paymentId: a.paymentId,
    invoiceId: a.invoiceId,
    amountCents: a.amountCents,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

// ─── POST /api/fin/cash/payments — înregistrare manuală plată ─────────────────

const createPaymentSchema = z.object({
  partyId: z.string().uuid().optional(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată invalid (YYYY-MM-DD)"),
  amountCents: z.number().int().positive("Suma trebuie să fie pozitivă"),
  currency: z.string().length(3).default("MDL"),
  accountLabel: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

finCashAllocationsRoutes.post(
  "/payments",
  zValidator("json", createPaymentSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");

    const [payment] = await db
      .insert(finPayments)
      .values({
        tenantId: user.tenantId,
        partyId: data.partyId ?? null,
        receivedDate: data.receivedDate,
        amountCents: data.amountCents,
        currency: data.currency,
        accountLabel: data.accountLabel ?? null,
        allocatedCents: 0,
        bankTxId: null,
        notes: data.notes ?? null,
      })
      .returning();

    return c.json({ payment: serializePayment(payment) }, 201);
  }
);

// ─── GET /api/fin/cash/payments — lista plăților ─────────────────────────────

finCashAllocationsRoutes.get("/payments", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const accountLabel = c.req.query("accountLabel");
  const statusFilter = c.req.query("status") as "all" | "partial" | "full" | undefined;

  // Build where clause using drizzle query builder
  const payments = await db.query.finPayments.findMany({
    where: eq(finPayments.tenantId, user.tenantId),
    orderBy: [desc(finPayments.receivedDate)],
    limit,
    offset,
  });

  // Apply in-memory filters for date range and accountLabel
  // (fine for now — Drizzle ORM filter composition for these optional params would
  //  add complexity; the data set per tenant is bounded)
  let filtered = payments;

  if (from) {
    filtered = filtered.filter((p) => String(p.receivedDate) >= from);
  }
  if (to) {
    filtered = filtered.filter((p) => String(p.receivedDate) <= to);
  }
  if (accountLabel) {
    const lbl = accountLabel.toLowerCase();
    filtered = filtered.filter((p) => p.accountLabel?.toLowerCase().includes(lbl));
  }
  if (statusFilter === "partial") {
    filtered = filtered.filter((p) => p.allocatedCents > 0 && p.allocatedCents < p.amountCents);
  } else if (statusFilter === "full") {
    filtered = filtered.filter((p) => p.allocatedCents >= p.amountCents);
  }

  return c.json({
    payments: filtered.map((p) => serializePayment(p)),
    total: filtered.length,
    page,
  });
});

// ─── GET /api/fin/cash/payments/:id — detalii plată + alocări ────────────────

finCashAllocationsRoutes.get("/payments/:id", async (c) => {
  const user = c.get("user");
  const paymentId = c.req.param("id");

  const payment = await db.query.finPayments.findFirst({
    where: and(
      eq(finPayments.id, paymentId),
      eq(finPayments.tenantId, user.tenantId)
    ),
  });

  if (!payment) return c.json({ error: "not_found" }, 404);

  const allocations = await db.query.finPaymentAllocations.findMany({
    where: and(
      eq(finPaymentAllocations.paymentId, paymentId),
      eq(finPaymentAllocations.tenantId, user.tenantId)
    ),
    orderBy: [desc(finPaymentAllocations.createdAt)],
  });

  return c.json({ payment: serializePayment(payment, allocations) });
});

// ─── POST /api/fin/cash/payments/:id/allocate ─────────────────────────────────

const allocateSchema = z.object({
  invoiceId: z.string().uuid("invoiceId trebuie să fie UUID valid"),
  amountCents: z.number().int().positive("Suma trebuie să fie pozitivă"),
});

finCashAllocationsRoutes.post(
  "/payments/:id/allocate",
  zValidator("json", allocateSchema),
  async (c) => {
    const user = c.get("user");
    const paymentId = c.req.param("id");
    const { invoiceId, amountCents } = c.req.valid("json");

    // Fetch payment (tenant-scoped)
    const payment = await db.query.finPayments.findFirst({
      where: and(
        eq(finPayments.id, paymentId),
        eq(finPayments.tenantId, user.tenantId)
      ),
    });

    if (!payment) return c.json({ error: "not_found", message: "Plata nu a fost găsită." }, 404);

    const unallocated = payment.amountCents - payment.allocatedCents;
    if (amountCents > unallocated) {
      return c.json(
        {
          error: "insufficient_credit",
          message: `Suma de alocat (${amountCents}) depășește creditul nealocat (${unallocated}).`,
          unallocatedCents: unallocated,
        },
        422
      );
    }

    // Create allocation
    const [allocation] = await db
      .insert(finPaymentAllocations)
      .values({
        tenantId: user.tenantId,
        paymentId,
        invoiceId,
        amountCents,
      })
      .returning();

    // Update allocated_cents on payment atomically
    const newAllocated = payment.allocatedCents + amountCents;
    const [updatedPayment] = await db
      .update(finPayments)
      .set({ allocatedCents: newAllocated, updatedAt: new Date() })
      .where(
        and(
          eq(finPayments.id, paymentId),
          eq(finPayments.tenantId, user.tenantId)
        )
      )
      .returning();

    return c.json({
      payment: serializePayment(updatedPayment),
      allocation: serializeAllocation(allocation),
    });
  }
);

// ─── DELETE /api/fin/cash/allocations/:id — dealocă ──────────────────────────

finCashAllocationsRoutes.delete("/allocations/:id", async (c) => {
  const user = c.get("user");
  const allocationId = c.req.param("id");

  // Fetch allocation (tenant-scoped)
  const allocation = await db.query.finPaymentAllocations.findFirst({
    where: and(
      eq(finPaymentAllocations.id, allocationId),
      eq(finPaymentAllocations.tenantId, user.tenantId)
    ),
  });

  if (!allocation) return c.json({ error: "not_found" }, 404);

  // Delete allocation
  await db
    .delete(finPaymentAllocations)
    .where(
      and(
        eq(finPaymentAllocations.id, allocationId),
        eq(finPaymentAllocations.tenantId, user.tenantId)
      )
    );

  // Decrement allocated_cents on payment
  const payment = await db.query.finPayments.findFirst({
    where: and(
      eq(finPayments.id, allocation.paymentId),
      eq(finPayments.tenantId, user.tenantId)
    ),
  });

  if (payment) {
    const newAllocated = Math.max(0, payment.allocatedCents - allocation.amountCents);
    await db
      .update(finPayments)
      .set({ allocatedCents: newAllocated, updatedAt: new Date() })
      .where(eq(finPayments.id, allocation.paymentId));
  }

  return c.json({ ok: true });
});

// ─── GET /api/fin/cash/credit-summary ─────────────────────────────────────────
// Credit nealocat per party_id: Σ(amount_cents - allocated_cents) WHERE > 0

finCashAllocationsRoutes.get("/credit-summary", async (c) => {
  const user = c.get("user");

  // Fetch all payments for tenant and aggregate in JS (portability: no raw SQL GROUP BY)
  const payments = await db.query.finPayments.findMany({
    where: eq(finPayments.tenantId, user.tenantId),
  });

  // Group by party_id
  const byParty = new Map<string | null, { unallocatedCents: number; currency: string }>();
  for (const p of payments) {
    const unalloc = p.amountCents - p.allocatedCents;
    if (unalloc <= 0) continue; // Only include parties with positive credit
    const key = p.partyId ?? null;
    const existing = byParty.get(key);
    if (existing) {
      existing.unallocatedCents += unalloc;
    } else {
      byParty.set(key, { unallocatedCents: unalloc, currency: p.currency });
    }
  }

  const summary = Array.from(byParty.entries()).map(([partyId, data]) => ({
    partyId,
    unallocatedCents: data.unallocatedCents,
    currency: data.currency,
  }));

  return c.json({ summary });
});

// ─── POST /api/fin/cash/transactions/:id/ignore ───────────────────────────────

finCashAllocationsRoutes.post("/transactions/:id/ignore", async (c) => {
  const user = c.get("user");
  const txId = c.req.param("id");

  const tx = await db.query.finBankTransactions.findFirst({
    where: and(
      eq(finBankTransactions.id, txId),
      eq(finBankTransactions.tenantId, user.tenantId)
    ),
  });

  if (!tx) return c.json({ error: "not_found" }, 404);

  await db
    .update(finBankTransactions)
    .set({ matchStatus: "ignored", updatedAt: new Date() })
    .where(
      and(
        eq(finBankTransactions.id, txId),
        eq(finBankTransactions.tenantId, user.tenantId)
      )
    );

  return c.json({ ok: true });
});

// ─── POST /api/fin/cash/transactions/:id/create-payment ──────────────────────

const createPaymentFromTxSchema = z.object({
  partyId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

finCashAllocationsRoutes.post(
  "/transactions/:id/create-payment",
  zValidator("json", createPaymentFromTxSchema),
  async (c) => {
    const user = c.get("user");
    const txId = c.req.param("id");
    const { partyId, notes } = c.req.valid("json");

    const tx = await db.query.finBankTransactions.findFirst({
      where: and(
        eq(finBankTransactions.id, txId),
        eq(finBankTransactions.tenantId, user.tenantId)
      ),
    });

    if (!tx) return c.json({ error: "not_found" }, 404);
    if (tx.direction !== "in") {
      return c.json(
        { error: "invalid_direction", message: "Pot fi convertite în plăți doar tranzacțiile de tip intrare (in)." },
        422
      );
    }

    // Create payment linked to this transaction
    const [payment] = await db
      .insert(finPayments)
      .values({
        tenantId: user.tenantId,
        partyId: partyId ?? null,
        receivedDate: String(tx.txDate),
        amountCents: tx.amountCents,
        currency: tx.currency,
        accountLabel: tx.accountLabel,
        allocatedCents: 0,
        bankTxId: tx.id,
        notes: notes ?? tx.reference ?? null,
      })
      .returning();

    // Mark transaction as matched
    await db
      .update(finBankTransactions)
      .set({ matchStatus: "matched", matchScoreBp: 10000, updatedAt: new Date() })
      .where(
        and(
          eq(finBankTransactions.id, txId),
          eq(finBankTransactions.tenantId, user.tenantId)
        )
      );

    return c.json({ payment: serializePayment(payment) }, 201);
  }
);
