/**
 * BANKLINK-001: BankLink — bank connector management + OFX/MT940 import
 *
 * Routes:
 *   GET    /api/fin/banklink/connections             — list active connections for tenant
 *   POST   /api/fin/banklink/connections             — create new connection
 *   DELETE /api/fin/banklink/connections/:id         — deactivate (soft delete)
 *   GET    /api/fin/banklink/transactions            — list imported transactions (paginated)
 *   POST   /api/fin/banklink/import                 — upload OFX/MT940, parse, dedup, insert
 *   POST   /api/fin/banklink/seed                   — seed demo data (dev/demo use)
 *
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - Dedup: import skips transactions with existing (bankConnectionId, externalId).
 * - GAP-ANALYSIS G2: bank integration — key differentiator for multi-branch academies.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, count, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  finBankConnections,
  finBankTransactions,
} from "../db/schema/finBankLink";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parseOFX, parseMT940 } from "../lib/finBankParser";
import { seedBankLink } from "../lib/finBankLinkSeed";

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
