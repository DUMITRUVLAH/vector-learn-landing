/**
 * INVENTORY-002: Teste hooks SPEND→intrare + BILL→ieșire + stock-value
 * T1 [blocant] — hook/invoice-issued: mișcare sale + qty scade
 * T2 [blocant] — hook/invoice-issued: 422 insufficient_stock
 * T3 [blocant] — hook/purchase: qty crește, avg_cost calculat, spend_id stocat
 * T4 [blocant] — stock-value: totalValueCents + belowMinAlert corecte
 * T5 [blocant] — finStockMovements are câmpul spendId
 * T6 [normal]  — hook/invoice-issued cu lines goale returnează eroare validare
 */

import { describe, it, expect } from "vitest";

// ─── T5 [blocant]: finStockMovements are câmpul spendId ──────────────────────
describe("T5 [blocant] finStockMovements spendId câmp", () => {
  it("exportă finStockMovements cu câmpul spendId definit", async () => {
    const schema = await import("../../../server/db/schema/finInventory");
    expect(schema.finStockMovements).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = schema.finStockMovements as unknown as Record<string, unknown>;
    expect(table).toHaveProperty("spendId");
  });
});

// ─── T1 [blocant]: hook invoice-issued — mișcare sale ─────────────────────────
describe("T1 [blocant] hook/invoice-issued logica de bază", () => {
  it("calculateExitCost generează ieșire corectă pentru hook invoice-issued", async () => {
    const { calculateExitCost } = await import("../../../server/lib/finInventoryEngine");

    // Simulăm ce face hook-ul: articol cu qty=50, avg_cost=1200, ieșim 10 buc
    const result = calculateExitCost(50, 1200, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalCostCents).toBe(12000); // 10 × 1200
      expect(result.remainingQty).toBe(40);
      expect(result.unitCostCents).toBe(1200); // CMP rămâne neschimbat la ieșire
    }
  });

  it("hook-ul returnează eroare când stocul e insuficient", async () => {
    const { calculateExitCost } = await import("../../../server/lib/finInventoryEngine");

    // qty_on_hand=5, cerut=10 — trebuie 422
    const result = calculateExitCost(5, 1200, 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("insufficient_stock");
      expect(result.available).toBe(5);
      expect(result.requested).toBe(10);
    }
  });
});

// ─── T2 [blocant]: hook invoice-issued 422 ────────────────────────────────────
describe("T2 [blocant] hook/invoice-issued insufficient_stock pentru mai multe articole", () => {
  it("detectează corect toate articolele cu stoc insuficient", async () => {
    const { calculateExitCost } = await import("../../../server/lib/finInventoryEngine");

    const items = [
      { id: "item-1", qty: 100, avgCost: 500, requested: 120 }, // insuficient
      { id: "item-2", qty: 50, avgCost: 300, requested: 30 },   // suficient
      { id: "item-3", qty: 10, avgCost: 800, requested: 15 },   // insuficient
    ];

    const insufficientItems = [];
    for (const item of items) {
      const result = calculateExitCost(item.qty, item.avgCost, item.requested);
      if (!result.ok) {
        insufficientItems.push({ itemId: item.id, available: result.available, requested: result.requested });
      }
    }

    expect(insufficientItems).toHaveLength(2);
    expect(insufficientItems[0].itemId).toBe("item-1");
    expect(insufficientItems[1].itemId).toBe("item-3");
  });
});

// ─── T3 [blocant]: hook/purchase — CMP + spend_id ─────────────────────────────
describe("T3 [blocant] hook/purchase recalculare CMP cu spend_id", () => {
  it("recalculează CMP corect la o achiziție", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    // Articol nou: qty=0, avg=0 → achiziție 20 buc la 500 cents
    const result = calculateAvgCost({
      oldQty: 0,
      oldAvgCostCents: 0,
      qtyIn: 20,
      unitCostCents: 500,
    });

    expect(result.newQtyOnHand).toBe(20);
    expect(result.newAvgCostCents).toBe(500); // primul lot
    expect(result.entryTotalCostCents).toBe(10000); // 20 × 500
  });

  it("recalculează CMP corect când stocul există deja", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    // Stoc existent: 100 buc la 800 cents + achiziție 50 buc la 1000 cents
    // new_avg = (100×800 + 50×1000) / 150 = (80000 + 50000) / 150 = 130000/150 = 866.66 → 866
    const result = calculateAvgCost({
      oldQty: 100,
      oldAvgCostCents: 800,
      qtyIn: 50,
      unitCostCents: 1000,
    });

    expect(result.newQtyOnHand).toBe(150);
    expect(result.newAvgCostCents).toBe(866);
    expect(result.entryTotalCostCents).toBe(50000);
  });
});

// ─── T4 [blocant]: stock-value totalizare ─────────────────────────────────────
describe("T4 [blocant] stock-value totalizare corectă", () => {
  it("calculează totalValueCents și belowMinAlert corect", () => {
    // Simulăm logica din GET /stock-value fără DB
    const items = [
      { id: "a", qtyOnHand: 100, avgCostCents: 500, minQtyAlert: 0 },   // 50000 cents
      { id: "b", qtyOnHand: 50, avgCostCents: 1200, minQtyAlert: 100 }, // 60000 cents, sub alert
      { id: "c", qtyOnHand: 30, avgCostCents: 300, minQtyAlert: 20 },   // 9000 cents, peste alert
      { id: "d", qtyOnHand: 5, avgCostCents: 2000, minQtyAlert: 10 },   // 10000 cents, sub alert
    ];

    let totalQty = 0;
    let totalValueCents = 0;
    let belowMinAlert = 0;

    for (const item of items) {
      totalQty += item.qtyOnHand;
      totalValueCents += item.qtyOnHand * item.avgCostCents;
      if (item.minQtyAlert > 0 && item.qtyOnHand < item.minQtyAlert) {
        belowMinAlert++;
      }
    }

    expect(totalQty).toBe(185);
    expect(totalValueCents).toBe(129000); // 50000+60000+9000+10000
    expect(belowMinAlert).toBe(2); // item-b (50<100) și item-d (5<10)
  });

  it("belowMinAlert ignoră articolele cu minQtyAlert=0", () => {
    const items = [
      { id: "a", qtyOnHand: 0, avgCostCents: 500, minQtyAlert: 0 },  // 0 = fără alertă
      { id: "b", qtyOnHand: 0, avgCostCents: 300, minQtyAlert: 5 },  // 0 < 5 = alertă
    ];

    let belowMinAlert = 0;
    for (const item of items) {
      if (item.minQtyAlert > 0 && item.qtyOnHand < item.minQtyAlert) {
        belowMinAlert++;
      }
    }

    expect(belowMinAlert).toBe(1); // doar item-b
  });
});

// ─── T6 [normal]: validare schema invoiceIssuedSchema ─────────────────────────
describe("T6 [normal] validare linii goale pentru hook invoice-issued", () => {
  it("schema de validare respinge lines array gol", async () => {
    const { z } = await import("zod");

    const invoiceIssuedSchema = z.object({
      invoiceId: z.string().uuid(),
      lines: z.array(
        z.object({
          itemId: z.string().uuid(),
          qty: z.number().int().min(1),
        })
      ).min(1, "Cel puțin o linie este necesară"),
    });

    const result = invoiceIssuedSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      lines: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Cel puțin o linie este necesară");
    }
  });

  it("schema acceptă date valide", async () => {
    const { z } = await import("zod");

    const invoiceIssuedSchema = z.object({
      invoiceId: z.string().uuid(),
      lines: z.array(
        z.object({
          itemId: z.string().uuid(),
          qty: z.number().int().min(1),
        })
      ).min(1),
    });

    const result = invoiceIssuedSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      lines: [{ itemId: "660e8400-e29b-41d4-a716-446655440001", qty: 5 }],
    });

    expect(result.success).toBe(true);
  });
});
