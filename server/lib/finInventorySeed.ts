/**
 * INVENTORY-001: Seed date demo pentru inventar materiale didactice
 * 5 articole + 8 mișcări (3 intrări + 3 ieșiri + 2 ajustări)
 * Idempotent: verifică dacă există deja articolele înainte de inserare.
 */

import { db } from "../db/client";
import { finInventoryItems, finStockMovements } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { calculateAvgCost, calculateExitCost } from "./finInventoryEngine";

const DEMO_ITEMS = [
  {
    name: "Caiete A4 80 file",
    sku: "CAI-A4-80",
    unit: "buc" as const,
    category: "papetarie",
    description: "Caiete cu copertă albastră, 80 file, format A4",
  },
  {
    name: "Markere permanente asortate",
    sku: "MAR-PERM-12",
    unit: "set" as const,
    category: "consumabile",
    description: "Set 12 markere permanente, vârfuri fine și late",
  },
  {
    name: "Hârtie imprimare A4 80g",
    sku: "HAR-A4-80G",
    unit: "pachet" as const,
    category: "consumabile",
    description: "Pachet 500 coli hârtie albă A4 80g/m²",
  },
  {
    name: "Folii protecție A4 (100 buc)",
    sku: "FOL-A4-100",
    unit: "pachet" as const,
    category: "papetarie",
    description: "Folii transparente pentru biblioraft A4",
  },
  {
    name: "Pixuri albastre BIC",
    sku: "PIX-BIC-AL",
    unit: "buc" as const,
    category: "papetarie",
    description: "Pix BIC Classic, scriere albastră, vârf 1mm",
  },
];

export async function seedFinInventory(tenantId: string, userId: string): Promise<void> {
  // Idempotent: verifică dacă există deja cel puțin un articol pentru tenant
  const existing = await db
    .select({ id: finInventoryItems.id })
    .from(finInventoryItems)
    .where(eq(finInventoryItems.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) {
    // Seed deja aplicat pentru acest tenant
    return;
  }

  // Inserează cele 5 articole
  const insertedItems = await db
    .insert(finInventoryItems)
    .values(
      DEMO_ITEMS.map((item) => ({
        tenantId,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        category: item.category,
        description: item.description,
        qtyOnHand: 0,
        avgCostCents: 0,
        minQtyAlert: 5,
        isActive: true,
      }))
    )
    .returning();

  const [caiete, markere, hartie, folii, pixuri] = insertedItems;

  // ─── 3 Intrări (achiziții) ────────────────────────────────────────────────
  // Intrare 1: 200 caiete la 12 MDL/buc = 24.00 MDL total; avg_cost = 1200 cents
  const avgCaiete1 = calculateAvgCost({ oldQty: 0, oldAvgCostCents: 0, qtyIn: 200, unitCostCents: 1200 });
  await db.insert(finStockMovements).values({
    tenantId, itemId: caiete.id, movementType: "purchase",
    qty: 200, unitCostCents: 1200, totalCostCents: avgCaiete1.entryTotalCostCents,
    reference: "NIR-2026-001", notes: "Achiziție inițială caiete A4", movedBy: userId, movedAt: new Date(),
  });
  await db.update(finInventoryItems).set({
    qtyOnHand: avgCaiete1.newQtyOnHand, avgCostCents: avgCaiete1.newAvgCostCents, updatedAt: new Date(),
  }).where(eq(finInventoryItems.id, caiete.id));

  // Intrare 2: 20 seturi markere la 8500 cents/set
  const avgMarkere1 = calculateAvgCost({ oldQty: 0, oldAvgCostCents: 0, qtyIn: 20, unitCostCents: 8500 });
  await db.insert(finStockMovements).values({
    tenantId, itemId: markere.id, movementType: "purchase",
    qty: 20, unitCostCents: 8500, totalCostCents: avgMarkere1.entryTotalCostCents,
    reference: "NIR-2026-002", notes: "Markere permanente — lot 1", movedBy: userId, movedAt: new Date(),
  });
  await db.update(finInventoryItems).set({
    qtyOnHand: avgMarkere1.newQtyOnHand, avgCostCents: avgMarkere1.newAvgCostCents, updatedAt: new Date(),
  }).where(eq(finInventoryItems.id, markere.id));

  // Intrare 3: 50 pachete hârtie la 3200 cents/pachet
  const avgHartie1 = calculateAvgCost({ oldQty: 0, oldAvgCostCents: 0, qtyIn: 50, unitCostCents: 3200 });
  await db.insert(finStockMovements).values({
    tenantId, itemId: hartie.id, movementType: "purchase",
    qty: 50, unitCostCents: 3200, totalCostCents: avgHartie1.entryTotalCostCents,
    reference: "NIR-2026-003", notes: "Hârtie imprimare Q2 2026", movedBy: userId, movedAt: new Date(),
  });
  await db.update(finInventoryItems).set({
    qtyOnHand: avgHartie1.newQtyOnHand, avgCostCents: avgHartie1.newAvgCostCents, updatedAt: new Date(),
  }).where(eq(finInventoryItems.id, hartie.id));

  // ─── 3 Ieșiri (vânzări/consum) ────────────────────────────────────────────
  // Refetch stocurile actualizate pentru calcul exit cost corect
  const [caieteCrt] = await db.select().from(finInventoryItems).where(eq(finInventoryItems.id, caiete.id));
  const exitCaiete = calculateExitCost(caieteCrt.qtyOnHand, caieteCrt.avgCostCents, 30);
  if (exitCaiete.ok) {
    await db.insert(finStockMovements).values({
      tenantId, itemId: caiete.id, movementType: "sale",
      qty: 30, unitCostCents: exitCaiete.unitCostCents, totalCostCents: exitCaiete.totalCostCents,
      reference: "VANZ-2026-0045", notes: "Distribuire caiete — grupa Matematică Avansată",
      movedBy: userId, movedAt: new Date(),
    });
    await db.update(finInventoryItems).set({
      qtyOnHand: exitCaiete.remainingQty, updatedAt: new Date(),
    }).where(eq(finInventoryItems.id, caiete.id));
  }

  const [markereCrt] = await db.select().from(finInventoryItems).where(eq(finInventoryItems.id, markere.id));
  const exitMarkere = calculateExitCost(markereCrt.qtyOnHand, markereCrt.avgCostCents, 5);
  if (exitMarkere.ok) {
    await db.insert(finStockMovements).values({
      tenantId, itemId: markere.id, movementType: "sale",
      qty: 5, unitCostCents: exitMarkere.unitCostCents, totalCostCents: exitMarkere.totalCostCents,
      reference: "VANZ-2026-0046", notes: "Markere — sala de arta",
      movedBy: userId, movedAt: new Date(),
    });
    await db.update(finInventoryItems).set({
      qtyOnHand: exitMarkere.remainingQty, updatedAt: new Date(),
    }).where(eq(finInventoryItems.id, markere.id));
  }

  const [hartieCrt] = await db.select().from(finInventoryItems).where(eq(finInventoryItems.id, hartie.id));
  const exitHartie = calculateExitCost(hartieCrt.qtyOnHand, hartieCrt.avgCostCents, 10);
  if (exitHartie.ok) {
    await db.insert(finStockMovements).values({
      tenantId, itemId: hartie.id, movementType: "sale",
      qty: 10, unitCostCents: exitHartie.unitCostCents, totalCostCents: exitHartie.totalCostCents,
      reference: "VANZ-2026-0047", notes: "Hârtie — secretariat + imprimare diplome",
      movedBy: userId, movedAt: new Date(),
    });
    await db.update(finInventoryItems).set({
      qtyOnHand: exitHartie.remainingQty, updatedAt: new Date(),
    }).where(eq(finInventoryItems.id, hartie.id));
  }

  // ─── 2 Ajustări inventar ──────────────────────────────────────────────────
  // Ajustare 1: +10 folii (găsite la inventar fizic)
  const avgFolii1 = calculateAvgCost({ oldQty: 0, oldAvgCostCents: 0, qtyIn: 10, unitCostCents: 4500 });
  await db.insert(finStockMovements).values({
    tenantId, itemId: folii.id, movementType: "adjustment",
    qty: 10, unitCostCents: 4500, totalCostCents: avgFolii1.entryTotalCostCents,
    reference: "INV-2026-Q2", notes: "Ajustare inventar fizic — folii găsite la depozit",
    movedBy: userId, movedAt: new Date(),
  });
  await db.update(finInventoryItems).set({
    qtyOnHand: 10, avgCostCents: 4500, updatedAt: new Date(),
  }).where(eq(finInventoryItems.id, folii.id));

  // Ajustare 2: +100 pixuri (stoc inițial din ajustare)
  await db.insert(finStockMovements).values({
    tenantId, itemId: pixuri.id, movementType: "adjustment",
    qty: 100, unitCostCents: 300, totalCostCents: 30000,
    reference: "INV-2026-Q2", notes: "Ajustare inventar fizic — pixuri preexistente",
    movedBy: userId, movedAt: new Date(),
  });
  await db.update(finInventoryItems).set({
    qtyOnHand: 100, avgCostCents: 300, updatedAt: new Date(),
  }).where(eq(finInventoryItems.id, pixuri.id));
}
