import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  paymentAccounts,
  paymentAccountItems,
  sellerProfiles,
  companyClients,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { computeDocumentTotals } from "../lib/paymentAccountTotals";

/**
 * CONT-PLATA: standardized payment accounts ("cont de plată") CRUD + issue.
 *   GET    /api/payment-accounts            → list (header rows)
 *   POST   /api/payment-accounts            → create draft (with line items)
 *   GET    /api/payment-accounts/:id         → header + items
 *   PATCH  /api/payment-accounts/:id         → update draft (replaces items)
 *   POST   /api/payment-accounts/:id/issue   → assign sequential number, status=issued
 *   POST   /api/payment-accounts/:id/status  → set paid/cancelled
 *   DELETE /api/payment-accounts/:id         → delete (draft only)
 */
export const paymentAccountRoutes = new Hono<{ Variables: AuthVariables }>();

paymentAccountRoutes.use("*", requireAuth);

const itemSchema = z.object({
  description: z.string().min(1).max(500),
  unit: z.string().max(32).default("buc"),
  quantity: z.number().positive().max(1_000_000),
  unitPriceCents: z.number().int().min(0),
  vatRate: z.number().int().min(0).max(100).default(20),
});

const upsertSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  series: z.string().min(1).max(20).optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // Buyer snapshot (filled from the registry autofill or manually)
  buyerName: z.string().min(1).max(500),
  buyerIdno: z.string().max(32).optional().nullable(),
  buyerAddress: z.string().max(500).optional().nullable(),
  buyerCity: z.string().max(255).optional().nullable(),
  items: z.array(itemSchema).min(1).max(200),
});

async function loadSellerSnapshot(tenantId: string) {
  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.tenantId, tenantId))
    .limit(1);
  return {
    sellerName: profile?.name ?? "",
    sellerIdno: profile?.idno ?? null,
    sellerVatCode: profile?.vatCode ?? null,
    sellerAddress: profile?.address ?? null,
    sellerIban: profile?.iban ?? null,
    sellerBankName: profile?.bankName ?? null,
    sellerBankCode: profile?.bankCode ?? null,
    defaultSeries: profile?.defaultSeries ?? "CP",
  };
}

paymentAccountRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const status = c.req.query("status");
  const conditions = [eq(paymentAccounts.tenantId, tenantId)];
  if (status && ["draft", "issued", "paid", "cancelled"].includes(status)) {
    conditions.push(eq(paymentAccounts.status, status as "draft" | "issued" | "paid" | "cancelled"));
  }
  const rows = await db
    .select()
    .from(paymentAccounts)
    .where(and(...conditions))
    .orderBy(desc(paymentAccounts.createdAt))
    .limit(500);
  return c.json({ data: rows });
});

paymentAccountRoutes.post("/", zValidator("json", upsertSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const seller = await loadSellerSnapshot(tenantId);
  const { totals, lines } = computeDocumentTotals(body.items);

  const [account] = await db
    .insert(paymentAccounts)
    .values({
      tenantId,
      clientId: body.clientId ?? null,
      series: body.series ?? seller.defaultSeries,
      currency: body.currency ?? "MDL",
      status: "draft",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null,
      sellerName: seller.sellerName,
      sellerIdno: seller.sellerIdno,
      sellerVatCode: seller.sellerVatCode,
      sellerAddress: seller.sellerAddress,
      sellerIban: seller.sellerIban,
      sellerBankName: seller.sellerBankName,
      sellerBankCode: seller.sellerBankCode,
      buyerName: body.buyerName,
      buyerIdno: body.buyerIdno ?? null,
      buyerAddress: body.buyerAddress ?? null,
      buyerCity: body.buyerCity ?? null,
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
    })
    .returning();

  await db.insert(paymentAccountItems).values(
    body.items.map((it, i) => ({
      accountId: account.id,
      position: i,
      description: it.description,
      unit: it.unit,
      quantity: String(it.quantity),
      unitPriceCents: it.unitPriceCents,
      vatRate: it.vatRate,
      lineSubtotalCents: lines[i].lineSubtotalCents,
      lineVatCents: lines[i].lineVatCents,
      lineTotalCents: lines[i].lineTotalCents,
    }))
  );

  return c.json({ data: account }, 201);
});

paymentAccountRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, c.req.param("id")), eq(paymentAccounts.tenantId, tenantId)))
    .limit(1);
  if (!account) return c.json({ error: "not_found" }, 404);
  const items = await db
    .select()
    .from(paymentAccountItems)
    .where(eq(paymentAccountItems.accountId, account.id))
    .orderBy(paymentAccountItems.position);
  return c.json({ data: { ...account, items } });
});

paymentAccountRoutes.patch("/:id", zValidator("json", upsertSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.status !== "draft") {
    return c.json({ error: "only_draft_editable" }, 409);
  }

  const { totals, lines } = computeDocumentTotals(body.items);

  const [updated] = await db
    .update(paymentAccounts)
    .set({
      clientId: body.clientId ?? null,
      series: body.series ?? existing.series,
      currency: body.currency ?? existing.currency,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null,
      buyerName: body.buyerName,
      buyerIdno: body.buyerIdno ?? null,
      buyerAddress: body.buyerAddress ?? null,
      buyerCity: body.buyerCity ?? null,
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
      updatedAt: new Date(),
    })
    .where(eq(paymentAccounts.id, id))
    .returning();

  await db.delete(paymentAccountItems).where(eq(paymentAccountItems.accountId, id));
  await db.insert(paymentAccountItems).values(
    body.items.map((it, i) => ({
      accountId: id,
      position: i,
      description: it.description,
      unit: it.unit,
      quantity: String(it.quantity),
      unitPriceCents: it.unitPriceCents,
      vatRate: it.vatRate,
      lineSubtotalCents: lines[i].lineSubtotalCents,
      lineVatCents: lines[i].lineVatCents,
      lineTotalCents: lines[i].lineTotalCents,
    }))
  );

  return c.json({ data: updated });
});

paymentAccountRoutes.post("/:id/issue", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
    .limit(1);
  if (!account) return c.json({ error: "not_found" }, 404);
  if (account.status !== "draft") return c.json({ error: "already_issued" }, 409);

  // Next sequential number within tenant + series.
  const [{ maxNumber }] = await db
    .select({ maxNumber: sql<number>`coalesce(max(${paymentAccounts.number}), 0)` })
    .from(paymentAccounts)
    .where(
      and(eq(paymentAccounts.tenantId, tenantId), eq(paymentAccounts.series, account.series))
    );
  const nextNumber = Number(maxNumber) + 1;
  const year = new Date(account.issueDate ?? new Date()).getFullYear();
  const documentNumber = `${account.series}-${year}-${String(nextNumber).padStart(4, "0")}`;

  const [updated] = await db
    .update(paymentAccounts)
    .set({
      number: nextNumber,
      documentNumber,
      status: "issued",
      issueDate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paymentAccounts.id, id))
    .returning();

  return c.json({ data: updated });
});

const statusSchema = z.object({ status: z.enum(["paid", "cancelled", "issued"]) });

paymentAccountRoutes.post("/:id/status", zValidator("json", statusSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { status } = c.req.valid("json");
  const [updated] = await db
    .update(paymentAccounts)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(paymentAccounts.id, c.req.param("id")), eq(paymentAccounts.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ data: updated });
});

paymentAccountRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [existing] = await db
    .select({ status: paymentAccounts.status })
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.status !== "draft") return c.json({ error: "only_draft_deletable" }, 409);
  await db.delete(paymentAccounts).where(eq(paymentAccounts.id, id));
  return c.json({ ok: true });
});
