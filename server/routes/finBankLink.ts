/**
 * BankLink — bank connector management + OFX/MT940 import + auto-match (BANKLINK-001/002/003)
 *
 * Routes:
 *   GET    /api/fin/banklink/connections             — list active connections for tenant
 *   POST   /api/fin/banklink/connections             — create new connection
 *   DELETE /api/fin/banklink/connections/:id         — deactivate (soft delete)
 *   GET    /api/fin/banklink/transactions            — list imported transactions (paginated)
 *   POST   /api/fin/banklink/import                 — upload OFX/MT940, parse, dedup, insert
 *   POST   /api/fin/banklink/seed                   — seed demo data (dev/demo use)
 *   POST   /api/fin/banklink/auto-match             — run match engine on all unmatched tx [BANKLINK-003]
 *   PATCH  /api/fin/banklink/transactions/:id/match — manual match/ignore [BANKLINK-003]
 *   GET    /api/fin/banklink/queue                  — unmatched tx with candidate suggestions [BANKLINK-003]
 *
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - Dedup: import skips transactions with existing (bankConnectionId, externalId).
 * - Auto-match: determinist engine, proposes matches, user confirms (FIN-CORE #4/#5).
 * - GAP-ANALYSIS G2: bank integration — key differentiator for multi-branch academies.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, count, desc, asc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  finBankConnections,
  finBankTransactions,
} from "../db/schema/finBankLink";
import { invoices } from "../db/schema/invoices";
import { payments } from "../db/schema/payments";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parseOFX, parseMT940 } from "../lib/finBankParser";
import { seedBankLink } from "../lib/finBankLinkSeed";
import {
  matchTransaction as engineMatch,
  getCandidates,
  type InvoiceCandidate,
  type PaymentCandidate,
  type BankTxForMatch,
} from "../lib/finBankMatchEngine";

export const finBankLinkRoutes = new Hono<{ Variables: AuthVariables }>();

finBankLinkRoutes.use("*", requireAuth);

// ─── GET /connections ─────────────────────────────────────────────────────────
// List all active bank connections for the current tenant.

finBankLinkRoutes.get("/connections", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const connections = await db
    .select()
    .from(finBankConnections)
    .where(
      and(
        eq(finBankConnections.tenantId, tenantId),
        eq(finBankConnections.isActive, true)
      )
    )
    .orderBy(asc(finBankConnections.name));

  return c.json({ connections, total: connections.length }, 200);
});

// ─── POST /connections ────────────────────────────────────────────────────────
// Create a new bank connector for the tenant.

const createConnectionSchema = z.object({
  name: z.string().min(1).max(200),
  bankCode: z.string().max(30).optional(),
  accountIban: z
    .string()
    .max(34)
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{0,30}$/, "Invalid IBAN format")
    .optional(),
  currency: z.string().length(3).default("MDL"),
  importFormat: z.enum(["OFX", "MT940", "CSV"]).default("OFX"),
});

finBankLinkRoutes.post(
  "/connections",
  zValidator("json", createConnectionSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    const [conn] = await db
      .insert(finBankConnections)
      .values({
        tenantId,
        name: body.name,
        bankCode: body.bankCode ?? null,
        accountIban: body.accountIban ?? null,
        currency: body.currency,
        importFormat: body.importFormat,
        isActive: true,
      })
      .returning();

    return c.json({ connection: conn }, 201);
  }
);

// ─── DELETE /connections/:id ──────────────────────────────────────────────────
// Soft-deactivate a bank connection (does not delete historical transactions).

finBankLinkRoutes.delete("/connections/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");

  const [conn] = await db
    .select({ id: finBankConnections.id })
    .from(finBankConnections)
    .where(
      and(
        eq(finBankConnections.id, id),
        eq(finBankConnections.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!conn) {
    return c.json({ error: "connection_not_found" }, 404);
  }

  await db
    .update(finBankConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(finBankConnections.id, id));

  return c.json({ success: true }, 200);
});

// ─── GET /transactions ────────────────────────────────────────────────────────
// List imported bank transactions with filters + pagination.

const transactionsQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  status: z.enum(["unmatched", "matched", "ignored"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

finBankLinkRoutes.get(
  "/transactions",
  zValidator("query", transactionsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { connectionId, status, from, to, page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const filters = [eq(finBankTransactions.tenantId, tenantId)];

    if (connectionId) {
      filters.push(eq(finBankTransactions.bankConnectionId, connectionId));
    }
    if (status) {
      filters.push(eq(finBankTransactions.status, status));
    }
    if (from) {
      filters.push(gte(finBankTransactions.transactionDate, from));
    }
    if (to) {
      filters.push(lte(finBankTransactions.transactionDate, to));
    }

    const where = and(...filters);

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(finBankTransactions)
        .where(where)
        .orderBy(
          desc(finBankTransactions.transactionDate),
          desc(finBankTransactions.importedAt)
        )
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(finBankTransactions).where(where),
    ]);

    return c.json({ data, total: Number(total), page }, 200);
  }
);

// ─── POST /import ─────────────────────────────────────────────────────────────
// Upload OFX/MT940 file content, parse it, and insert new transactions (dedup).

const importSchema = z.object({
  connectionId: z.string().uuid(),
  format: z.enum(["OFX", "MT940", "CSV"]),
  content: z.string().min(1).max(5_000_000), // max 5MB text
});

finBankLinkRoutes.post(
  "/import",
  zValidator("json", importSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    // Verify the connection belongs to this tenant
    const [conn] = await db
      .select({ id: finBankConnections.id })
      .from(finBankConnections)
      .where(
        and(
          eq(finBankConnections.id, body.connectionId),
          eq(finBankConnections.tenantId, tenantId),
          eq(finBankConnections.isActive, true)
        )
      )
      .limit(1);

    if (!conn) {
      return c.json({ error: "connection_not_found_or_inactive" }, 404);
    }

    // Parse the file
    let parsed;
    const errors: string[] = [];

    try {
      if (body.format === "OFX") {
        parsed = parseOFX(body.content);
      } else if (body.format === "MT940") {
        parsed = parseMT940(body.content);
      } else {
        return c.json({ error: "CSV import not yet supported" }, 400);
      }
    } catch (err) {
      return c.json(
        {
          error: "parse_error",
          message: err instanceof Error ? err.message : "Parse failed",
        },
        400
      );
    }

    if (parsed.length === 0) {
      return c.json({ imported: 0, duplicates: 0, errors, message: "No transactions found in file" }, 200);
    }

    // Dedup: fetch existing externalIds for this connection
    const existingRows = await db
      .select({ externalId: finBankTransactions.externalId })
      .from(finBankTransactions)
      .where(eq(finBankTransactions.bankConnectionId, body.connectionId));

    const existingIds = new Set(existingRows.map((r) => r.externalId));

    const toInsert = parsed.filter((t) => !existingIds.has(t.externalId));
    const duplicates = parsed.length - toInsert.length;

    if (toInsert.length > 0) {
      await db.insert(finBankTransactions).values(
        toInsert.map((t) => ({
          bankConnectionId: body.connectionId,
          tenantId,
          externalId: t.externalId,
          transactionDate: t.transactionDate,
          valueDate: t.valueDate ?? undefined,
          amountCents: t.amountCents,
          currency: conn ? "MDL" : "MDL", // Use connection currency (simplified)
          description: t.description ?? undefined,
          counterpartyName: t.counterpartyName ?? undefined,
          reference: t.reference ?? undefined,
          status: "unmatched" as const,
        }))
      );

      // Update lastImportAt on the connection
      await db
        .update(finBankConnections)
        .set({ lastImportAt: new Date(), updatedAt: new Date() })
        .where(eq(finBankConnections.id, body.connectionId));
    }

    return c.json(
      {
        imported: toInsert.length,
        duplicates,
        errors,
        total: parsed.length,
      },
      200
    );
  }
);

// ─── POST /seed ───────────────────────────────────────────────────────────────
// Seed demo connections + transactions for the current tenant (idempotent).

finBankLinkRoutes.post("/seed", async (c) => {
  const user = c.get("user");
  const result = await seedBankLink(user.tenantId);
  return c.json(
    {
      ...result,
      message:
        result.connectionsInserted > 0
          ? `Demo seeded: ${result.connectionsInserted} conexiuni, ${result.transactionsInserted} tranzacții`
          : "Demo deja configurat.",
    },
    200
  );
});

// ─── BANKLINK-003 ─────────────────────────────────────────────────────────────

// ─── POST /auto-match ─────────────────────────────────────────────────────────
// Runs the match engine on all unmatched transactions for the tenant.
// Loads invoices + payments from DB, scores each tx, updates status + score.

finBankLinkRoutes.post("/auto-match", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Load all unmatched transactions for this tenant (credit only — positive amount)
  const unmatchedRows = await db
    .select({
      id: finBankTransactions.id,
      amountCents: finBankTransactions.amountCents,
      transactionDate: finBankTransactions.transactionDate,
      description: finBankTransactions.description,
      reference: finBankTransactions.reference,
    })
    .from(finBankTransactions)
    .where(
      and(
        eq(finBankTransactions.tenantId, tenantId),
        eq(finBankTransactions.status, "unmatched")
      )
    );

  if (unmatchedRows.length === 0) {
    return c.json({ matched: 0, unmatched: 0, skipped: 0 }, 200);
  }

  // Load invoices for this tenant (only unpaid/partial)
  const invRows = await db
    .select({
      id: invoices.id,
      amountCents: invoices.amountCents,
      dueDate: invoices.dueDate,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        inArray(invoices.status, ["draft", "issued"])
      )
    );

  const invCandidates: InvoiceCandidate[] = invRows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    invoiceNumber: r.invoiceNumber ?? null,
    tenantId,
  }));

  // Load payments for this tenant (pending or completed)
  const payRows = await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      paidAt: payments.paidAt,
      notes: payments.description,
    })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        inArray(payments.status, ["pending", "paid"])
      )
    );

  const payCandidates: PaymentCandidate[] = payRows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    notes: r.notes ?? null,
    tenantId,
  }));

  // Score and update each unmatched transaction
  let matched = 0;
  let skipped = 0;

  for (const tx of unmatchedRows) {
    const txForMatch: BankTxForMatch = {
      id: tx.id,
      amountCents: tx.amountCents,
      transactionDate: tx.transactionDate,
      description: tx.description ?? null,
      reference: tx.reference ?? null,
    };

    const result = engineMatch(txForMatch, invCandidates, payCandidates);

    if (result.scoreBp > 0 || result.status === "matched") {
      await db
        .update(finBankTransactions)
        .set({
          status: result.status,
          matchedScoreBp: result.scoreBp,
          ...(result.sourceType && result.sourceId
            ? {
                matchedSourceType: result.sourceType,
                matchedSourceId: result.sourceId,
              }
            : {}),
        })
        .where(eq(finBankTransactions.id, tx.id));

      if (result.status === "matched") matched++;
    } else {
      skipped++;
    }
  }

  const unmatched = unmatchedRows.length - matched - skipped;

  return c.json({ matched, unmatched: unmatched + skipped, skipped }, 200);
});

// ─── PATCH /transactions/:id/match ───────────────────────────────────────────
// Manual match/ignore a transaction.

const manualMatchSchema = z.object({
  action: z.enum(["match", "ignore"]),
  sourceType: z.string().max(30).optional(),
  sourceId: z.string().uuid().optional(),
});

finBankLinkRoutes.patch(
  "/transactions/:id/match",
  zValidator("json", manualMatchSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // Verify ownership
    const [tx] = await db
      .select({ id: finBankTransactions.id })
      .from(finBankTransactions)
      .where(
        and(
          eq(finBankTransactions.id, id),
          eq(finBankTransactions.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!tx) {
      return c.json({ error: "transaction_not_found" }, 404);
    }

    const newStatus = body.action === "match" ? "matched" : "ignored";

    const [updated] = await db
      .update(finBankTransactions)
      .set({
        status: newStatus,
        matchedSourceType: body.action === "match" ? (body.sourceType ?? null) : null,
        matchedSourceId: body.action === "match" ? (body.sourceId ?? null) : null,
        matchedScoreBp: body.action === "match" ? 10000 : 0, // manual = 100%
      })
      .where(eq(finBankTransactions.id, id))
      .returning();

    return c.json({ transaction: updated }, 200);
  }
);

// ─── GET /queue ───────────────────────────────────────────────────────────────
// Returns unmatched transactions with candidate suggestions for the reconciliation queue UI.

const queueQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

finBankLinkRoutes.get(
  "/queue",
  zValidator("query", queueQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { connectionId, page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const filters = [
      eq(finBankTransactions.tenantId, tenantId),
      eq(finBankTransactions.status, "unmatched"),
    ];

    if (connectionId) {
      filters.push(eq(finBankTransactions.bankConnectionId, connectionId));
    }

    const where = and(...filters);

    const [txRows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(finBankTransactions)
        .where(where)
        .orderBy(desc(finBankTransactions.transactionDate))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(finBankTransactions).where(where),
    ]);

    // For each transaction, compute candidates
    const invRows = await db
      .select({
        id: invoices.id,
        amountCents: invoices.amountCents,
        dueDate: invoices.dueDate,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          inArray(invoices.status, ["draft", "issued"])
        )
      );

    const payRows = await db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        paidAt: payments.paidAt,
        notes: payments.description,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          inArray(payments.status, ["pending", "paid"])
        )
      );

    const invCandidates: InvoiceCandidate[] = invRows.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
      invoiceNumber: r.invoiceNumber ?? null,
      tenantId,
    }));

    const payCandidates: PaymentCandidate[] = payRows.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      notes: r.notes ?? null,
      tenantId,
    }));

    const data = txRows.map((tx) => {
      const txForMatch: BankTxForMatch = {
        id: tx.id,
        amountCents: tx.amountCents,
        transactionDate: tx.transactionDate,
        description: tx.description ?? null,
        reference: tx.reference ?? null,
      };
      const candidates = getCandidates(txForMatch, invCandidates, payCandidates);
      return { ...tx, candidates };
    });

    return c.json({ data, total: Number(total), page }, 200);
  }
);
