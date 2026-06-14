/**
 * INVENTORY-001: Gestiune stoc — catalog articole + jurnal mișcări
 * Tabelele: fin_inventory_items, fin_stock_movements
 * Metoda: Cost Mediu Ponderat (CMP / WAC) — SNC 2 Moldova
 */

import { pgTable, uuid, text, varchar, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { invoices } from "./invoices";

// ─── Catalog articole inventar ────────────────────────────────────────────────

export const finInventoryItems = pgTable("fin_inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  /** Denumire articol (ex: "Caiete A4 80 file") */
  name: text("name").notNull(),

  /** Cod articol intern opțional (ex: "CAI-A4-80") */
  sku: varchar("sku", { length: 50 }),

  /** Unitate de măsură: buc / kg / l / m / set / pachet */
  unit: varchar("unit", { length: 20 }).default("buc").notNull(),

  /** Descriere suplimentară */
  description: text("description"),

  /**
   * Cantitate curentă în stoc (în unități întregi).
   * Valoare în bigint pentru precizie maximă (0 = epuizat).
   */
  qtyOnHand: bigint("qty_on_hand", { mode: "number" }).default(0).notNull(),

  /**
   * Cost mediu ponderat per unitate, în MDL cents.
   * Recalculat la fiecare intrare (achiziție / transfer_in).
   */
  avgCostCents: bigint("avg_cost_cents", { mode: "number" }).default(0).notNull(),

  /**
   * Cantitate minimă pentru alertă stoc scăzut.
   * 0 = fără alertă.
   */
  minQtyAlert: bigint("min_qty_alert", { mode: "number" }).default(0),

  /** Categoria articolului pentru filtrare și rapoarte */
  category: varchar("category", { length: 50 }),
  // Exemple: "consumabile" | "active_mici" | "materiale_didactice" | "papetarie" | "electronice"

  /** Articol activ în catalog (false = arhivat) */
  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type FinInventoryItem = typeof finInventoryItems.$inferSelect;
export type NewFinInventoryItem = typeof finInventoryItems.$inferInsert;

// ─── Jurnal mișcări stoc ──────────────────────────────────────────────────────

export const finStockMovements = pgTable("fin_stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  itemId: uuid("item_id")
    .notNull()
    .references(() => finInventoryItems.id, { onDelete: "restrict" }),

  /**
   * Tipul mișcării:
   * - purchase      → intrare din achiziție (crește stocul, recalculează CMP)
   * - sale          → ieșire prin vânzare/factură (scade stocul)
   * - adjustment    → ajustare inventar fizic (±stoc, fără recalculare CMP)
   * - transfer_in   → transfer intrat de la filială
   * - transfer_out  → transfer ieșit spre filială
   */
  movementType: varchar("movement_type", { length: 30 }).notNull(),

  /**
   * Cantitate mișcată (mereu pozitivă — tipul determină direcția).
   */
  qty: bigint("qty", { mode: "number" }).notNull(),

  /**
   * Cost unitar la momentul mișcării, în MDL cents.
   * La ieșiri = costul mediu ponderat din momentul ieșirii.
   */
  unitCostCents: bigint("unit_cost_cents", { mode: "number" }).default(0).notNull(),

  /**
   * Valoare totală a mișcării = qty × unitCostCents
   */
  totalCostCents: bigint("total_cost_cents", { mode: "number" }).default(0).notNull(),

  /**
   * FK opțional la factura care a generat ieșirea
   * (sale din factură — BILL integration).
   */
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),

  /**
   * Număr document sursă (ex: "FC-2026-0012", "NIR-001", "INV-0045")
   */
  reference: varchar("reference", { length: 100 }),

  /** Note libere despre mișcare */
  notes: text("notes"),

  /**
   * Ramura care a efectuat mișcarea (pentru transferuri inter-filiale).
   * FK simplu — nu referențiem branches ca să evităm dependința circulară.
   */
  branchId: uuid("branch_id"),

  /** Utilizatorul care a înregistrat mișcarea */
  movedBy: uuid("moved_by").references(() => users.id, { onDelete: "set null" }),

  movedAt: timestamp("moved_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FinStockMovement = typeof finStockMovements.$inferSelect;
export type NewFinStockMovement = typeof finStockMovements.$inferInsert;
