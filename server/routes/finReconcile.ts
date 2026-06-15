/**
 * Team Docs reconciliation + VAT-on-imports.
 * Mounted in server/app.ts: app.route("/api/fin/reconcile", finReconcileRoutes)
 *
 * Routes:
 *   POST /api/fin/reconcile/sync             — match outgoing bank tx ↔ uploaded docs;
 *                                              compute import VAT for watchlisted companies.
 *   GET  /api/fin/reconcile/vat-companies    — list VAT-on-imports watchlist
 *   POST /api/fin/reconcile/vat-companies    — add a company
 *   PUT  /api/fin/reconcile/vat-companies/:id — edit
 *   DELETE /api/fin/reconcile/vat-companies/:id — remove
 *
 * Tenant safety: every query filters by user.tenantId.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { finBankTransactions } from "../db/schema/finCash";
import { finCaptures } from "../db/schema/finCaptures";
import { finVatImportCompanies } from "../db/schema/finVatImports";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  reconcileExpenses,
  type TxToReconcile,
  type DocCandidate,
} from "../lib/fin/expenseReconcileEngine";

export const finReconcileRoutes = new Hono<{ Variables: AuthVariables }>();
finReconcileRoutes.use("/*", requireAuth);

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── POST /sync — reconcile outgoing transactions with uploaded documents ──────
finReconcileRoutes.post("/sync", async (c) => {
  const user = c.get("user");

  // Outgoing transactions (money spent) — these are the ones that need a document.
  const txns = await db.query.finBankTransactions.findMany({
    where: and(
      eq(finBankTransactions.tenantId, user.tenantId),
      eq(finBankTransactions.direction, "out"),
    ),
    orderBy: [desc(finBankTransactions.txDate)],
  });

  // Uploaded documents (already AI-extracted — extraction is cached on the row,
  // so sync does NOT re-call the AI; it reuses extractedFields).
  const captures = await db.query.finCaptures.findMany({
    where: eq(finCaptures.tenantId, user.tenantId),
  });

  const txForEngine: TxToReconcile[] = txns.map((t) => ({
    id: t.id,
    amountCents: Math.abs(t.amountCents),
    txDate: t.txDate,
    reference: t.reference,
    counterparty: t.counterparty,
  }));

  const docForEngine: DocCandidate[] = captures.map((d) => ({
    id: d.id,
    amountCents: (d.extractedFields?.amount_cents?.value as number | null) ?? null,
    expenseDate: (d.extractedFields?.expense_date?.value as string | null) ?? null,
    vendorName: (d.extractedFields?.vendor_name?.value as string | null) ?? null,
    reference: (d.extractedFields?.reference?.value as string | null) ?? null,
  }));

  const matches = reconcileExpenses(txForEngine, docForEngine);
  const matchByTx = new Map(matches.map((m) => [m.txId, m]));

  // Persist match status/score back onto the transactions.
  for (const m of matches) {
    await db
      .update(finBankTransactions)
      .set({
        matchStatus: m.status === "matched" ? "matched" : "unmatched",
        matchScoreBp: m.matchScoreBp,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(finBankTransactions.id, m.txId),
          eq(finBankTransactions.tenantId, user.tenantId),
        ),
      );
  }

  // VAT-on-imports: compute VAT owed for transactions tied to a watchlisted company.
  const vatCompanies = await db.query.finVatImportCompanies.findMany({
    where: and(
      eq(finVatImportCompanies.tenantId, user.tenantId),
      eq(finVatImportCompanies.isActive, true),
    ),
  });

  const vatImports: Array<{
    txId: string;
    company: string;
    baseCents: number;
    vatRateBp: number;
    vatCents: number;
  }> = [];

  for (const t of txns) {
    const hay = `${norm(t.counterparty)} ${norm(t.reference)}`;
    const hit = vatCompanies.find(
      (vc) => (norm(vc.name) && hay.includes(norm(vc.name))) || (vc.idno && hay.includes(norm(vc.idno))),
    );
    if (hit) {
      const base = Math.abs(t.amountCents);
      vatImports.push({
        txId: t.id,
        company: hit.name,
        baseCents: base,
        vatRateBp: hit.vatRateBp,
        vatCents: Math.round((base * hit.vatRateBp) / 10000),
      });
    }
  }

  const matched = matches.filter((m) => m.status === "matched");
  const missing = txns
    .filter((t) => matchByTx.get(t.id)?.status === "missing_invoice")
    .map((t) => ({
      id: t.id,
      txDate: t.txDate,
      amountCents: Math.abs(t.amountCents),
      counterparty: t.counterparty,
      reference: t.reference,
      accountLabel: t.accountLabel,
    }));

  return c.json({
    totalTransactions: txns.length,
    matchedCount: matched.length,
    missingInvoiceCount: missing.length,
    missingInvoices: missing,
    vatImports,
    vatImportTotalCents: vatImports.reduce((s, v) => s + v.vatCents, 0),
  });
});

// ─── VAT-on-imports company watchlist (CRUD) ───────────────────────────────────

const companySchema = z.object({
  name: z.string().min(1).max(255),
  idno: z.string().max(20).nullable().optional(),
  vatRateBp: z.number().int().min(0).max(10000).default(2000),
  isActive: z.boolean().default(true),
});

finReconcileRoutes.get("/vat-companies", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(finVatImportCompanies)
    .where(eq(finVatImportCompanies.tenantId, user.tenantId))
    .orderBy(finVatImportCompanies.name);
  return c.json({ companies: rows });
});

finReconcileRoutes.post("/vat-companies", zValidator("json", companySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const [created] = await db
    .insert(finVatImportCompanies)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      idno: body.idno ?? null,
      vatRateBp: body.vatRateBp,
      isActive: body.isActive,
    })
    .returning();
  return c.json({ company: created }, 201);
});

finReconcileRoutes.put("/vat-companies/:id", zValidator("json", companySchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [updated] = await db
    .update(finVatImportCompanies)
    .set({
      name: body.name,
      idno: body.idno ?? null,
      vatRateBp: body.vatRateBp,
      isActive: body.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(finVatImportCompanies.id, id),
        eq(finVatImportCompanies.tenantId, user.tenantId),
      ),
    )
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ company: updated });
});

finReconcileRoutes.delete("/vat-companies/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await db
    .delete(finVatImportCompanies)
    .where(
      and(
        eq(finVatImportCompanies.id, id),
        eq(finVatImportCompanies.tenantId, user.tenantId),
      ),
    );
  return c.json({ ok: true });
});
