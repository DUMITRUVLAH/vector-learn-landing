/**
 * CASH-002: FinDesk — Import extras bancar + reconciliere
 *
 * Routes (montate la /api/fin/cash):
 *   POST  /api/fin/cash/import               — upload CSV sau MT940
 *   GET   /api/fin/cash/transactions          — lista tranzacții paginată
 *   GET   /api/fin/cash/unmatched             — tranzacții nereconsiliate
 *   POST  /api/fin/cash/transactions/:id/match — alocare manuală
 *
 * Tenant safety: TOATE rutele filtrează strict după user.tenantId.
 * FIN-CORE regula #4: reconcilierea este deterministă (nu AI).
 * FIN-CORE regula #5: coada `unmatched` rămâne pentru alocare manuală.
 *
 * Route-mount rule: exportul `finCashRoutes` TREBUIE montat în server/app.ts.
 * Adăugat: app.route("/api/fin/cash", finCashRoutes) în server/app.ts.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  finBankTransactions,
  finPaymentAllocations,
  finPayments,
} from "../db/schema/finCash";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parseCsv } from "../lib/fin/csvParser";
import { parseMt940 } from "../lib/fin/mt940Parser";
import { reconcile, isDuplicate, type TxSignature } from "../lib/fin/reconcileEngine";
import { randomUUID } from "crypto";

export const finCashRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finCashRoutes.use("/*", requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeTx(tx: typeof finBankTransactions.$inferSelect) {
  return {
    id: tx.id,
    tenantId: tx.tenantId,
    accountLabel: tx.accountLabel,
    txDate: tx.txDate,
    amountCents: tx.amountCents,
    currency: tx.currency,
    reference: tx.reference ?? null,
    counterparty: tx.counterparty ?? null,
    direction: tx.direction,
    importBatchId: tx.importBatchId,
    matchStatus: tx.matchStatus,
    matchScoreBp: tx.matchScoreBp,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
  };
}

function serializePayment(p: typeof finPayments.$inferSelect) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    partyId: p.partyId ?? null,
    receivedDate: p.receivedDate,
    amountCents: p.amountCents,
    currency: p.currency,
    accountLabel: p.accountLabel ?? null,
    allocatedCents: p.allocatedCents,
    bankTxId: p.bankTxId ?? null,
    notes: p.notes ?? null,
    unallocatedCents: p.amountCents - p.allocatedCents,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

// ─── POST /api/fin/cash/import ────────────────────────────────────────────────

finCashRoutes.post("/import", async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";

  let fileName = "unknown.csv";
  let fileContent = "";
  let fileType: "csv" | "mt940" = "csv";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ error: "file_required", message: "Câmpul 'file' este obligatoriu." }, 400);
    }
    fileName = file.name;
    fileContent = await file.text();
  } else {
    // JSON mode for testing
    const body = await c.req.json<{ fileName?: string; content?: string; type?: string }>();
    fileName = body.fileName ?? "test.csv";
    fileContent = body.content ?? "";
    if (body.type) fileType = body.type as "csv" | "mt940";
  }

  // Detect file type from extension if not forced
  if (!contentType.includes("multipart") && !fileContent.startsWith("{")) {
    // Already set from body.type
  } else if (fileName.endsWith(".mt940") || fileName.endsWith(".sta") || fileContent.includes(":61:")) {
    fileType = "mt940";
  }

  // Parse
  const parseResult = fileType === "mt940" ? parseMt940(fileContent) : parseCsv(fileContent);
  if (parseResult.rows.length === 0) {
    return c.json({
      error: "parse_failed",
      message: "Nu s-au putut extrage tranzacții din fișier.",
      parseErrors: parseResult.errors,
    }, 422);
  }

  // Load existing signatures for duplicate detection
  const existingTxs = await db.query.finBankTransactions.findMany({
    where: eq(finBankTransactions.tenantId, user.tenantId),
  });

  const existingSignatures: TxSignature[] = existingTxs.map((t) => ({
    accountLabel: t.accountLabel,
    txDate: String(t.txDate),
    amountCents: t.amountCents,
    reference: t.reference ?? null,
  }));

  const batchId = randomUUID();
  let imported = 0;
  let duplicates = 0;

  // Insert rows
  const insertedTxs: Array<typeof finBankTransactions.$inferSelect> = [];
  for (const row of parseResult.rows) {
    const sig: TxSignature = {
      accountLabel: row.reference ?? "import",
      txDate: row.txDate,
      amountCents: row.amountCents,
      reference: row.reference,
    };

    if (isDuplicate(sig, existingSignatures)) {
      duplicates++;
      // Insert with duplicate status
      const [dup] = await db
        .insert(finBankTransactions)
        .values({
          tenantId: user.tenantId,
          accountLabel: "import",
          txDate: row.txDate,
          amountCents: row.amountCents,
          currency: row.currency,
          reference: row.reference ?? null,
          counterparty: row.counterparty ?? null,
          direction: row.direction,
          importBatchId: batchId,
          matchStatus: "duplicate",
          matchScoreBp: 0,
        })
        .returning();
      insertedTxs.push(dup);
    } else {
      const [tx] = await db
        .insert(finBankTransactions)
        .values({
          tenantId: user.tenantId,
          accountLabel: "import",
          txDate: row.txDate,
          amountCents: row.amountCents,
          currency: row.currency,
          reference: row.reference ?? null,
          counterparty: row.counterparty ?? null,
          direction: row.direction,
          importBatchId: batchId,
          matchStatus: "unmatched",
          matchScoreBp: 0,
        })
        .returning();
      insertedTxs.push(tx);
      existingSignatures.push(sig);
      imported++;
    }
  }

  // Run reconciliation on newly imported (non-duplicate) unmatched rows
  const unmatchedNew = insertedTxs.filter((t) => t.matchStatus === "unmatched");

  if (unmatchedNew.length > 0) {
    // Load payments and invoices for reconciliation
    const payments = await db.query.finPayments.findMany({
      where: eq(finPayments.tenantId, user.tenantId),
    });

    const reconcileResults = reconcile(
      unmatchedNew.map((t) => ({
        id: t.id,
        amountCents: t.amountCents,
        txDate: String(t.txDate),
        reference: t.reference ?? null,
        direction: t.direction as "in" | "out",
      })),
      payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        receivedDate: String(p.receivedDate),
        notes: p.notes ?? null,
      })),
      [] // invoices — would load from fin_invoices when merged
    );

    // Update match status for matched transactions
    const matched = reconcileResults.filter((r) => r.matchStatus === "matched");
    for (const result of matched) {
      await db
        .update(finBankTransactions)
        .set({
          matchStatus: "matched",
          matchScoreBp: result.matchScoreBp,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(finBankTransactions.id, result.txId),
            eq(finBankTransactions.tenantId, user.tenantId)
          )
        );
    }

    const matchedCount = matched.length;

    return c.json({
      imported,
      duplicates,
      matched: matchedCount,
      batchId,
      parseErrors: parseResult.errors,
    }, 200);
  }

  return c.json({ imported, duplicates, matched: 0, batchId, parseErrors: parseResult.errors }, 200);
});

// ─── GET /api/fin/cash/transactions ──────────────────────────────────────────

finCashRoutes.get("/transactions", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await db.query.finBankTransactions.findMany({
    where: eq(finBankTransactions.tenantId, user.tenantId),
    orderBy: [desc(finBankTransactions.txDate)],
    limit,
    offset,
  });

  return c.json({
    transactions: rows.map(serializeTx),
    total: rows.length,
    page,
  });
});

// ─── GET /api/fin/cash/unmatched ─────────────────────────────────────────────

finCashRoutes.get("/unmatched", async (c) => {
  const user = c.get("user");

  const rows = await db.query.finBankTransactions.findMany({
    where: and(
      eq(finBankTransactions.tenantId, user.tenantId),
      eq(finBankTransactions.matchStatus, "unmatched")
    ),
    orderBy: [desc(finBankTransactions.txDate)],
  });

  return c.json({ transactions: rows.map(serializeTx), total: rows.length });
});

// ─── POST /api/fin/cash/transactions/:id/match ───────────────────────────────

const manualMatchSchema = z.object({
  paymentId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
});

finCashRoutes.post(
  "/transactions/:id/match",
  zValidator("json", manualMatchSchema),
  async (c) => {
    const user = c.get("user");
    const txId = c.req.param("id");
    const { paymentId, invoiceId } = c.req.valid("json");

    if (!paymentId && !invoiceId) {
      return c.json({ error: "paymentId or invoiceId required" }, 400);
    }

    // Verify ownership
    const tx = await db.query.finBankTransactions.findFirst({
      where: and(
        eq(finBankTransactions.id, txId),
        eq(finBankTransactions.tenantId, user.tenantId)
      ),
    });

    if (!tx) return c.json({ error: "not_found" }, 404);

    // Update match status
    const [updated] = await db
      .update(finBankTransactions)
      .set({
        matchStatus: "matched",
        matchScoreBp: 10000,
        updatedAt: new Date(),
      })
      .where(eq(finBankTransactions.id, txId))
      .returning();

    return c.json({ transaction: serializeTx(updated) });
  }
);
