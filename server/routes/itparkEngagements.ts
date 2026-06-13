/**
 * ITPARK-101: Engagement (Dosar de verificare) CRUD
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 * Mounted in server/app.ts: app.route("/api/itpark/engagements", itparkEngagementsRoutes)
 *
 * Routes:
 *   GET    /api/itpark/engagements         → lista dosarelor (scoped pe tenant)
 *   POST   /api/itpark/engagements         → creare dosar nou (accountant)
 *   GET    /api/itpark/engagements/:id     → detaliu dosar (viewer+)
 *   PUT    /api/itpark/engagements/:id     → editare dosar (accountant)
 *   DELETE /api/itpark/engagements/:id     → ștergere dosar (accountant)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { itparkEngagements } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireItparkRole } from "../lib/itparkAuth";

export const itparkEngagementsRoutes = new Hono<{ Variables: AuthVariables }>();
itparkEngagementsRoutes.use("*", requireAuth);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const engagementWriteSchema = z.object({
  residentName: z.string().min(1).max(255),
  idno: z.string().regex(/^\d{7,13}$/, "IDNO trebuie să conțină 7–13 cifre"),
  mitpContractNo: z.string().max(50).nullable().optional(),
  mitpContractDate: z.string().date().nullable().optional(), // ISO "YYYY-MM-DD"
  legalAddress: z.string().nullable().optional(),
  subdivisionAddresses: z.string().nullable().optional(),
  vatPayer: z.boolean().default(false),
  periodStart: z.string().date(),   // "YYYY-MM-DD"
  periodEnd: z.string().date(),     // "YYYY-MM-DD"
  reportingYear: z.number().int().min(2000).max(2100),
  auditFirmName: z.string().max(255).nullable().optional(),
  status: z.enum(["draft", "in_progress", "ready", "exported"]).default("draft"),
  subcontractorCostsCents: z.number().int().min(0).default(0),
  subcontractorCostsPct: z.string().nullable().optional(),
  totalSalesCents: z.number().int().min(0).nullable().optional(),
  adjustedRevenueCents: z.number().int().min(0).default(0),
  employeeInfoProcedure: z.string().nullable().optional(),
}).refine((d) => d.periodStart <= d.periodEnd, {
  message: "periodStart trebuie să fie ≤ periodEnd",
  path: ["periodStart"],
}).refine((d) => {
  const endYear = new Date(d.periodEnd).getFullYear();
  return d.reportingYear === endYear;
}, {
  message: "reportingYear trebuie să coincidă cu anul din periodEnd",
  path: ["reportingYear"],
});

// ─── GET /  — lista dosarelor ─────────────────────────────────────────────────

itparkEngagementsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select()
    .from(itparkEngagements)
    .where(eq(itparkEngagements.tenantId, user.tenantId))
    .orderBy(desc(itparkEngagements.reportingYear), itparkEngagements.residentName);

  return c.json({ engagements: rows });
});

// ─── POST / — creare dosar ────────────────────────────────────────────────────

itparkEngagementsRoutes.post(
  "/",
  zValidator("json", engagementWriteSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const body = c.req.valid("json");

    const [created] = await db
      .insert(itparkEngagements)
      .values({
        tenantId: user.tenantId,
        residentName: body.residentName,
        idno: body.idno,
        mitpContractNo: body.mitpContractNo ?? null,
        mitpContractDate: body.mitpContractDate ?? null,
        legalAddress: body.legalAddress ?? null,
        subdivisionAddresses: body.subdivisionAddresses ?? null,
        vatPayer: body.vatPayer,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        reportingYear: body.reportingYear,
        auditFirmName: body.auditFirmName ?? null,
        status: body.status,
        subcontractorCostsCents: body.subcontractorCostsCents,
        subcontractorCostsPct: body.subcontractorCostsPct ?? null,
        totalSalesCents: body.totalSalesCents ?? null,
        adjustedRevenueCents: body.adjustedRevenueCents,
        employeeInfoProcedure: body.employeeInfoProcedure ?? null,
      })
      .returning();

    return c.json({ engagement: created }, 201);
  }
);

// ─── GET /:id — detaliu dosar ─────────────────────────────────────────────────

itparkEngagementsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, id),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });

  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json({ engagement: row });
});

// ─── PUT /:id — editare dosar ─────────────────────────────────────────────────

itparkEngagementsRoutes.put(
  "/:id",
  zValidator("json", engagementWriteSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // Verifică că dosarul aparține tenantului
    const existing = await db.query.itparkEngagements.findFirst({
      where: and(
        eq(itparkEngagements.id, id),
        eq(itparkEngagements.tenantId, user.tenantId)
      ),
    });
    if (!existing) return c.json({ error: "not_found" }, 404);

    const [updated] = await db
      .update(itparkEngagements)
      .set({
        residentName: body.residentName,
        idno: body.idno,
        mitpContractNo: body.mitpContractNo ?? null,
        mitpContractDate: body.mitpContractDate ?? null,
        legalAddress: body.legalAddress ?? null,
        subdivisionAddresses: body.subdivisionAddresses ?? null,
        vatPayer: body.vatPayer,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        reportingYear: body.reportingYear,
        auditFirmName: body.auditFirmName ?? null,
        status: body.status,
        subcontractorCostsCents: body.subcontractorCostsCents,
        subcontractorCostsPct: body.subcontractorCostsPct ?? null,
        totalSalesCents: body.totalSalesCents ?? null,
        adjustedRevenueCents: body.adjustedRevenueCents,
        employeeInfoProcedure: body.employeeInfoProcedure ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(itparkEngagements.id, id),
          eq(itparkEngagements.tenantId, user.tenantId)
        )
      )
      .returning();

    return c.json({ engagement: updated });
  }
);

// ─── DELETE /:id — ștergere dosar ────────────────────────────────────────────

itparkEngagementsRoutes.delete("/:id", async (c) => {
  const deny = await requireItparkRole("accountant", c);
  if (deny) return deny;

  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, id),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .delete(itparkEngagements)
    .where(
      and(
        eq(itparkEngagements.id, id),
        eq(itparkEngagements.tenantId, user.tenantId)
      )
    );

  return c.json({ ok: true });
});
