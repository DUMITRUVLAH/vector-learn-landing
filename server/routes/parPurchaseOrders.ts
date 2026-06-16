/**
 * VF-503: purchase order issued from an approved PAR.
 *   POST /api/par/:id/purchase-order  → issue PO (par_admin/finance, PAR approved/in_finance, has payee)
 *   GET  /api/par/:id/purchase-order  → the PO, or 404
 *
 * Sub-paths of /:id, so safe inside parRoutes — but kept in a dedicated mounted router for clarity.
 * Mounted in app.ts: app.route("/api/par", parPurchaseOrderRoutes)
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parPurchaseOrders, parAudit, parSettings } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parPurchaseOrderRoutes = new Hono<{ Variables: AuthVariables }>();
parPurchaseOrderRoutes.use("*", requireAuth);

/** Generate a collision-free PO number per tenant + year. */
async function generatePoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const [settings] = await db
    .select({ prefix: parSettings.requestNoPrefix })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const rows = await db
    .select({ poNumber: parPurchaseOrders.poNumber })
    .from(parPurchaseOrders)
    .where(eq(parPurchaseOrders.tenantId, tenantId));
  const prefix = `PO-${year}-`;
  const max = rows
    .map((r) => r.poNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  void settings; // prefix is fixed "PO" for purchase orders regardless of PAR prefix
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** GET /api/par/:id/purchase-order */
parPurchaseOrderRoutes.get("/:id/purchase-order", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const canSee = par.requestedByUserId === user.id || roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!canSee) return c.json({ error: "not_found" }, 404);

  const [po] = await db
    .select()
    .from(parPurchaseOrders)
    .where(and(eq(parPurchaseOrders.parId, parId), eq(parPurchaseOrders.tenantId, tenantId)));
  if (!po) return c.json({ error: "not_found" }, 404);
  return c.json(po);
});

/** POST /api/par/:id/purchase-order — issue the PO. */
parPurchaseOrderRoutes.post("/:id/purchase-order", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.some((r) => ["finance", "par_admin"].includes(r))) {
    return c.json({ error: "forbidden: finance or admin role required" }, 403);
  }
  if (!["approved", "in_finance", "paid"].includes(par.status)) {
    return c.json({ error: `conflict: PAR must be approved before issuing a PO (status '${par.status}')` }, 400);
  }
  if (!par.payeeName && !par.vendorId) {
    return c.json({ error: "conflict: PAR has no payee" }, 400);
  }

  // One PO per PAR (unique constraint) — idempotency guard.
  const [existing] = await db
    .select({ id: parPurchaseOrders.id })
    .from(parPurchaseOrders)
    .where(and(eq(parPurchaseOrders.parId, parId), eq(parPurchaseOrders.tenantId, tenantId)));
  if (existing) return c.json({ error: "conflict: PO already issued for this PAR" }, 409);

  const poNumber = await generatePoNumber(tenantId);
  const [po] = await db
    .insert(parPurchaseOrders)
    .values({
      tenantId,
      parId,
      poNumber,
      vendorName: par.payeeName,
      vendorIdnp: par.payeeIdnp,
      vendorIban: par.payeeIban,
      totalCents: par.totalEstimatedCents,
      currency: par.currency,
      issuedByUserId: user.id,
    })
    .returning();

  await db.insert(parAudit).values({
    tenantId,
    parId,
    actorUserId: user.id,
    event: "po_issued",
    detail: `Comandă emisă: ${poNumber} către ${par.payeeName ?? "—"} (${par.totalEstimatedCents / 100} ${par.currency})`,
  });

  return c.json(po, 201);
});
