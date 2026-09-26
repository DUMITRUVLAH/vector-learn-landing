/**
 * CRM — stocul produsului, scăzut automat când oportunitatea e câștigată.
 *
 * Regula cerută: „produsele au stoc, iar când se vinde un produs, stocul scade".
 *
 * Unde stă stocul: NU în `crm_products`. Fiecare produs din catalog poate fi legat de un
 * articol de inventar FinDesk (`fin_inventory_items.id`, coloana `crm_products.inventory_item_id`),
 * acolo unde există deja cantitate, cost mediu ponderat și jurnal de mișcări. Dacă CRM-ul și-ar
 * fi ținut propria cantitate, firma ar fi avut două stocuri pentru același produs — cel din
 * ofertare și cel din contabilitate — care diverg la prima corecție făcută doar într-unul.
 * Produsele fără legătură (servicii, abonamente, consultanță) nu au stoc și nu sunt atinse.
 *
 * Când scade: la PRIMA intrare a leadului într-o etapă cu `is_won`. Nu la cheia „paid" și nu la
 * vreo altă etichetă — un workspace își poate redenumi etapele sau poate avea mai multe etape de
 * câștig, iar regula trebuie să le urmeze pe toate (aceeași decizie ca la etapele de pierdere).
 *
 * De câte ori scade: o singură dată. `leads.stock_movement_id` reține mișcarea care a consumat
 * stocul; cât timp e setată, o nouă intrare în „câștigat" nu mai scade nimic. Un lead târât
 * înainte-înapoi peste coloana de câștig în kanban nu poate goli depozitul.
 *
 * Ce se întâmplă la retragerea vânzării: ieșirea din etapa de câștig compensează mișcarea
 * printr-o ajustare pozitivă la costul mediu curent (deci CMP-ul rămâne neschimbat) și eliberează
 * ancora. Nu ștergem mișcarea inițială: jurnalul de stoc e un registru, iar o vânzare care a
 * existat și a fost anulată trebuie să se vadă ca atare.
 *
 * Ce se întâmplă când nu ajunge stocul: afacerea se câștigă oricum. Un CRM nu are voie să refuze
 * înregistrarea unei vânzări reale fiindcă depozitul e în urmă cu recepțiile — ar împinge oamenii
 * să mintă pâlnia. Scăderea se sare, iar omul responsabil primește o notificare și o urmă în
 * istoricul leadului, ca lipsa să fie văzută, nu tăcută.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions, type Lead } from "../../db/schema/leads";
import { crmProducts } from "../../db/schema/crmProducts";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { finInventoryItems, finStockMovements } from "../../db/schema";
import { recordStockMovement } from "../finInventoryMovements";
import { createNotification, notifyManagersAndOwners } from "../createNotification";
import { logCrmAudit } from "./audit";

/** Ce s-a întâmplat cu stocul la o schimbare de etapă — se întoarce în răspunsul rutei. */
export type LeadStockOutcome =
  | { status: "noop" }
  | { status: "decremented"; productName: string; qty: number; remaining: number }
  | { status: "restored"; productName: string; qty: number; remaining: number }
  | { status: "insufficient"; productName: string; requested: number; available: number };

interface StageFlags {
  isWon: boolean;
}

/** Flagurile etapei, căutate în pâlnia leadului. Etapă necunoscută = fără flaguri. */
async function stageFlags(
  tenantId: string,
  pipelineId: string | null,
  key: string | null
): Promise<StageFlags> {
  if (!key) return { isWon: false };
  const rows = await db
    .select({ key: crmPipelineStages.key, isWon: crmPipelineStages.isWon, pipelineId: crmPipelineStages.pipelineId })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.key, key)));
  // Aceeași cheie poate exista în mai multe pâlnii (migrarea 0166): întâi rândul din pâlnia
  // leadului, apoi cel al pâlniei implicite (`pipeline_id` NULL).
  const row = rows.find((r) => r.pipelineId === pipelineId) ?? rows.find((r) => r.pipelineId === null) ?? rows[0];
  return { isWon: !!row?.isWon };
}

/** Produsul leadului împreună cu articolul de inventar legat, dacă există vreunul. */
async function trackedProduct(tenantId: string, productId: string | null) {
  if (!productId) return null;
  const [row] = await db
    .select({
      productId: crmProducts.id,
      productName: crmProducts.name,
      itemId: finInventoryItems.id,
      qtyOnHand: finInventoryItems.qtyOnHand,
      avgCostCents: finInventoryItems.avgCostCents,
    })
    .from(crmProducts)
    .leftJoin(
      finInventoryItems,
      and(eq(finInventoryItems.id, crmProducts.inventoryItemId), eq(finInventoryItems.tenantId, tenantId))
    )
    .where(and(eq(crmProducts.id, productId), eq(crmProducts.tenantId, tenantId)));
  if (!row || !row.itemId) return null;
  return row as { productId: string; productName: string; itemId: string; qtyOnHand: number; avgCostCents: number };
}

async function noteOnLead(tenantId: string, leadId: string, userId: string | null, body: string) {
  await db.insert(leadInteractions).values({
    tenantId,
    leadId,
    // „system", nu „stage_change": urma e scrisă de aplicație, nu de om, iar fișa leadului o
    // arată cu pictograma de informare, lângă mutarea care a declanșat-o.
    type: "system",
    direction: "internal",
    body,
    metadata: { kind: "stock" },
    userId,
  });
}

/**
 * Ajustează stocul după o schimbare de etapă. Best-effort în întregime: dacă tabelele de inventar
 * lipsesc (schemă în urma codului) sau scrierea eșuează, schimbarea de etapă rămâne valabilă și
 * funcția întoarce `noop`. Stocul e o consecință a vânzării, nu o condiție a ei.
 */
export async function syncLeadStockForStage(params: {
  tenantId: string;
  userId: string;
  lead: Lead;
  fromStage: string | null;
  toStage: string;
}): Promise<LeadStockOutcome> {
  const { tenantId, userId, lead, fromStage, toStage } = params;
  try {
    const [to, from] = await Promise.all([
      stageFlags(tenantId, lead.pipelineId ?? null, toStage),
      stageFlags(tenantId, lead.pipelineId ?? null, fromStage),
    ]);

    if (to.isWon && !from.isWon) return await consume({ tenantId, userId, lead });
    if (from.isWon && !to.isWon) return await restore({ tenantId, userId, lead });
    return { status: "noop" };
  } catch (e) {
    console.error("[crm/productStock] sync:", e instanceof Error ? e.message : e);
    return { status: "noop" };
  }
}

async function consume(params: { tenantId: string; userId: string; lead: Lead }): Promise<LeadStockOutcome> {
  const { tenantId, userId, lead } = params;
  if (lead.stockMovementId) return { status: "noop" }; // deja scăzut pentru acest lead
  const product = await trackedProduct(tenantId, lead.productId ?? null);
  if (!product) return { status: "noop" };

  const qty = Math.max(1, lead.productQty ?? 1);
  const result = await recordStockMovement({
    tenantId,
    itemId: product.itemId,
    movementType: "sale",
    qty,
    reference: `CRM-${lead.id.slice(0, 8)}`,
    notes: `Vânzare din CRM: ${lead.fullName}`,
    movedBy: userId,
  });

  if (!result.ok) {
    if (result.error === "insufficient_stock") {
      const body = `Stoc insuficient pentru „${product.productName}": cerute ${result.requested}, disponibile ${result.available}. Vânzarea a fost înregistrată, stocul NU a fost scăzut.`;
      await noteOnLead(tenantId, lead.id, userId, body);
      const notice = {
        type: "crm_stock_insufficient",
        title: "Stoc insuficient la o vânzare câștigată",
        body,
        link: `/business/crm?lead=${lead.id}`,
        metadata: { leadId: lead.id, productId: product.productId },
      };
      if (lead.assignedTo) await createNotification({ tenantId, userId: lead.assignedTo, ...notice });
      else await notifyManagersAndOwners(tenantId, notice);
      return {
        status: "insufficient",
        productName: product.productName,
        requested: result.requested,
        available: result.available,
      };
    }
    return { status: "noop" };
  }

  await db
    .update(leads)
    .set({ stockMovementId: result.movement.id, updatedAt: new Date() })
    .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));

  await noteOnLead(
    tenantId,
    lead.id,
    userId,
    `Stoc scăzut: -${qty} × „${product.productName}" (rămas: ${result.newQtyOnHand}).`
  );
  await logCrmAudit({
    tenantId,
    actorId: userId,
    action: "lead.stock_consumed",
    target: "crm_lead",
    targetId: lead.id,
    after: { productId: product.productId, qty, remaining: result.newQtyOnHand },
  });

  // Articolul a scăzut sub pragul de alertă → cine răspunde de lead află acum, nu la următoarea
  // vânzare pe care n-o mai poate onora.
  await maybeWarnLowStock(tenantId, product.itemId, product.productName, result.newQtyOnHand, lead);

  return {
    status: "decremented",
    productName: product.productName,
    qty,
    remaining: result.newQtyOnHand,
  };
}

async function restore(params: { tenantId: string; userId: string; lead: Lead }): Promise<LeadStockOutcome> {
  const { tenantId, userId, lead } = params;
  if (!lead.stockMovementId) return { status: "noop" };
  const product = await trackedProduct(tenantId, lead.productId ?? null);
  if (!product) {
    // Produsul a fost dezlegat de inventar între timp — eliberăm ancora, altfel leadul rămâne
    // marcat „consumat" pe veci și o vânzare ulterioară n-ar mai scădea nimic.
    await db
      .update(leads)
      .set({ stockMovementId: null, updatedAt: new Date() })
      .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));
    return { status: "noop" };
  }

  // Se întoarce EXACT ce a scos mișcarea de vânzare, nu `productQty` de acum: cantitatea de pe
  // lead se poate edita după câștig (2 → 4), iar returul celor 4 ar fi creat 2 bucăți fantomă în
  // depozit. Ancora `stock_movement_id` ține deja mișcarea, deci cantitatea reală e acolo — fără
  // o coloană nouă. Tot de acolo vine și articolul: dacă produsul a fost legat între timp de alt
  // articol, bucățile se întorc în cel din care au plecat.
  const [sale] = await db
    .select({ qty: finStockMovements.qty, itemId: finStockMovements.itemId })
    .from(finStockMovements)
    .where(and(eq(finStockMovements.id, lead.stockMovementId), eq(finStockMovements.tenantId, tenantId)));
  const qty = sale ? Math.max(1, Math.abs(sale.qty)) : Math.max(1, lead.productQty ?? 1);
  const itemId = sale?.itemId ?? product.itemId;
  const [saleItem] =
    itemId === product.itemId
      ? [{ avgCostCents: product.avgCostCents }]
      : await db
          .select({ avgCostCents: finInventoryItems.avgCostCents })
          .from(finInventoryItems)
          .where(and(eq(finInventoryItems.id, itemId), eq(finInventoryItems.tenantId, tenantId)));
  // Ajustare la costul mediu curent: cantitatea se întoarce, CMP-ul rămâne exact cât era.
  const result = await recordStockMovement({
    tenantId,
    itemId,
    movementType: "adjustment",
    qty,
    unitCostCents: saleItem?.avgCostCents ?? product.avgCostCents,
    reference: `CRM-${lead.id.slice(0, 8)}`,
    notes: `Vânzare retrasă în CRM: ${lead.fullName}`,
    movedBy: userId,
  });
  if (!result.ok) return { status: "noop" };

  await db
    .update(leads)
    .set({ stockMovementId: null, updatedAt: new Date() })
    .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));

  await noteOnLead(
    tenantId,
    lead.id,
    userId,
    `Stoc returnat: +${qty} × „${product.productName}" (rămas: ${result.newQtyOnHand}).`
  );
  await logCrmAudit({
    tenantId,
    actorId: userId,
    action: "lead.stock_restored",
    target: "crm_lead",
    targetId: lead.id,
    after: { productId: product.productId, qty, remaining: result.newQtyOnHand },
  });

  return { status: "restored", productName: product.productName, qty, remaining: result.newQtyOnHand };
}

async function maybeWarnLowStock(
  tenantId: string,
  itemId: string,
  productName: string,
  remaining: number,
  lead: Lead
) {
  const [item] = await db
    .select({ minQtyAlert: finInventoryItems.minQtyAlert })
    .from(finInventoryItems)
    .where(and(eq(finInventoryItems.id, itemId), eq(finInventoryItems.tenantId, tenantId)));
  const threshold = item?.minQtyAlert ?? 0;
  if (!threshold || remaining > threshold) return;

  const notice = {
    type: "crm_stock_low",
    title: "Stoc scăzut",
    body: `„${productName}" a rămas la ${remaining} bucăți (prag: ${threshold}).`,
    link: `/business/crm/produse`,
    metadata: { leadId: lead.id, productName },
  };
  if (lead.assignedTo) await createNotification({ tenantId, userId: lead.assignedTo, ...notice });
  else await notifyManagersAndOwners(tenantId, notice);
}
