/**
 * VF-504: goods/services receipt (confirm what arrived before payment).
 *   POST /api/par/:id/receipts  → record a receipt (finance/par_admin, PAR in_finance)
 *   GET  /api/par/:id/receipts  → receipts + their lines
 *
 * Mounted in app.ts before generic parRoutes.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parLineItems, parReceipts, parReceiptLines, parAudit } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parReceiptsRoutes = new Hono<{ Variables: AuthVariables }>();
parReceiptsRoutes.use("*", requireAuth);

const receiptSchema = z.object({
  complete: z.boolean(),
  notes: z.string().max(2000).optional().nullable(),
  file_url: z.string().max(2000).optional().nullable(),
  lines: z
    .array(z.object({ line_item_id: z.string().uuid(), qty_received: z.number().int().min(0) }))
    .min(1),
});

/** GET /api/par/:id/receipts — receipts with their lines. */
parReceiptsRoutes.get("/:id/receipts", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const [par] = await db.select().from(parRequests).where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(user.id, tenantId);
  const canSee = par.requestedByUserId === user.id || roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!canSee) return c.json({ error: "not_found" }, 404);

  const receipts = await db
    .select()
    .from(parReceipts)
    .where(and(eq(parReceipts.parId, parId), eq(parReceipts.tenantId, tenantId)));
  const ids = receipts.map((r) => r.id);
  const lines = ids.length
    ? await db.select().from(parReceiptLines).where(and(eq(parReceiptLines.tenantId, tenantId), inArray(parReceiptLines.receiptId, ids)))
    : [];

  return c.json({
    receipts: receipts.map((r) => ({ ...r, lines: lines.filter((l) => l.receiptId === r.id) })),
  });
});

/** POST /api/par/:id/receipts — record a receipt (finance/admin, PAR in_finance). */
parReceiptsRoutes.post("/:id/receipts", zValidator("json", receiptSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const body = c.req.valid("json");

  const [par] = await db.select().from(parRequests).where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.some((r) => ["finance", "par_admin"].includes(r))) {
    return c.json({ error: "forbidden: finance or admin role required" }, 403);
  }
  if (par.status !== "in_finance") {
    return c.json({ error: `conflict: receipt only on in_finance PARs (status '${par.status}')` }, 400);
  }

  // Validate the lines belong to this PAR.
  const parLines = await db
    .select({ id: parLineItems.id })
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)));
  const validIds = new Set(parLines.map((l) => l.id));
  for (const l of body.lines) {
    if (!validIds.has(l.line_item_id)) return c.json({ error: "invalid_line", detail: l.line_item_id }, 400);
  }

  const [receipt] = await db
    .insert(parReceipts)
    .values({
      tenantId,
      parId,
      receivedByUserId: user.id,
      complete: body.complete,
      notes: body.notes ?? null,
      fileUrl: body.file_url ?? null,
    })
    .returning();

  if (body.lines.length > 0) {
    await db.insert(parReceiptLines).values(
      body.lines.map((l) => ({ tenantId, receiptId: receipt.id, lineItemId: l.line_item_id, qtyReceived: l.qty_received }))
    );
  }

  await db.insert(parAudit).values({
    tenantId,
    parId,
    actorUserId: user.id,
    event: "goods_received",
    detail: `Recepție ${body.complete ? "completă" : "parțială"} înregistrată (${body.lines.length} linii)`,
  });

  return c.json({ ...receipt, lines: body.lines }, 201);
});
