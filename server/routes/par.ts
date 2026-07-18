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
import { and, eq, ilike, desc, asc, inArray, or, gte, lte, sql } from "drizzle-orm";
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
  parDepartments,
  parProjects,
  parBudgetCodes,
  parEvents,
  parComments,
  parQuotes,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { generateRequestNo } from "../lib/par/requestNo";
import { isValidMoldovaIBAN, isValidIDNP } from "../lib/par/validators";
import { recalcParTotal } from "../lib/par/totals";
import { submitPAR, buildBodyForHash } from "../lib/par/submit";
import { verifyParBodyHash } from "../lib/par/integrity";
import { buildApprovalSheetLines, type SheetLine } from "../lib/par/approvalSheet";
import { winAnsiSafe } from "../lib/par/pdfText";

export const parRoutes = new Hono<{ Variables: AuthVariables }>();
parRoutes.use("*", requireAuth);
// Guard non-UUID path params before they reach a Postgres uuid query (→ 500). Covers both the
// bare `/:id` (GET/PATCH/DELETE) and the nested `/:id/...` (submit, line-items, comments, quotes…).
parRoutes.use("/:id", parUuidGuard("id"));
parRoutes.use("/:id/:action/*", parUuidGuard("id"));

// ─── Validation schemas ───────────────────────────────────────────────────────

const parPurposeValues = ["execute_payment", "obtain_quotations", "provide_estimate"] as const;
const parChargeToValues = ["operations", "program", "other"] as const;

const createParSchema = z.object({
  date_of_request: z.string().datetime().optional(),
  requestor_title: z.string().max(300).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  date_needed: z.string().datetime().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  // VM1-04: optional event (sub-entity of project)
  event_id: z.string().uuid().optional().nullable(),
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
  // VM1-04: optional event (sub-entity of project)
  event_id: z.string().uuid().optional().nullable(),
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
  /** Feature 1: "fizic" (persoană fizică) | "juridic" (persoană juridică) */
  payee_type: z.enum(["fizic", "juridic"]).optional().nullable(),
  // Section 13
  attachments_present: z.boolean().optional(),
  attachments_note: z.string().max(2000).optional().nullable(),
  // VM1-03: currency MDL/EUR/USD only (RON removed).
  currency: z.enum(["MDL", "EUR", "USD"]).optional(),
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
  /** PARQA-022: structured before/after JSON for "edited" events (the timeline renders it). */
  diff?: string;
}) {
  await db.insert(parAudit).values({
    tenantId: params.tenantId,
    parId: params.parId,
    actorUserId: params.actorUserId,
    event: params.event,
    detail: params.detail ?? null,
    diff: params.diff ?? null,
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
        eventId: body.event_id ?? null,
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

// ─── POST /api/par/:id/duplicate — VF-103 ─────────────────────────────────────
// Anyone who can SEE a PAR can duplicate it into a fresh draft owned by themselves.
// Copies header fields + line items; NOT attachments/approvals/payment/dateNeeded. Payee fields
// are copied only if the user is allowed to see them (GDPR, same rule as GET /:id).
parRoutes.post("/:id/duplicate", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const sourceId = c.req.param("id");

  const source = await getPAR(sourceId, tenantId);
  if (!source) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const hasElevatedRole = roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  // Requestors can only see (hence duplicate) their own PARs.
  if (!hasElevatedRole && source.requestedByUserId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  const canSeePayee = source.requestedByUserId === user.id || hasElevatedRole;

  const requestNo = await generateRequestNo(tenantId);
  const [draft] = await db
    .insert(parRequests)
    .values({
      tenantId,
      requestNo,
      dateOfRequest: new Date(),
      requestedByUserId: user.id, // duplicator owns the copy
      requestorTitle: source.requestorTitle,
      departmentId: source.departmentId,
      dateNeeded: null, // not copied
      projectId: source.projectId,
      budgetCodeId: source.budgetCodeId,
      budgetCodeNote: source.budgetCodeNote,
      purpose: source.purpose,
      chargeTo: source.chargeTo,
      chargeBillingCode: source.chargeBillingCode,
      endUse: source.endUse,
      vendorId: canSeePayee ? source.vendorId : null,
      payeeName: canSeePayee ? source.payeeName : null,
      payeeIdnp: canSeePayee ? source.payeeIdnp : null,
      payeeIban: canSeePayee ? source.payeeIban : null,
      payeeBank: canSeePayee ? source.payeeBank : null,
      attachmentsPresent: false,
      currency: source.currency,
      totalEstimatedCents: 0,
      status: "draft",
    })
    .returning();

  // Copy line items.
  const sourceLines = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, sourceId), eq(parLineItems.tenantId, tenantId)))
    .orderBy(asc(parLineItems.position));

  if (sourceLines.length > 0) {
    await db.insert(parLineItems).values(
      sourceLines.map((l) => ({
        tenantId,
        parId: draft.id,
        position: l.position,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      }))
    );
  }

  const total = await recalcParTotal(draft.id, tenantId);

  await writeAudit({
    tenantId,
    parId: draft.id,
    actorUserId: user.id,
    event: "duplicated_from",
    detail: `Duplicated from ${source.requestNo} (${sourceId})`,
  });

  const [finalDraft] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, draft.id), eq(parRequests.tenantId, tenantId)));

  return c.json({ par: { ...finalDraft, totalEstimatedCents: total } }, 201);
});

// ─── VF-104: comments ─────────────────────────────────────────────────────────
// Comments live under /:id, so they're safe inside parRoutes (no mount-order conflict).

/** Can this user see (and thus comment on) the PAR? Same rule as GET /:id. */
async function canSeePAR(userId: string, tenantId: string, par: { requestedByUserId: string }): Promise<boolean> {
  const roles = await getUserPARRoles(userId, tenantId);
  const hasElevatedRole = roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  return hasElevatedRole || par.requestedByUserId === userId;
}

const commentSchema = z.object({ body: z.string().min(1).max(5000) });

/** GET /api/par/:id/comments — list comments (author name resolved). */
parRoutes.get("/:id/comments", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await canSeePAR(user.id, tenantId, par))) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      id: parComments.id,
      body: parComments.body,
      authorUserId: parComments.authorUserId,
      authorName: users.name,
      createdAt: parComments.createdAt,
    })
    .from(parComments)
    .leftJoin(users, eq(users.id, parComments.authorUserId))
    .where(and(eq(parComments.parId, parId), eq(parComments.tenantId, tenantId)))
    .orderBy(asc(parComments.createdAt));

  return c.json({ comments: rows });
});

/** POST /api/par/:id/comments — add a comment (any user who can see the PAR). */
parRoutes.post("/:id/comments", zValidator("json", commentSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const { body } = c.req.valid("json");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await canSeePAR(user.id, tenantId, par))) return c.json({ error: "not_found" }, 404);

  const [comment] = await db
    .insert(parComments)
    .values({ tenantId, parId, authorUserId: user.id, body })
    .returning();

  return c.json(
    { id: comment.id, body: comment.body, authorUserId: user.id, authorName: user.name, createdAt: comment.createdAt },
    201
  );
});

// ─── VF-501: quotes (RFQ) ─────────────────────────────────────────────────────
// Quotes attach to an `obtain_quotations` PAR. Add/delete only while the PAR is editable and by
// the author or a par_admin. Anyone who can see the PAR can list them.

const quoteSchema = z.object({
  vendor_id: z.string().uuid().optional().nullable(),
  vendor_name: z.string().max(300).optional().nullable(),
  total_cents: z.number().int().positive(),
  // VM1-03: currency MDL/EUR/USD only.
  currency: z.enum(["MDL", "EUR", "USD"]).optional(),
  valid_until: z.string().datetime({ offset: true }).or(z.string().date()).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  file_url: z.string().max(2000).optional().nullable(),
});

/** GET /api/par/:id/quotes — list quotes (anyone who can see the PAR). */
parRoutes.get("/:id/quotes", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await canSeePAR(user.id, tenantId, par))) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(parQuotes)
    .where(and(eq(parQuotes.parId, parId), eq(parQuotes.tenantId, tenantId)))
    .orderBy(asc(parQuotes.totalCents));
  return c.json({ quotes: rows });
});

/** POST /api/par/:id/quotes — add a quote (author/par_admin, editable PAR only). */
parRoutes.post("/:id/quotes", zValidator("json", quoteSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const body = c.req.valid("json");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(user.id, tenantId);
  const isAdmin = roles.includes("par_admin");
  if (par.requestedByUserId !== user.id && !isAdmin) {
    return c.json({ error: "forbidden: only the author can add quotes" }, 403);
  }
  if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
    return c.json({ error: `forbidden: PAR status '${par.status}' is not editable` }, 403);
  }

  // Resolve a vendor name: explicit name, or the registered vendor's name.
  let vendorName = body.vendor_name?.trim() || null;
  if (!vendorName && body.vendor_id) {
    const [v] = await db
      .select({ name: parVendors.name })
      .from(parVendors)
      .where(and(eq(parVendors.id, body.vendor_id), eq(parVendors.tenantId, tenantId)));
    vendorName = v?.name ?? null;
  }
  if (!vendorName) {
    return c.json({ error: "vendor_required", detail: "Indică un furnizor (din listă sau nume liber)." }, 400);
  }

  const [quote] = await db
    .insert(parQuotes)
    .values({
      tenantId,
      parId,
      vendorId: body.vendor_id ?? null,
      vendorName,
      totalCents: body.total_cents,
      currency: body.currency ?? par.currency ?? "MDL",
      validUntil: body.valid_until ? new Date(body.valid_until) : null,
      notes: body.notes ?? null,
      fileUrl: body.file_url ?? null,
      createdByUserId: user.id,
    })
    .returning();

  return c.json(quote, 201);
});

/** DELETE /api/par/:id/quotes/:quoteId — remove a quote (author/par_admin, editable PAR). */
parRoutes.delete("/:id/quotes/:quoteId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const quoteId = c.req.param("quoteId");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(user.id, tenantId);
  if (par.requestedByUserId !== user.id && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
    return c.json({ error: `forbidden: status '${par.status}' not editable` }, 403);
  }

  const [deleted] = await db
    .delete(parQuotes)
    .where(and(eq(parQuotes.id, quoteId), eq(parQuotes.parId, parId), eq(parQuotes.tenantId, tenantId)))
    .returning({ id: parQuotes.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ─── VF-502: select winning quote + justification ─────────────────────────────

const selectQuoteSchema = z.object({ reason: z.string().min(1).max(2000) });

/** POST /api/par/:id/quotes/:quoteId/select — mark the winning quote, copy its payee into the PAR. */
parRoutes.post("/:id/quotes/:quoteId/select", zValidator("json", selectQuoteSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const quoteId = c.req.param("quoteId");
  const { reason } = c.req.valid("json");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(user.id, tenantId);
  if (par.requestedByUserId !== user.id && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
    return c.json({ error: `forbidden: status '${par.status}' not editable` }, 403);
  }

  const [quote] = await db
    .select()
    .from(parQuotes)
    .where(and(eq(parQuotes.id, quoteId), eq(parQuotes.parId, parId), eq(parQuotes.tenantId, tenantId)));
  if (!quote) return c.json({ error: "not_found" }, 404);

  // Exactly one selected quote per PAR: clear the others, then mark this one.
  await db
    .update(parQuotes)
    .set({ selected: false, selectionReason: null })
    .where(and(eq(parQuotes.parId, parId), eq(parQuotes.tenantId, tenantId)));
  await db
    .update(parQuotes)
    .set({ selected: true, selectionReason: reason })
    .where(and(eq(parQuotes.id, quoteId), eq(parQuotes.tenantId, tenantId)));

  // Copy the winning quote's payee + amount into the PAR so it flows through the rest of the process.
  // Vendor snapshot respects what's available on the quote (registered vendor or free name).
  const payeeUpdate: Record<string, unknown> = {
    vendorId: quote.vendorId,
    payeeName: quote.vendorName,
    currency: quote.currency,
    updatedAt: new Date(),
  };
  if (quote.vendorId) {
    const [v] = await db
      .select({ idnp: parVendors.idnp, iban: parVendors.iban, bank: parVendors.bank })
      .from(parVendors)
      .where(and(eq(parVendors.id, quote.vendorId), eq(parVendors.tenantId, tenantId)));
    if (v) {
      payeeUpdate.payeeIdnp = v.idnp;
      payeeUpdate.payeeIban = v.iban;
      payeeUpdate.payeeBank = v.bank;
    }
  }
  await db
    .update(parRequests)
    .set(payeeUpdate)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  await writeAudit({
    tenantId,
    parId,
    actorUserId: user.id,
    event: "quote_selected",
    detail: `Ofertă selectată: ${quote.vendorName} (${quote.totalCents / 100} ${quote.currency}). Motiv: ${reason.slice(0, 200)}`,
  });

  return c.json({ ok: true, quoteId, selected: true });
});

// ─── GET /api/par — list ─────────────────────────────────────────────────────

parRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const roles = await getUserPARRoles(user.id, tenantId);

  // Query params
  const status = c.req.query("status");
  const purpose = c.req.query("purpose");
  const projectId = c.req.query("project_id");
  const eventId = c.req.query("event_id"); // VM1-04
  const q = c.req.query("q");
  // VF-105: date range (on dateOfRequest) + total range (cents)
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");
  const minTotal = c.req.query("min_total");
  const maxTotal = c.req.query("max_total");

  // Build conditions
  const conditions = [eq(parRequests.tenantId, tenantId)];

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
    conditions.push(eq(parRequests.purpose, purpose as typeof parPurposeValues[number]));
  }
  if (projectId) {
    conditions.push(eq(parRequests.projectId, projectId));
  }
  if (eventId) { // VM1-04
    conditions.push(eq(parRequests.eventId, eventId));
  }

  // VF-105: full-text-ish search across requestNo, payeeName, endUse, and line-item descriptions.
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    const lineItemMatch = sql`EXISTS (
      SELECT 1 FROM ${parLineItems} li
      WHERE li.par_id = ${parRequests.id} AND li.description ILIKE ${like}
    )`;
    const orClause = or(
      ilike(parRequests.requestNo, like),
      ilike(parRequests.payeeName, like),
      ilike(parRequests.endUse, like),
      lineItemMatch
    );
    if (orClause) conditions.push(orClause as typeof conditions[number]);
  }

  // VF-105: date range on dateOfRequest.
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) conditions.push(gte(parRequests.dateOfRequest, d));
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999); // inclusive end-of-day
      conditions.push(lte(parRequests.dateOfRequest, d));
    }
  }

  // VF-105: total range (cents).
  const minN = minTotal != null ? Number(minTotal) : NaN;
  const maxN = maxTotal != null ? Number(maxTotal) : NaN;
  if (Number.isFinite(minN)) conditions.push(gte(parRequests.totalEstimatedCents, Math.round(minN)));
  if (Number.isFinite(maxN)) conditions.push(lte(parRequests.totalEstimatedCents, Math.round(maxN)));

  const rows = await db
    .select()
    .from(parRequests)
    .where(and(...conditions))
    .orderBy(desc(parRequests.createdAt));

  // Get micro-purchase threshold for flag
  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  const result = rows.map((r) => ({
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

parRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  if (!UUID_RE.test(parId)) return c.json({ error: "not_found" }, 404);

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

  // PAR-109: body hash integrity check on display
  let bodyHashValid: boolean | null = null;
  if (par.bodyHash && par.status !== "draft" && par.status !== "changes_requested") {
    const bodyForHash = await buildBodyForHash(parId, tenantId);
    if (bodyForHash) {
      const integrityResult = verifyParBodyHash(bodyForHash, par.bodyHash);
      bodyHashValid = integrityResult.valid;
      if (!integrityResult.valid) {
        await writeAudit({
          tenantId,
          parId,
          actorUserId: user.id,
          event: "integrity_mismatch_display",
          detail: integrityResult.detail,
        });
      }
    }
  }

  // PAR-114-fix: resolve UUIDs → human-readable names for the PDF/print form.
  // The raw *Id columns are kept for the API; these *_name fields are display labels.
  const userIdsToResolve = [
    par.requestedByUserId,
    payment?.receivedByUserId ?? null,
    payment?.assignedToUserId ?? null,
  ].filter((v): v is string => !!v);

  const userRows = userIdsToResolve.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIdsToResolve)))
    : [];
  const userName = (id: string | null | undefined) =>
    (id && userRows.find((u) => u.id === id)?.name) || null;

  const [dept] = par.departmentId
    ? await db
        .select({ name: parDepartments.name })
        .from(parDepartments)
        .where(and(eq(parDepartments.tenantId, tenantId), eq(parDepartments.id, par.departmentId)))
    : [];

  const [proj] = par.projectId
    ? await db
        .select({ name: parProjects.name })
        .from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.id, par.projectId)))
    : [];

  const [bc] = par.budgetCodeId
    ? await db
        .select({ code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.id, par.budgetCodeId)))
    : [];

  const evId = (par as { eventId?: string | null }).eventId ?? null;
  const [evt] = evId
    ? await db
        .select({ name: parEvents.name })
        .from(parEvents)
        .where(and(eq(parEvents.tenantId, tenantId), eq(parEvents.id, evId)))
    : [];

  return c.json({
    ...parData,
    above_micro_threshold: par.totalEstimatedCents > threshold,
    line_items: lineItems,
    approvals,
    attachments,
    payment: payment ?? null,
    // Resolved display names (UUIDs stay in the *Id fields above)
    requestedByName: userName(par.requestedByUserId),
    departmentName: dept?.name ?? null,
    projectName: proj?.name ?? null,
    eventName: evt?.name ?? null,
    budgetCodeLabel: bc ? [bc.code, bc.name].filter(Boolean).join(" — ") : null,
    receivedByName: userName(payment?.receivedByUserId),
    assignedToName: userName(payment?.assignedToUserId),
    /** PAR-109: null = not applicable (draft/no hash); true = body untampered; false = INTEGRITY VIOLATION */
    body_hash_valid: bodyHashValid,
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
    if (body.event_id !== undefined) updateData.eventId = body.event_id;
    if (body.budget_code_id !== undefined)
      updateData.budgetCodeId = body.budget_code_id;
    if (body.budget_code_note !== undefined)
      updateData.budgetCodeNote = body.budget_code_note;
    if (body.purpose !== undefined) updateData.purpose = body.purpose;
    if (body.charge_to !== undefined) updateData.chargeTo = body.charge_to;
    if (body.charge_billing_code !== undefined)
      updateData.chargeBillingCode = body.charge_billing_code;
    if (body.end_use !== undefined) updateData.endUse = body.end_use;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.attachments_present !== undefined)
      updateData.attachmentsPresent = body.attachments_present;
    if (body.attachments_note !== undefined)
      updateData.attachmentsNote = body.attachments_note;

    // Inline payee fields (no vendor selected). The form always sends
    // vendor_id: null when entering payee manually, so the inline block must
    // run whenever no real vendor id is provided (null OR undefined). The
    // vendor snapshot below overrides these if a vendor_id was actually set.
    if (!body.vendor_id) {
      if (body.payee_name !== undefined) updateData.payeeName = body.payee_name;
      if (body.payee_idnp !== undefined) updateData.payeeIdnp = body.payee_idnp;
      if (body.payee_iban !== undefined) updateData.payeeIban = body.payee_iban;
      if (body.payee_bank !== undefined) updateData.payeeBank = body.payee_bank;
    }
    // Feature 1: payee_type is always accepted regardless of vendor_id
    if (body.payee_type !== undefined) updateData.payeeType = body.payee_type;

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

    // PARQA-022: build a structured before/after diff so par_audit.diff is actually populated (the
    // timeline renders it; production never wrote it before). Only genuinely-changed fields; payee
    // bank data is redacted so the audit log doesn't duplicate GDPR data.
    const REDACT = new Set(["payeeIban", "payeeIdnp"]);
    const parRec = par as unknown as Record<string, unknown>;
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
    const diffObj: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(updateData)) {
      if (key === "updatedAt") continue;
      const before = norm(parRec[key]);
      const after = norm(updateData[key]);
      if (before === after) continue;
      diffObj[key] = REDACT.has(key)
        ? { from: parRec[key] ? "***" : null, to: updateData[key] ? "***" : null }
        : { from: before, to: after };
    }

    const [updated] = await db
      .update(parRequests)
      .set(updateData)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    const changedFields = Object.keys(diffObj);
    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "edited",
      detail: `Updated fields: ${changedFields.join(", ") || "(fără schimbări)"}`,
      diff: changedFields.length ? JSON.stringify(diffObj) : undefined,
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

// ─── POST /api/par/:id/submit — PAR-107 real routing engine ─────────────────
// Replaces the PAR-105 stub. Validates completeness, resolves the DOA chain,
// blocks self-approval, computes body hash, creates par_approvals rows, and
// transitions the PAR to pending_approval.

parRoutes.post("/:id/submit", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);

  if (par.requestedByUserId !== user.id) {
    return c.json({ error: "forbidden: only the author can submit this PAR" }, 403);
  }
  if (!EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number])) {
    // 409 for already pending_approval (idempotency guard)
    if (par.status === "pending_approval") {
      return c.json({ error: "conflict: PAR is already pending approval" }, 409);
    }
    return c.json({ error: `PAR is not in a submittable status: ${par.status}` }, 400);
  }

  const result = await submitPAR({
    parId,
    tenantId,
    actorUserId: user.id,
    requestorTitleSnapshot: par.requestorTitle ?? null,
  });

  if (!result.ok) {
    if (result.code === "already_submitted") {
      return c.json({ error: result.message }, 409);
    }
    if (result.code === "validation_errors") {
      return c.json({ error: "validation_failed", errors: result.errors }, 400);
    }
    return c.json({ error: result.message ?? "submit_failed" }, 400);
  }

  // VF-202: non-blocking over-budget signal. If this PAR's budget code is now over its allocation,
  // tell the client so it can warn (the submit still succeeds — budgets are advisory, not gates).
  const overBudget = await computeOverBudget(tenantId, par.budgetCodeId);

  // VF-501/502: for `obtain_quotations`, advise the donor 3-bid rule + a chosen quote (non-blocking).
  let quotesBelowThree = false;
  let noQuoteSelected = false;
  if (par.purpose === "obtain_quotations") {
    const qRows = await db
      .select({ selected: parQuotes.selected })
      .from(parQuotes)
      .where(and(eq(parQuotes.parId, parId), eq(parQuotes.tenantId, tenantId)));
    quotesBelowThree = qRows.length < 3;
    // Only flag "no selection" when there ARE quotes but none is chosen.
    noQuoteSelected = qRows.length > 0 && !qRows.some((q) => q.selected);
  }

  return c.json({
    ...result.par,
    approval_steps: result.approvalSteps,
    over_budget: overBudget,
    quotes_below_three: quotesBelowThree,
    no_quote_selected: noQuoteSelected,
  });
});

/**
 * VF-202: returns { over: true, overByCents } if the budget code is over-allocated (committed +
 * paid > allocated), or null when there's no code / no allocation set. Advisory only.
 */
async function computeOverBudget(
  tenantId: string,
  budgetCodeId: string | null
): Promise<{ over: boolean; overByCents: number; allocatedCents: number; usedCents: number } | null> {
  if (!budgetCodeId) return null;
  const [code] = await db
    .select({ allocatedCents: parBudgetCodes.allocatedCents })
    .from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.id, budgetCodeId), eq(parBudgetCodes.tenantId, tenantId)));
  const allocatedCents = code?.allocatedCents ?? 0;
  if (allocatedCents <= 0) return null; // no allocation → nothing to exceed

  const [usedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${parRequests.totalEstimatedCents}), 0)` })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.budgetCodeId, budgetCodeId),
        inArray(parRequests.status, [
          "pending_approval", "approved", "in_finance", "reapproval_required", "changes_requested", "paid",
        ])
      )
    );
  const usedCents = Number(usedRow?.total ?? 0);
  return { over: usedCents > allocatedCents, overByCents: usedCents - allocatedCents, allocatedCents, usedCents };
}

// ─── GET /api/par/:id/dosar ─────────────────────────────────────────────────
// VM1-12: Combined dosar PDF — PAR form pages + supporting attachments + payment order.
// Uses pdf-lib via DYNAMIC import() only (never top-level — exceljs/PAR-port lesson).
// Document order: par_pdf → contract → act_of_receipt → quotation → invoice → payment_order → other.
// Non-PDF attachments (images, DOCX, XLSX) appear as separator pages only.
// Romanian diacritics are preserved via pdf-lib UTF-8 support.

const DOSAR_ORDER: string[] = [
  "par_pdf",
  "contract",
  "act_of_receipt",
  "quotation",
  "invoice",
  "payment_order",
  "other",
];

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    par_pdf: "Formularul PAR",
    contract: "Contract",
    act_of_receipt: "Act de recepție",
    quotation: "Ofertă / Deviz",
    invoice: "Factură",
    payment_order: "Ordin de plată",
    other: "Altele",
  };
  return map[kind] ?? kind;
}

parRoutes.get("/:id/dosar", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const par = await getPAR(parId, tenantId);
  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const hasAnyRole = roles.length > 0;
  if (!hasAnyRole && par.requestedByUserId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }

  // Fetch attachments sorted by our deterministic order
  const attachments = await db
    .select()
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  attachments.sort((a, b) => {
    const ai = DOSAR_ORDER.indexOf(a.kind ?? "other");
    const bi = DOSAR_ORDER.indexOf(b.kind ?? "other");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // ── VM3-02: data for the "Fișa aprobărilor" cover page (generated live at download) ──
  const sheetApprovalRows = await db
    .select()
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));
  const sheetUserIds = [
    ...new Set(
      [par.requestedByUserId, ...sheetApprovalRows.map((a) => a.approverUserId)].filter(
        (v): v is string => !!v
      )
    ),
  ];
  const sheetUserRows = sheetUserIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, sheetUserIds)))
    : [];
  const sheetUserName = (id: string | null) =>
    (id && sheetUserRows.find((u) => u.id === id)?.name) || null;
  const [sheetProj] = par.projectId
    ? await db
        .select({ name: parProjects.name })
        .from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.id, par.projectId)))
    : [];
  const sheetEvId = (par as { eventId?: string | null }).eventId ?? null;
  const [sheetEvt] = sheetEvId
    ? await db
        .select({ name: parEvents.name })
        .from(parEvents)
        .where(and(eq(parEvents.tenantId, tenantId), eq(parEvents.id, sheetEvId)))
    : [];
  const [sheetBc] = par.budgetCodeId
    ? await db
        .select({ code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.id, par.budgetCodeId)))
    : [];

  const sheetLines = buildApprovalSheetLines(
    {
      requestNo: par.requestNo,
      dateOfRequest: par.dateOfRequest,
      status: par.status,
      requestedByName: sheetUserName(par.requestedByUserId),
      payeeName: par.payeeName,
      payeeIdnp: par.payeeIdnp,
      payeeIban: par.payeeIban,
      payeeBank: par.payeeBank,
      currency: par.currency,
      totalEstimatedCents: par.totalEstimatedCents,
      totalMdlCents: (par as { totalMdlCents?: number | null }).totalMdlCents ?? null,
      projectName: sheetProj?.name ?? null,
      eventName: sheetEvt?.name ?? null,
      budgetCodeLabel: sheetBc ? [sheetBc.code, sheetBc.name].filter(Boolean).join(" — ") : null,
      endUse: par.endUse,
      approvedAt: par.approvedAt,
      paidAt: par.paidAt,
      approvals: sheetApprovalRows.map((a) => ({
        step: a.step,
        approverRoleLabel: a.approverRoleLabel,
        name: a.signatureName ?? sheetUserName(a.approverUserId),
        decision: a.decision,
        decidedAt: a.decidedAt,
        comment: a.comment,
      })),
    },
    new Date()
  );

  // ── Dynamic import of pdf-lib (NEVER top-level — exceljs outage lesson) ──
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const dosar = await PDFDocument.create();
  const helvetica = await dosar.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await dosar.embedFont(StandardFonts.HelveticaBold);

  // Helper: add a separator page with centred title.
  // Titles/subtitles go through winAnsiSafe(): the standard Helvetica font THROWS on ă/ș/ț
  // (WinAnsi/cp1252), which used to 500 the whole dosar for kinds like "Factură" /
  // "Ordin de plată" / "Act de recepție". Regression: par-finance-queue.routes.test.ts.
  const addSeparator = async (title: string, subtitle?: string) => {
    const page = dosar.addPage([595, 842]); // A4 portrait in points
    const { width, height } = page.getSize();
    page.drawText(winAnsiSafe(title), {
      x: 50,
      y: height / 2 + 20,
      size: 18,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: width - 100,
    });
    if (subtitle) {
      page.drawText(winAnsiSafe(subtitle), {
        x: 50,
        y: height / 2 - 10,
        size: 12,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
        maxWidth: width - 100,
      });
    }
  };

  // ── VM3-02: draw the approval sheet as the FIRST page(s) of the dosar ──
  {
    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 50;
    const maxTextWidth = pageWidth - marginX * 2;
    let page = dosar.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 60;

    // Manual word-wrap: measure with the actual font so wrapped lines advance the cursor.
    const wrapLine = (line: SheetLine): string[] => {
      const size = line.size ?? 10;
      const font = line.bold ? helveticaBold : helvetica;
      const words = line.text.split(" ");
      const rows: string[] = [];
      let current = "";
      for (const w of words) {
        const candidate = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) <= maxTextWidth) {
          current = candidate;
        } else {
          if (current) rows.push(current);
          current = w;
        }
      }
      if (current) rows.push(current);
      return rows.length > 0 ? rows : [""];
    };

    for (const line of sheetLines) {
      const size = line.size ?? 10;
      const font = line.bold ? helveticaBold : helvetica;
      if (line.gapBefore) y -= line.gapBefore;
      for (const row of wrapLine(line)) {
        if (y < 60) {
          page = dosar.addPage([pageWidth, pageHeight]);
          y = pageHeight - 60;
        }
        page.drawText(row, {
          x: marginX,
          y,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= size + 5;
      }
    }
  }

  // If no attachments at all, add an informational page (the approval sheet above still ships)
  if (attachments.length === 0) {
    await addSeparator(
      `Dosar PAR — ${par.requestNo ?? "fără număr"}`,
      "Nu există atașamente. Generați mai întâi PDF-ul formularului PAR."
    );
    const pdfBytes = await dosar.save();
    c.header("Content-Type", "application/pdf");
    const fileSafe = (par.requestNo ?? `PAR-${parId.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
    c.header("Content-Disposition", `attachment; filename="Dosar_PAR_${fileSafe}.pdf"`);
    return c.body(Buffer.from(pdfBytes));
  }

  let currentKind: string | null = null;

  for (const att of attachments) {
    const kind = att.kind ?? "other";

    // Add a section separator when the kind changes
    if (kind !== currentKind) {
      currentKind = kind;
      await addSeparator(kindLabel(kind));
    }

    const fileUrl = att.fileUrl ?? "";
    const fileName = att.fileName ?? "fișier";
    const isPdf =
      fileName.toLowerCase().endsWith(".pdf") ||
      fileUrl.startsWith("data:application/pdf") ||
      fileUrl.startsWith("data:application/x-pdf");

    if (!isPdf) {
      // Non-PDF: add note page
      const ext = fileName.split(".").pop()?.toUpperCase() ?? "FIȘIER";
      await addSeparator(
        `Anexă: ${fileName}`,
        `(Tipul de fișier ${ext} nu poate fi inclus în PDF — descărcați separat)`
      );
      continue;
    }

    // PDF: embed pages
    try {
      let pdfBytes: Uint8Array;
      if (fileUrl.startsWith("data:")) {
        // data URI — strip prefix
        const base64 = fileUrl.split(",")[1];
        if (!base64) throw new Error("empty data URI");
        const binary = atob(base64);
        pdfBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i);
      } else {
        // External URL — fetch
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        pdfBytes = new Uint8Array(await resp.arrayBuffer());
      }
      const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = await dosar.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const pg of pages) dosar.addPage(pg);
    } catch (err) {
      // If embedding fails, add error note page
      await addSeparator(
        `Anexă: ${fileName}`,
        `(PDF corupt sau inaccesibil — descărcați separat. Detaliu: ${err instanceof Error ? err.message : "necunoscut"})`
      );
    }
  }

  const pdfBytes = await dosar.save();
  const fileSafe = (par.requestNo ?? `PAR-${parId.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `attachment; filename="Dosar_PAR_${fileSafe}.pdf"`);
  return c.body(Buffer.from(pdfBytes));
});

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
