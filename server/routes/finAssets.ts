/**
 * ASSET-002 (FIN): FinDesk — Rute API modul Active Fixe
 *
 * Endpoints:
 *   GET  /api/fin/assets                              — lista active per tenant
 *   POST /api/fin/assets                              — creare activ nou
 *   GET  /api/fin/assets/:id                          — detaliu activ
 *   POST /api/fin/assets/depreciate                   — calculează amortizarea lunii (batch)
 *   POST /api/fin/assets/:id/confirm-depreciation     — confirmă amortizarea + postare fin_expenses
 *   GET  /api/fin/assets/:id/depreciation-entries     — istoricul amortizărilor per activ
 *
 * Calculul amortizării este DETERMINIST (nu AI) — FIN-CORE regula #4.
 * La confirmare, se postează cheltuiala în fin_expenses — FIN-CORE regula #3.
 * Dacă fin_expenses nu există, se loghează și se continuă (nu 500).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  finAssets,
  finDepreciationEntries,
  type FinAssetStatus,
} from "../db/schema/finAssets";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  calculateAssetDepreciation,
} from "../lib/fin/depreciationCalculator";

export const finAssetsRoutes = new Hono<{ Variables: AuthVariables }>();

finAssetsRoutes.use("*", requireAuth);

// ─── Validare schemă ──────────────────────────────────────────────────────────

const createAssetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  acquisitionCostCents: z.number().int().min(0),
  residualValueCents: z.number().int().min(0).default(0),
  usefulLifeMonths: z.number().int().min(1).max(600),
  depreciationMethod: z.enum(["linear", "declining_balance"]).default("linear"),
  notes: z.string().max(2000).optional().nullable(),
});

const depreciateSchema = z.object({
  /** Luna pentru care se calculează amortizarea (YYYY-MM). */
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Format YYYY-MM"),
  /** Lista specifică de active (UUID). Dacă lipsă, se calculează pentru toate cele active. */
  assetIds: z.array(z.string().uuid()).optional(),
});

const confirmDepreciationSchema = z.object({
  /** Luna amortizării de confirmat. */
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Format YYYY-MM"),
});

// ─── GET /api/fin/assets — lista active ──────────────────────────────────────

finAssetsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const statusFilter = c.req.query("status") as FinAssetStatus | undefined;

  const assets = await db.query.finAssets.findMany({
    where: statusFilter
      ? and(eq(finAssets.tenantId, tenantId), eq(finAssets.status, statusFilter))
      : eq(finAssets.tenantId, tenantId),
    orderBy: [finAssets.name],
    with: {
      depreciationEntries: {
        columns: { periodMonth: true, bookValueCents: true, depreciationCents: true },
        orderBy: [desc(finDepreciationEntries.periodMonth)],
        limit: 1,
      },
    },
  });

  // Calculăm bookValueCurrent (ultima intrare sau acquisitionCostCents dacă fără înregistrări)
  const assetsWithBookValue = assets.map((asset) => {
    const lastEntry = asset.depreciationEntries[0];
    return {
      ...asset,
      currentBookValueCents: lastEntry?.bookValueCents ?? asset.acquisitionCostCents,
      lastDepreciationPeriod: lastEntry?.periodMonth ?? null,
      depreciationEntries: undefined,
    };
  });

  return c.json({ assets: assetsWithBookValue });
});

// ─── POST /api/fin/assets — creare activ nou ──────────────────────────────────

finAssetsRoutes.post(
  "/",
  zValidator("json", createAssetSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    const [asset] = await db
      .insert(finAssets)
      .values({
        tenantId,
        name: data.name,
        description: data.description ?? null,
        category: data.category ?? null,
        acquisitionDate: data.acquisitionDate,
        acquisitionCostCents: data.acquisitionCostCents,
        residualValueCents: data.residualValueCents,
        usefulLifeMonths: data.usefulLifeMonths,
        depreciationMethod: data.depreciationMethod,
        notes: data.notes ?? null,
      })
      .returning();

    return c.json({ asset }, 201);
  }
);

// ─── GET /api/fin/assets/:id — detaliu activ ─────────────────────────────────

finAssetsRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const assetId = c.req.param("id");

  const asset = await db.query.finAssets.findFirst({
    where: and(eq(finAssets.id, assetId), eq(finAssets.tenantId, tenantId)),
    with: {
      depreciationEntries: {
        orderBy: [desc(finDepreciationEntries.periodMonth)],
        limit: 12,
      },
    },
  });

  if (!asset) {
    return c.json({ error: "Activ negăsit." }, 404);
  }

  return c.json({ asset });
});

// ─── GET /api/fin/assets/:id/depreciation-entries — istoricul amortizărilor ──

finAssetsRoutes.get("/:id/depreciation-entries", async (c) => {
  const tenantId = c.get("user").tenantId;
  const assetId = c.req.param("id");

  // Verify ownership
  const asset = await db.query.finAssets.findFirst({
    where: and(eq(finAssets.id, assetId), eq(finAssets.tenantId, tenantId)),
    columns: { id: true, name: true },
  });

  if (!asset) {
    return c.json({ error: "Activ negăsit." }, 404);
  }

  const entries = await db.query.finDepreciationEntries.findMany({
    where: and(
      eq(finDepreciationEntries.assetId, assetId),
      eq(finDepreciationEntries.tenantId, tenantId)
    ),
    orderBy: [desc(finDepreciationEntries.periodMonth)],
  });

  return c.json({ asset, entries });
});

// ─── POST /api/fin/assets/depreciate — calcul batch amortizare ───────────────

finAssetsRoutes.post(
  "/depreciate",
  zValidator("json", depreciateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");
    const { periodMonth, assetIds } = data;

    // Obține activele de amortizat
    let assetsToDepreciate;
    if (assetIds && assetIds.length > 0) {
      assetsToDepreciate = await db.query.finAssets.findMany({
        where: and(
          eq(finAssets.tenantId, tenantId),
          eq(finAssets.status, "active")
        ),
      });
      assetsToDepreciate = assetsToDepreciate.filter((a) =>
        assetIds.includes(a.id)
      );
    } else {
      assetsToDepreciate = await db.query.finAssets.findMany({
        where: and(
          eq(finAssets.tenantId, tenantId),
          eq(finAssets.status, "active")
        ),
      });
    }

    if (assetsToDepreciate.length === 0) {
      return c.json({
        message: "Niciun activ activ de amortizat.",
        entries: [],
      });
    }

    const results: Array<{
      assetId: string;
      assetName: string;
      depreciationCents: number;
      bookValueCents: number;
      isFullyDepreciated: boolean;
      entryId: string;
    }> = [];

    for (const asset of assetsToDepreciate) {
      // Obține ultima înregistrare de amortizare pentru a calcula book value curent
      const lastEntry = await db.query.finDepreciationEntries.findFirst({
        where: and(
          eq(finDepreciationEntries.assetId, asset.id),
          eq(finDepreciationEntries.tenantId, tenantId)
        ),
        orderBy: [desc(finDepreciationEntries.periodMonth)],
      });

      // Nu re-amortizăm o lună deja amortizată (idempotent)
      const existingEntry = await db.query.finDepreciationEntries.findFirst({
        where: and(
          eq(finDepreciationEntries.assetId, asset.id),
          eq(finDepreciationEntries.tenantId, tenantId),
          eq(finDepreciationEntries.periodMonth, periodMonth)
        ),
      });

      const lastBookValue = lastEntry
        ? lastEntry.bookValueCents
        : null;

      const depResult = calculateAssetDepreciation({
        asset: {
          id: asset.id,
          acquisitionCostCents: asset.acquisitionCostCents,
          residualValueCents: asset.residualValueCents,
          usefulLifeMonths: asset.usefulLifeMonths,
          depreciationMethod: asset.depreciationMethod,
          status: asset.status,
          acquisitionDate: asset.acquisitionDate,
        },
        periodMonth,
        lastBookValueCents: lastBookValue,
      });

      let entry;
      if (existingEntry) {
        // Actualizăm (idempotent)
        const [updated] = await db
          .update(finDepreciationEntries)
          .set({
            depreciationCents: depResult.depreciationCents,
            bookValueCents: depResult.bookValueCents,
          })
          .where(
            and(
              eq(finDepreciationEntries.id, existingEntry.id),
              eq(finDepreciationEntries.tenantId, tenantId)
            )
          )
          .returning();
        entry = updated;
      } else {
        // Inserăm nou
        const [inserted] = await db
          .insert(finDepreciationEntries)
          .values({
            tenantId,
            assetId: asset.id,
            periodMonth,
            depreciationCents: depResult.depreciationCents,
            bookValueCents: depResult.bookValueCents,
          })
          .returning();
        entry = inserted;
      }

      // Dacă activul e amortizat complet → actualizăm statusul
      if (depResult.isFullyDepreciated) {
        await db
          .update(finAssets)
          .set({ status: "fully_depreciated" as FinAssetStatus, updatedAt: new Date() })
          .where(
            and(
              eq(finAssets.id, asset.id),
              eq(finAssets.tenantId, tenantId)
            )
          );
      }

      results.push({
        assetId: asset.id,
        assetName: asset.name,
        depreciationCents: depResult.depreciationCents,
        bookValueCents: depResult.bookValueCents,
        isFullyDepreciated: depResult.isFullyDepreciated,
        entryId: entry.id,
      });
    }

    return c.json({ periodMonth, entries: results });
  }
);

// ─── POST /api/fin/assets/:id/confirm-depreciation — confirmare amortizare ───

finAssetsRoutes.post(
  "/:id/confirm-depreciation",
  zValidator("json", confirmDepreciationSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const assetId = c.req.param("id");
    const { periodMonth } = c.req.valid("json");

    // Verifică activul
    const asset = await db.query.finAssets.findFirst({
      where: and(eq(finAssets.id, assetId), eq(finAssets.tenantId, tenantId)),
    });

    if (!asset) {
      return c.json({ error: "Activ negăsit." }, 404);
    }

    // Verifică că există înregistrarea de amortizare pentru luna specificată
    const entry = await db.query.finDepreciationEntries.findFirst({
      where: and(
        eq(finDepreciationEntries.assetId, assetId),
        eq(finDepreciationEntries.tenantId, tenantId),
        eq(finDepreciationEntries.periodMonth, periodMonth)
      ),
    });

    if (!entry) {
      return c.json(
        {
          error: `Amortizarea pentru ${periodMonth} nu a fost calculată. Rulați /depreciate mai întâi.`,
        },
        422
      );
    }

    // FIN-CORE regula #3: postare cheltuiala în fin_expenses
    // Dacă fin_expenses nu există → loghează și continuă (nu 500)
    let expenseId: string | null = null;
    const expensesWarning: string[] = [];

    try {
      const expenseResult = await db.execute(
        sql`INSERT INTO "fin_expenses" (
              "id", "tenant_id", "amount_cents", "category",
              "deductible", "description", "expense_date", "created_at"
            ) VALUES (
              gen_random_uuid(), ${tenantId}, ${entry.depreciationCents},
              'depreciation', true,
              ${"Amortizare " + asset.name + " " + periodMonth},
              ${periodMonth + "-01"},
              now()
            ) RETURNING "id"`
      );
      const rows = Array.isArray(expenseResult)
        ? expenseResult
        : (expenseResult as { rows?: Array<{ id: string }> }).rows ?? [];
      if (rows.length > 0) {
        expenseId = (rows[0] as { id: string }).id;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("undefined_table") ||
        msg.includes("does not exist") ||
        msg.includes("42P01")
      ) {
        expensesWarning.push("fin_expenses not yet available (SPEND module pending) — depreciation recorded without expense link.");
      } else {
        expensesWarning.push(`fin_expenses insert failed: ${msg}`);
      }
    }

    // Actualizăm înregistrarea cu expenseId (dacă a reușit)
    const [updatedEntry] = await db
      .update(finDepreciationEntries)
      .set({
        expenseId: expenseId,
        notes: entry.notes
          ? entry.notes + (expenseId ? ` | expense: ${expenseId}` : "")
          : expenseId
          ? `expense: ${expenseId}`
          : null,
      })
      .where(
        and(
          eq(finDepreciationEntries.id, entry.id),
          eq(finDepreciationEntries.tenantId, tenantId)
        )
      )
      .returning();

    return c.json({
      entry: updatedEntry,
      expenseId,
      expensesWarning: expensesWarning.length > 0 ? expensesWarning : undefined,
    });
  }
);
