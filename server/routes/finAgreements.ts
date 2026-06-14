/**
 * AGREEMENT-002: FinDesk commercial agreements API
 *
 * GET    /api/fin/agreements                              → list agreements
 * GET    /api/fin/agreements/:id                          → single or 404
 * POST   /api/fin/agreements                              → create agreement
 * PATCH  /api/fin/agreements/:id                          → partial update
 * DELETE /api/fin/agreements/:id                          → soft delete (status → cancelled)
 * GET    /api/fin/agreements/:id/services                 → list services
 * POST   /api/fin/agreements/:id/services                 → add service (auto next_bill_date)
 * PATCH  /api/fin/agreements/:id/services/:serviceId      → update service
 * DELETE /api/fin/agreements/:id/services/:serviceId      → hard delete service
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finAgreements, finAgreementServices } from "../db/schema/finAgreements";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finAgreementsRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finAgreementsRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const createAgreementSchema = z.object({
  partyId: z.string().uuid("ID partener trebuie să fie UUID valid").optional().nullable(),
  title: z.string().min(1, "Titlul contractului este obligatoriu").max(500),
  status: z.enum(["draft", "active", "paused", "cancelled"]).optional().default("draft"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD").optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD").optional().nullable(),
  currency: z.string().length(3, "Codul valutei trebuie să fie ISO 4217 (3 litere)").optional().default("MDL"),
  notes: z.string().max(2000).optional().nullable(),
});

const updateAgreementSchema = createAgreementSchema.partial();

const createServiceSchema = z.object({
  name: z.string().min(1, "Denumirea serviciului este obligatorie").max(500),
  description: z.string().max(2000).optional().nullable(),
  billingType: z.enum(["recurring", "one_time"]),
  unitPriceCents: z.number().int().min(0, "Prețul unitar nu poate fi negativ"),
  quantity: z.number().int().min(1, "Cantitatea minimă este 1").optional().default(1),
  vatPct: z.number().int().min(0).max(100, "TVA trebuie să fie între 0 și 100").optional().default(0),
  recurrencePeriod: z.enum(["monthly", "quarterly", "yearly"]).optional().nullable(),
  nextBillDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  isActive: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  if (data.billingType === "recurring" && !data.recurrencePeriod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "recurrencePeriod este obligatoriu pentru servicii recurente",
      path: ["recurrencePeriod"],
    });
  }
});

const updateServiceSchema = createServiceSchema.partial();

// ─── Helper: compute next_bill_date ───────────────────────────────────────────

/**
 * Computes the next bill date for a recurring service.
 * If agreement.startDate is in the future, that becomes next_bill_date.
 * Otherwise, advances one period from today.
 */
function computeNextBillDate(
  recurrencePeriod: "monthly" | "quarterly" | "yearly",
  agreementStartDate: string | null
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = agreementStartDate ? new Date(agreementStartDate) : today;
  start.setHours(0, 0, 0, 0);

  // If start is in the future, use it directly
  if (start > today) {
    return agreementStartDate!;
  }

  // Advance one period from today
  const next = new Date(today);
  if (recurrencePeriod === "monthly") {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  } else if (recurrencePeriod === "quarterly") {
    next.setMonth(next.getMonth() + 3);
    next.setDate(1);
  } else {
    // yearly
    next.setFullYear(next.getFullYear() + 1);
    next.setDate(1);
    next.setMonth(0); // January 1st of next year
  }

  return next.toISOString().split("T")[0];
}

// ─── Services: list (specific path BEFORE /:id) ───────────────────────────────

/**
 * GET /api/fin/agreements/:id/services
 * List all services for an agreement.
 * NOTE: This must be registered BEFORE the generic GET /:id handler
 * to avoid Hono matching "services" as the :id param.
 */
finAgreementsRoutes.get("/:id/services", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify agreement belongs to tenant
  const agreement = await db
    .select({ id: finAgreements.id, startDate: finAgreements.startDate })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (agreement.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const services = await db
    .select()
    .from(finAgreementServices)
    .where(eq(finAgreementServices.agreementId, id));

  return c.json({ data: services });
});

// ─── Services: add ────────────────────────────────────────────────────────────

finAgreementsRoutes.post("/:id/services", zValidator("json", createServiceSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Verify agreement belongs to tenant
  const [agreement] = await db
    .select({ id: finAgreements.id, startDate: finAgreements.startDate })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (!agreement) {
    return c.json({ error: "not_found" }, 404);
  }

  // Compute next_bill_date for recurring services
  let nextBillDate: string | null = body.nextBillDate ?? null;
  if (body.billingType === "recurring" && body.recurrencePeriod && !nextBillDate) {
    nextBillDate = computeNextBillDate(body.recurrencePeriod, agreement.startDate);
  }

  const [created] = await db
    .insert(finAgreementServices)
    .values({
      agreementId: id,
      name: body.name,
      description: body.description ?? null,
      billingType: body.billingType,
      unitPriceCents: body.unitPriceCents,
      quantity: body.quantity ?? 1,
      vatPct: body.vatPct ?? 0,
      recurrencePeriod: body.recurrencePeriod ?? null,
      nextBillDate,
      isActive: body.isActive ?? true,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── Services: update ─────────────────────────────────────────────────────────

finAgreementsRoutes.patch("/:id/services/:serviceId", zValidator("json", updateServiceSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const serviceId = c.req.param("serviceId");
  const body = c.req.valid("json");

  // Verify agreement belongs to tenant
  const [agreement] = await db
    .select({ id: finAgreements.id, startDate: finAgreements.startDate })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (!agreement) {
    return c.json({ error: "not_found" }, 404);
  }

  const existingSvc = await db
    .select({ id: finAgreementServices.id })
    .from(finAgreementServices)
    .where(and(eq(finAgreementServices.id, serviceId), eq(finAgreementServices.agreementId, id)))
    .limit(1);

  if (existingSvc.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const updateData: Partial<typeof finAgreementServices.$inferInsert> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description ?? null;
  if (body.billingType !== undefined) updateData.billingType = body.billingType;
  if (body.unitPriceCents !== undefined) updateData.unitPriceCents = body.unitPriceCents;
  if (body.quantity !== undefined) updateData.quantity = body.quantity ?? 1;
  if (body.vatPct !== undefined) updateData.vatPct = body.vatPct ?? 0;
  if (body.recurrencePeriod !== undefined) updateData.recurrencePeriod = body.recurrencePeriod ?? null;
  if (body.nextBillDate !== undefined) updateData.nextBillDate = body.nextBillDate ?? null;
  if (body.isActive !== undefined) updateData.isActive = body.isActive ?? true;
  updateData.updatedAt = new Date();

  if (Object.keys(updateData).length <= 1) {
    return c.json({ error: "no_fields_to_update" }, 422);
  }

  const [updated] = await db
    .update(finAgreementServices)
    .set(updateData)
    .where(and(eq(finAgreementServices.id, serviceId), eq(finAgreementServices.agreementId, id)))
    .returning();

  return c.json({ data: updated });
});

// ─── Services: delete ─────────────────────────────────────────────────────────

finAgreementsRoutes.delete("/:id/services/:serviceId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const serviceId = c.req.param("serviceId");

  // Verify agreement belongs to tenant
  const agreement = await db
    .select({ id: finAgreements.id })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (agreement.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const existing = await db
    .select({ id: finAgreementServices.id })
    .from(finAgreementServices)
    .where(and(eq(finAgreementServices.id, serviceId), eq(finAgreementServices.agreementId, id)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  await db.delete(finAgreementServices).where(eq(finAgreementServices.id, serviceId));

  return c.json({ success: true });
});

// ─── List agreements ──────────────────────────────────────────────────────────

/**
 * GET /api/fin/agreements
 * Query params: status, partyId, search, limit (default 50), offset (default 0)
 */
finAgreementsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { status, partyId, search, limit: limitParam, offset: offsetParam } = c.req.query();

  const limit = Math.min(parseInt(limitParam ?? "50", 10) || 50, 200);
  const offset = parseInt(offsetParam ?? "0", 10) || 0;

  const conditions = [eq(finAgreements.tenantId, user.tenantId)];

  if (status && ["draft", "active", "paused", "cancelled"].includes(status)) {
    conditions.push(eq(finAgreements.status, status as "draft" | "active" | "paused" | "cancelled"));
  }

  if (partyId) {
    conditions.push(eq(finAgreements.partyId, partyId));
  }

  if (search) {
    conditions.push(ilike(finAgreements.title, `%${search}%`));
  }

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(finAgreements).where(where).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(finAgreements).where(where),
  ]);

  return c.json({ data: rows, total: countResult[0]?.count ?? 0 });
});

// ─── Get single agreement ─────────────────────────────────────────────────────

finAgreementsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ data: rows[0] });
});

// ─── Create agreement ─────────────────────────────────────────────────────────

finAgreementsRoutes.post("/", zValidator("json", createAgreementSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [created] = await db
    .insert(finAgreements)
    .values({
      tenantId: user.tenantId,
      partyId: body.partyId ?? null,
      title: body.title,
      status: body.status ?? "draft",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      currency: body.currency ?? "MDL",
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── Partial update ───────────────────────────────────────────────────────────

finAgreementsRoutes.patch("/:id", zValidator("json", updateAgreementSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db
    .select({ id: finAgreements.id })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const updateData: Partial<typeof finAgreements.$inferInsert> = {};
  if (body.partyId !== undefined) updateData.partyId = body.partyId ?? null;
  if (body.title !== undefined) updateData.title = body.title;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.startDate !== undefined) updateData.startDate = body.startDate ?? null;
  if (body.endDate !== undefined) updateData.endDate = body.endDate ?? null;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 422);
  }

  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(finAgreements)
    .set(updateData)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .returning();

  return c.json({ data: updated });
});

// ─── Soft delete (cancel) ─────────────────────────────────────────────────────

finAgreementsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db
    .select({ id: finAgreements.id })
    .from(finAgreements)
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  await db
    .update(finAgreements)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(finAgreements.id, id), eq(finAgreements.tenantId, user.tenantId)));

  return c.json({ success: true });
});
