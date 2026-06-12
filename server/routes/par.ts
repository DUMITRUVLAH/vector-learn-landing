/**
 * PAR-101: Core PAR request CRUD — header (sections 1–9), draft lifecycle, request numbering
 * PAR-102: Line items (section 10) — add/edit/delete, auto-sum, above-micro-threshold flag
 * PAR-103: End-use (section 11) + payee block (section 12) with IBAN/IDNP validation
 *
 * CORE: backlog/par/PAR-CORE.md §2, §4, §9
 * Mounted in server/app.ts: app.route("/api/par", parRoutes)
 *
 * Routes:
 *   POST   /api/par                              → create draft
 *   GET    /api/par                              → list (tenant-scoped, role-filtered)
 *   GET    /api/par/:id                          → detail (header + line items + approvals + payment)
 *   PATCH  /api/par/:id                          → update header / end-use / payee (draft|changes_requested only)
 *   DELETE /api/par/:id                          → cancel (requestor own | par_admin)
 *   POST   /api/par/:id/line-items               → add line item
 *   PATCH  /api/par/:id/line-items/:lineId       → update line item
 *   DELETE /api/par/:id/line-items/:lineId       → delete line item
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, desc, asc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parLineItems,
  parApprovals,
  parAttachments,
  parPayments,
  parAudit,
  parSettings,
  parVendors,
} from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { generateRequestNo } from "../lib/par/requestNo";
import { isValidMoldovaIBAN, isValidIDNP } from "../lib/par/validators";
import { recalcParTotal } from "../lib/par/totals";

export const parRoutes = new Hono<{ Variables: AuthVariables }>();
parRoutes.use("*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const parPurposeValues = ["execute_payment", "obtain_quotations", "provide_estimate"] as const;
const parChargeToValues = ["operations", "program", "other"] as const;

const createParSchema = z.object({
  date_of_request: z.string().datetime().optional(),
  requestor_title: z.string().max(300).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  date_needed: z.string().datetime().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  budget_code_id: z.string().uuid().optional().nullable(),
  budget_code_note: z.string().max(500).optional().nullable(),
  purpose: z.enum(parPurposeValues).optional(),
  charge_to: z.enum(parChargeToValues).optional(),
  charge_billing_code: z.string().max(100).optional().nullable(),
});

const updateParSchema = z.object({
  date_of_request: z.string().datetime().optional(),
  requestor_title: z.string().max(300).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  date_needed: z.string().datetime().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  budget_code_id: z.string().uuid().optional().nullable(),
  budget_code_note: z.string().max(500).optional().nullable(),
  purpose: z.enum(parPurposeValues).optional(),
  charge_to: z.enum(parChargeToValues).optional(),
  charge_billing_code: z.string().max(100).optional().nullable(),
  // PAR-103: end-use + payee
  end_use: z.string().max(5000).optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  payee_name: z.string().max(300).optional().nullable(),
  payee_idnp: z.string().max(13).optional().nullable(),
  payee_iban: z.string().max(34).optional().nullable(),
  payee_bank: z.string().max(300).optional().nullable(),
  // Section 13
  attachments_present: z.boolean().optional(),
  attachments_note: z.string().max(2000).optional().nullable(),
});

const lineItemSchema = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.number().int().positive("quantity must be > 0"),
  unit: z.string().max(50).optional().nullable(),
  unit_price_cents: z.number().int().min(0, "unit_price_cents must be >= 0"),
});

const lineItemUpdateSchema = lineItemSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "at least one field required" }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Editable statuses (PAR-101 §AC) */
const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

/** Fetch a PAR by id + tenant with 404/403 guards. Also checks authorship for mutations. */
async function getPAR(
  parId: string,
  tenantId: string
) {
  const [par] = await db
    .select()
    .from(parRequests)
    .where(
      and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId))
    );
  return par ?? null;
}

/** Write a par_audit row */
async function writeAudit(params: {
  tenantId: string;
  parId: string;
  actorUserId: string;
  event: string;
  detail?: string;
}) {
  await db.insert(parAudit).values({
    tenantId: params.tenantId,
    parId: params.parId,
    actorUserId: params.actorUserId,
    event: params.event,
    detail: params.detail ?? null,
  });
}

// ─── POST /api/par — create draft ───────────────────────────────────────────

parRoutes.post(
  "/",
  zValidator("json", createParSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const tenantId = user.tenantId;

    // Validate date_needed >= date_of_request (PAR-101 §AC)
    const dateOfRequest = body.date_of_request
      ? new Date(body.date_of_request)
      : new Date();
    if (body.date_needed) {
      const dateNeeded = new Date(body.date_needed);
      if (dateNeeded < dateOfRequest) {
        return c.json(
          { error: "date_needed must be >= date_of_request" },
          400
        );
      }
    }

    // Generate collision-free request number (max+1 within tenant+year)
    const requestNo = await generateRequestNo(tenantId);

    const [par] = await db
      .insert(parRequests)
      .values({
        tenantId,
        requestNo,
        dateOfRequest,
        requestedByUserId: user.id,
        requestorTitle: body.requestor_title ?? null,
        departmentId: body.department_id ?? null,
        dateNeeded: body.date_needed ? new Date(body.date_needed) : null,
        projectId: body.project_id ?? null,
        budgetCodeId: body.budget_code_id ?? null,
        budgetCodeNote: body.budget_code_note ?? null,
        purpose: body.purpose ?? "execute_payment",
        chargeTo: body.charge_to ?? "program",
        chargeBillingCode: body.charge_billing_code ?? null,
        status: "draft",
        totalEstimatedCents: 0,
      })
      .returning();

    await writeAudit({
      tenantId,
      parId: par.id,
      actorUserId: user.id,
      event: "created",
      detail: `PAR ${requestNo} created as draft`,
    });

    return c.json(par, 201);
  }
);

// ─── GET /api/par — list ─────────────────────────────────────────────────────

parRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const roles = await getUserPARRoles(user.id, tenantId);

  // Query params
  const status = c.req.query("status");
  const purpose = c.req.query("purpose");
  const projectId = c.req.query("project_id");
  const q = c.req.query("q");

  // Build conditions
  const conditions: ReturnType<typeof eq>[] = [eq(parRequests.tenantId, tenantId)];

  // Requestors see only their own PARs (unless they also have approver/finance/admin role)
  const hasElevatedRole = roles.some((r) =>
    ["approver", "finance", "par_admin"].includes(r)
  );
  if (!hasElevatedRole) {
    conditions.push(eq(parRequests.requestedByUserId, user.id));
  }

  if (status && parStatusValues.includes(status as typeof parStatusValues[number])) {
    conditions.push(eq(parRequests.status, status as typeof parRequests.status.dataType));
  }
  if (purpose && parPurposeValues.includes(purpose as typeof parPurposeValues[number])) {
    conditions.push(eq(parRequests.purpose, purpose as typeof parRequests.purpose.dataType));
  }
  if (projectId) {
    conditions.push(eq(parRequests.projectId, projectId));
  }

  const rows = await db
    .select()
    .from(parRequests)
    .where(and(...conditions))
    .orderBy(desc(parRequests.createdAt));

  // Filter by q (search in requestNo)
  const filtered = q
    ? rows.filter((r) =>
        r.requestNo.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  // Get micro-purchase threshold for flag
  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  const result = filtered.map((r) => ({
    ...r,
    above_micro_threshold: r.totalEstimatedCents > threshold,
  }));

  return c.json({ requests: result, total: result.length });
});

const parStatusValues = [
  "draft",
  "pending_approval",
  "changes_requested",
  "rejected",
  "approved",
  "in_finance",
  "reapproval_required",
  "paid",
  "cancelled",
] as const;

// ─── GET /api/par/:id — detail ───────────────────────────────────────────────

parRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const hasElevatedRole = roles.some((r) =>
    ["approver", "finance", "par_admin"].includes(r)
  );

  // Requestors can only see their own PARs (unless elevated role)
  if (!hasElevatedRole && par.requestedByUserId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }

  // Fetch related data
  const lineItems = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)))
    .orderBy(asc(parLineItems.position));

  const approvals = await db
    .select()
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));

  const attachments = await db
    .select()
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  const [payment] = await db
    .select()
    .from(parPayments)
    .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

  // Get micro-purchase threshold for flag
  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  // GDPR (CORE §9): only show payee fields to requestor/routed approvers/finance/admin
  const canSeePayee =
    par.requestedByUserId === user.id || hasElevatedRole;

  const parData = canSeePayee
    ? par
    : {
        ...par,
        vendorId: null,
        payeeName: null,
        payeeIdnp: null,
        payeeIban: null,
        payeeBank: null,
      };

  return c.json({
    ...parData,
    above_micro_threshold: par.totalEstimatedCents > threshold,
    line_items: lineItems,
    approvals,
    attachments,
    payment: payment ?? null,
  });
});

// ─── PATCH /api/par/:id — update header (draft | changes_requested only) ───

parRoutes.patch(
  "/:id",
  zValidator("json", updateParSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const par = await getPAR(parId, tenantId);
    if (!par) return c.json({ error: "not_found" }, 404);

    // Only author can edit, only in editable statuses (PAR-101 §AC)
    if (par.requestedByUserId !== user.id) {
      return c.json({ error: "forbidden: only the author can edit this PAR" }, 403);
    }
    if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
      return c.json(
        { error: `forbidden: PAR status '${par.status}' is not editable` },
        403
      );
    }

    // Validate date_needed
    const baseDateOfRequest = body.date_of_request
      ? new Date(body.date_of_request)
      : par.dateOfRequest;
    if (body.date_needed) {
      const dateNeeded = new Date(body.date_needed);
      if (dateNeeded < baseDateOfRequest) {
        return c.json(
          { error: "date_needed must be >= date_of_request" },
          400
        );
      }
    }

    // PAR-103: IBAN / IDNP validation
    if (body.payee_iban) {
      if (!isValidMoldovaIBAN(body.payee_iban)) {
        return c.json(
          { error: "invalid_iban: must be a valid MD IBAN (mod-97 checksum)" },
          400
        );
      }
    }
    if (body.payee_idnp) {
      if (!isValidIDNP(body.payee_idnp)) {
        return c.json(
          { error: "invalid_idnp: must be exactly 13 digits" },
          400
        );
      }
    }

    // PAR-103: If vendor_id is set, copy snapshot from par_vendors
    let vendorSnapshot: {
      vendorId?: string;
      payeeName?: string | null;
      payeeIdnp?: string | null;
      payeeIban?: string | null;
      payeeBank?: string | null;
    } = {};

    if (body.vendor_id) {
      const [vendor] = await db
        .select()
        .from(parVendors)
        .where(
          and(eq(parVendors.id, body.vendor_id), eq(parVendors.tenantId, tenantId))
        );
      if (!vendor) {
        return c.json({ error: "vendor_not_found" }, 404);
      }
      // Copy snapshot for historical immutability
      vendorSnapshot = {
        vendorId: vendor.id,
        payeeName: vendor.name,
        payeeIdnp: vendor.idnp ?? null,
        payeeIban: vendor.iban ?? null,
        payeeBank: vendor.bank ?? null,
      };
    } else if (body.vendor_id === null) {
      // Explicitly clearing vendor
      vendorSnapshot = { vendorId: null };
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.date_of_request !== undefined)
      updateData.dateOfRequest = new Date(body.date_of_request);
    if (body.requestor_title !== undefined)
      updateData.requestorTitle = body.requestor_title;
    if (body.department_id !== undefined)
      updateData.departmentId = body.department_id;
    if (body.date_needed !== undefined)
      updateData.dateNeeded = body.date_needed ? new Date(body.date_needed) : null;
    if (body.project_id !== undefined) updateData.projectId = body.project_id;
    if (body.budget_code_id !== undefined)
      updateData.budgetCodeId = body.budget_code_id;
    if (body.budget_code_note !== undefined)
      updateData.budgetCodeNote = body.budget_code_note;
    if (body.purpose !== undefined) updateData.purpose = body.purpose;
    if (body.charge_to !== undefined) updateData.chargeTo = body.charge_to;
    if (body.charge_billing_code !== undefined)
      updateData.chargeBillingCode = body.charge_billing_code;
    if (body.end_use !== undefined) updateData.endUse = body.end_use;
    if (body.attachments_present !== undefined)
      updateData.attachmentsPresent = body.attachments_present;
    if (body.attachments_note !== undefined)
      updateData.attachmentsNote = body.attachments_note;

    // Inline payee fields (no vendor_id path)
    if (!body.vendor_id && body.vendor_id !== null) {
      if (body.payee_name !== undefined) updateData.payeeName = body.payee_name;
      if (body.payee_idnp !== undefined) updateData.payeeIdnp = body.payee_idnp;
      if (body.payee_iban !== undefined) updateData.payeeIban = body.payee_iban;
      if (body.payee_bank !== undefined) updateData.payeeBank = body.payee_bank;
    }

    // Merge vendor snapshot (overrides inline if vendor_id was provided)
    if (Object.keys(vendorSnapshot).length > 0) {
      if (vendorSnapshot.vendorId !== undefined)
        updateData.vendorId = vendorSnapshot.vendorId;
      if (vendorSnapshot.payeeName !== undefined)
        updateData.payeeName = vendorSnapshot.payeeName;
      if (vendorSnapshot.payeeIdnp !== undefined)
        updateData.payeeIdnp = vendorSnapshot.payeeIdnp;
      if (vendorSnapshot.payeeIban !== undefined)
        updateData.payeeIban = vendorSnapshot.payeeIban;
      if (vendorSnapshot.payeeBank !== undefined)
        updateData.payeeBank = vendorSnapshot.payeeBank;
    }

    const [updated] = await db
      .update(parRequests)
      .set(updateData)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "edited",
      detail: `Updated fields: ${Object.keys(updateData)
        .filter((k) => k !== "updatedAt")
        .join(", ")}`,
    });

    // Get micro-purchase threshold for flag
    const [settings] = await db
      .select({ threshold: parSettings.microPurchaseThresholdCents })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    const threshold = settings?.threshold ?? 1000000;

    return c.json({
      ...updated,
      above_micro_threshold: updated.totalEstimatedCents > threshold,
    });
  }
);

// ─── DELETE /api/par/:id — cancel ────────────────────────────────────────────

parRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const isAdmin = roles.includes("par_admin");
  const isAuthor = par.requestedByUserId === user.id;

  if (!isAuthor && !isAdmin) {
    return c.json({ error: "forbidden" }, 403);
  }

  const terminalStatuses = ["paid", "cancelled"];
  if (terminalStatuses.includes(par.status)) {
    return c.json(
      { error: `Cannot cancel a PAR with status '${par.status}'` },
      400
    );
  }

  const [updated] = await db
    .update(parRequests)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
    .returning();

  await writeAudit({
    tenantId,
    parId,
    actorUserId: user.id,
    event: "cancelled",
  });

  return c.json(updated);
});

// ─── POST /api/par/:id/line-items ─────────────────────────────────────────────

parRoutes.post(
  "/:id/line-items",
  zValidator("json", lineItemSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const par = await getPAR(parId, tenantId);
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.requestedByUserId !== user.id) {
      return c.json({ error: "forbidden: only the author can add line items" }, 403);
    }
    if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
      return c.json(
        { error: `forbidden: PAR status '${par.status}' is not editable` },
        403
      );
    }

    // Compute line total server-side (never trust client)
    const lineTotalCents = body.quantity * body.unit_price_cents;

    // Get next position
    const existingLines = await db
      .select({ position: parLineItems.position })
      .from(parLineItems)
      .where(
        and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId))
      );
    const nextPosition =
      existingLines.length === 0
        ? 1
        : Math.max(...existingLines.map((l) => l.position)) + 1;

    const [lineItem] = await db
      .insert(parLineItems)
      .values({
        tenantId,
        parId,
        position: nextPosition,
        description: body.description,
        quantity: body.quantity,
        unit: body.unit ?? null,
        unitPriceCents: body.unit_price_cents,
        lineTotalCents,
      })
      .returning();

    // Recalculate total on parent PAR
    const newTotal = await recalcParTotal(parId, tenantId);

    // Get threshold for flag
    const [settings] = await db
      .select({ threshold: parSettings.microPurchaseThresholdCents })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    const threshold = settings?.threshold ?? 1000000;

    return c.json(
      {
        line_item: lineItem,
        par_total_estimated_cents: newTotal,
        above_micro_threshold: newTotal > threshold,
      },
      201
    );
  }
);

// ─── PATCH /api/par/:id/line-items/:lineId ───────────────────────────────────

parRoutes.patch(
  "/:id/line-items/:lineId",
  zValidator("json", lineItemUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const lineId = c.req.param("lineId");
    const body = c.req.valid("json");

    const par = await getPAR(parId, tenantId);
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.requestedByUserId !== user.id) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
      return c.json({ error: `forbidden: status '${par.status}' not editable` }, 403);
    }

    // Fetch existing line
    const [existing] = await db
      .select()
      .from(parLineItems)
      .where(
        and(
          eq(parLineItems.id, lineId),
          eq(parLineItems.parId, parId),
          eq(parLineItems.tenantId, tenantId)
        )
      );
    if (!existing) return c.json({ error: "not_found" }, 404);

    const newQty = body.quantity ?? existing.quantity;
    const newUnitPrice = body.unit_price_cents ?? existing.unitPriceCents;
    const newLineTotal = newQty * newUnitPrice;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined) updateData.description = body.description;
    if (body.quantity !== undefined) updateData.quantity = body.quantity;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.unit_price_cents !== undefined)
      updateData.unitPriceCents = body.unit_price_cents;
    updateData.lineTotalCents = newLineTotal;

    const [updated] = await db
      .update(parLineItems)
      .set(updateData)
      .where(
        and(
          eq(parLineItems.id, lineId),
          eq(parLineItems.tenantId, tenantId)
        )
      )
      .returning();

    const newTotal = await recalcParTotal(parId, tenantId);

    const [settings] = await db
      .select({ threshold: parSettings.microPurchaseThresholdCents })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    const threshold = settings?.threshold ?? 1000000;

    return c.json({
      line_item: updated,
      par_total_estimated_cents: newTotal,
      above_micro_threshold: newTotal > threshold,
    });
  }
);

// ─── DELETE /api/par/:id/line-items/:lineId ──────────────────────────────────

parRoutes.delete("/:id/line-items/:lineId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const lineId = c.req.param("lineId");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);

  if (par.requestedByUserId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
    return c.json({ error: `forbidden: status '${par.status}' not editable` }, 403);
  }

  const deleted = await db
    .delete(parLineItems)
    .where(
      and(
        eq(parLineItems.id, lineId),
        eq(parLineItems.parId, parId),
        eq(parLineItems.tenantId, tenantId)
      )
    )
    .returning();

  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);

  const newTotal = await recalcParTotal(parId, tenantId);

  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  return c.json({
    ok: true,
    par_total_estimated_cents: newTotal,
    above_micro_threshold: newTotal > threshold,
  });
});
