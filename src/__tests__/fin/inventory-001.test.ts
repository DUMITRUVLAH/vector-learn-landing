/**
 * INVENTORY-001: Teste gestiune stoc
 * T1 [blocant] — schema finInventoryItems definită corect
 * T2 [blocant] — calculateAvgCost formula CMP
 * T3 [blocant] — calculateExitCost insufficient_stock
 * T4 [blocant] — finInventoryRoutes exportat
 * T5 [blocant] — seedFinInventory importabil (idempotent guard)
 * T6 [normal]  — calculateAvgCost cu oldQty=0 returnează unitCostCents
 */

import { describe, it, expect } from "vitest";

// ─── T1: schema finInventoryItems definit corect ──────────────────────────────
describe("T1 [blocant] finInventoryItems schema", () => {
  it("exports finInventoryItems cu coloanele qty_on_hand și avg_cost_cents", async () => {
    const schema = await import("../../../server/db/schema/finInventory");
    expect(schema.finInventoryItems).toBeDefined();
    // Drizzle table objects carry their column definitions
    const cols = Object.keys(schema.finInventoryItems);
    expect(cols.length).toBeGreaterThan(0);

    // Verifică că tabelul are coloanele așteptate (prin inspecția obiectului drizzle)
    const table = schema.finInventoryItems as Record<string, unknown>;
    // Drizzle pgTable expune coloanele ca proprietăți ale obiectului
    expect(table).toHaveProperty("qtyOnHand");
    expect(table).toHaveProperty("avgCostCents");
    expect(table).toHaveProperty("tenantId");
    expect(table).toHaveProperty("name");
    expect(table).toHaveProperty("isActive");
  });

  it("exports finStockMovements cu coloanele item_id și movement_type", async () => {
    const schema = await import("../../../server/db/schema/finInventory");
    expect(schema.finStockMovements).toBeDefined();
    const table = schema.finStockMovements as Record<string, unknown>;
    expect(table).toHaveProperty("itemId");
    expect(table).toHaveProperty("movementType");
    expect(table).toHaveProperty("unitCostCents");
    expect(table).toHaveProperty("totalCostCents");
  });
});

// ─── T2 [blocant]: formula CMP ────────────────────────────────────────────────
describe("T2 [blocant] calculateAvgCost formula CMP", () => {
  it("calculează corect CMP când stocul existent + intrare nouă", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    // old_qty=100, old_avg=50, qty_in=20, unit_cost=60
    // new_avg = (100×50 + 20×60) / (100+20) = (5000 + 1200) / 120 = 6200/120 = 51.666...
    // Math.floor(51.666) = 51
    const result = calculateAvgCost({
      oldQty: 100,
      oldAvgCostCents: 50,
      qtyIn: 20,
      unitCostCents: 60,
    });

    expect(result.newAvgCostCents).toBe(51);
    expect(result.newQtyOnHand).toBe(120);
    expect(result.entryTotalCostCents).toBe(1200); // 20 × 60
  });

  it("returnează media corectă pentru cantități mai mari", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    // 1000 bucăți la 1200 MDL cents, + 500 bucăți la 1500 MDL cents
    // new_avg = (1000×1200 + 500×1500) / 1500 = (1200000 + 750000) / 1500 = 1300
    const result = calculateAvgCost({
      oldQty: 1000,
      oldAvgCostCents: 1200,
      qtyIn: 500,
      unitCostCents: 1500,
    });

    expect(result.newAvgCostCents).toBe(1300);
    expect(result.newQtyOnHand).toBe(1500);
  });
});

// ─── T3 [blocant]: insufficient_stock ─────────────────────────────────────────
describe("T3 [blocant] calculateExitCost insufficient_stock", () => {
  it("returnează eroarea insufficient_stock când qty_out > qty_on_hand", async () => {
    const { calculateExitCost } = await import("../../../server/lib/finInventoryEngine");

    const result = calculateExitCost(10, 1200, 15);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("insufficient_stock");
      expect(result.available).toBe(10);
      expect(result.requested).toBe(15);
    }
  });

  it("returnează ok=true când stocul este suficient", async () => {
    const { calculateExitCost } = await import("../../../server/lib/finInventoryEngine");

    const result = calculateExitCost(50, 1200, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalCostCents).toBe(24000); // 20 × 1200
      expect(result.remainingQty).toBe(30);
    }
  });
});

// ─── T4 [blocant]: finInventoryRoutes exportat ────────────────────────────────
describe("T4 [blocant] finInventoryRoutes export", () => {
  it("exportă finInventoryRoutes din routes/finInventory", async () => {
    const module = await import("../../../server/routes/finInventory");
    expect(module.finInventoryRoutes).toBeDefined();
    // Hono instance has a fetch method
    expect(typeof module.finInventoryRoutes.fetch).toBe("function");
  });
});

// ─── T5 [blocant]: seedFinInventory importabil ────────────────────────────────
describe("T5 [blocant] seedFinInventory import", () => {
  it("exportă seedFinInventory ca funcție", async () => {
    const module = await import("../../../server/lib/finInventorySeed");
    expect(module.seedFinInventory).toBeDefined();
    expect(typeof module.seedFinInventory).toBe("function");
  });
});

// ─── T6 [normal]: calculateAvgCost cu oldQty=0 ──────────────────────────────
describe("T6 [normal] calculateAvgCost primul lot (oldQty=0)", () => {
  it("returnează unitCostCents direct când stocul anterior e zero", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    const result = calculateAvgCost({
      oldQty: 0,
      oldAvgCostCents: 0,
      qtyIn: 50,
      unitCostCents: 3200,
    });

    expect(result.newAvgCostCents).toBe(3200); // direct — primul lot
    expect(result.newQtyOnHand).toBe(50);
    expect(result.entryTotalCostCents).toBe(160000); // 50 × 3200
  });

  it("returnează valorile neschimbate când qtyIn=0", async () => {
    const { calculateAvgCost } = await import("../../../server/lib/finInventoryEngine");

    const result = calculateAvgCost({
      oldQty: 100,
      oldAvgCostCents: 500,
      qtyIn: 0,
      unitCostCents: 1000,
    });

    expect(result.newAvgCostCents).toBe(500); // neschimbat
    expect(result.newQtyOnHand).toBe(100);
    expect(result.entryTotalCostCents).toBe(0);
  });
});
