/**
 * CORE-003: FinDesk org profile + invoice series API
 * CORE: backlog/fin/FIN-CORE.md §2 (rules #1, #9)
 * Mounted in server/app.ts: app.route("/api/fin", finOrgRoutes)
 *
 * Routes:
 *   GET    /api/fin/org                     → profil fiscal al tenant-ului
 *   PATCH  /api/fin/org                     → actualizare profil (accountant+)
 *   GET    /api/fin/series                  → listare serii de facturare
 *   POST   /api/fin/series                  → creare serie nouă
 *   PATCH  /api/fin/series/:id              → actualizare serie
 *   DELETE /api/fin/series/:id              → ștergere serie (nu dacă e default)
 *   POST   /api/fin/series/:id/next         → alocare număr următor ATOMIC
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finOrgProfile, finInvoiceSeries } from "../db/schema/finCore";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireFinRole } from "../middleware/requireFinRole";

export const finOrgRoutes = new Hono<{ Variables: AuthVariables }>();
finOrgRoutes.use("*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const orgPatchSchema = z.object({
  legalName: z.string().min(2).max(200).optional(),
  idno: z
    .string()
    .regex(/^\d{13}$|^[0-9A-Z]{2,10}$/, "IDNO invalid: 13 cifre (MD) sau CUI 2-10 caractere (RO)")
    .optional()
    .nullable(),
  country: z.enum(["MD", "RO"]).optional(),
  vatRegime: z.enum(["payer", "non_payer"]).optional(),
  vatNumber: z.string().max(30).optional().nullable(),
  baseCurrency: z.string().length(3).optional(),
  address: z.string().max(500).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  fiscalYearStart: z.number().int().min(1).max(12).optional(),
});

const seriesCreateSchema = z.object({
  prefix: z.string().min(1).max(50),
  padWidth: z.number().int().min(1).max(10).default(4),
  docType: z.enum(["invoice", "proforma", "receipt"]).default("invoice"),
  isDefault: z.boolean().default(false),
});

const seriesPatchSchema = z.object({
  prefix: z.string().min(1).max(50).optional(),
  padWidth: z.number().int().min(1).max(10).optional(),
  docType: z.enum(["invoice", "proforma", "receipt"]).optional(),
  isDefault: z.boolean().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeriesNumber(prefix: string, num: number, padWidth: number): string {
  return `${prefix}${String(num).padStart(padWidth, "0")}`;
}

async function enforceDefaultConstraint(
  tenantId: string,
  docType: string,
  newDefaultId: string
): Promise<void> {
  await db
    .update(finInvoiceSeries)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(finInvoiceSeries.tenantId, tenantId),
        eq(finInvoiceSeries.docType, docType as "invoice" | "proforma" | "receipt"),
        eq(finInvoiceSeries.isDefault, true),
        ne(finInvoiceSeries.id, newDefaultId)
      )
    );
}

// ─── /api/fin/org ─────────────────────────────────────────────────────────────

finOrgRoutes.get("/org", requireFinRole("viewer"), async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(finOrgProfile)
    .where(eq(finOrgProfile.tenantId, user.tenantId))
    .limit(1);

  return c.json({ profile: rows[0] ?? null });
});

finOrgRoutes.patch(
  "/org",
  requireFinRole("accountant"),
  zValidator("json", orgPatchSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // MD-specific IDNO validation
    if (body.idno && body.country === "MD" && !/^\d{13}$/.test(body.idno)) {
      return c.json(
        { error: "idno_invalid", detail: "IDNO Moldova trebuie să fie exact 13 cifre" },
        400
      );
    }

    const existing = await db
      .select({ id: finOrgProfile.id })
      .from(finOrgProfile)
      .where(eq(finOrgProfile.tenantId, user.tenantId))
      .limit(1);

    if (existing.length === 0) {
      const legalName = body.legalName ?? "Firmă nouă";
      const [profile] = await db
        .insert(finOrgProfile)
        .values({ tenantId: user.tenantId, legalName, ...body })
        .returning();
      return c.json({ profile }, 201);
    }

    const [profile] = await db
      .update(finOrgProfile)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(finOrgProfile.tenantId, user.tenantId))
      .returning();

    return c.json({ profile });
  }
);

// ─── /api/fin/series ──────────────────────────────────────────────────────────

finOrgRoutes.get("/series", requireFinRole("viewer"), async (c) => {
  const user = c.get("user");
  const series = await db
    .select()
    .from(finInvoiceSeries)
    .where(eq(finInvoiceSeries.tenantId, user.tenantId));

  return c.json({ series });
});

finOrgRoutes.post(
  "/series",
  requireFinRole("accountant"),
  zValidator("json", seriesCreateSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const [serie] = await db
      .insert(finInvoiceSeries)
      .values({
        tenantId: user.tenantId,
        prefix: body.prefix,
        padWidth: body.padWidth,
        docType: body.docType,
        isDefault: body.isDefault,
        nextNumber: 1,
      })
      .returning();

    if (body.isDefault) {
      await enforceDefaultConstraint(user.tenantId, body.docType, serie.id);
    }

    return c.json({ serie }, 201);
  }
);

finOrgRoutes.patch(
  "/series/:id",
  requireFinRole("accountant"),
  zValidator("json", seriesPatchSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const existing = await db
      .select()
      .from(finInvoiceSeries)
      .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "series_not_found" }, 404);
    }

    const [serie] = await db
      .update(finInvoiceSeries)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)))
      .returning();

    const effectiveDocType = body.docType ?? existing[0].docType;
    if (body.isDefault === true) {
      await enforceDefaultConstraint(user.tenantId, effectiveDocType, id);
    }

    return c.json({ serie });
  }
);

finOrgRoutes.delete("/series/:id", requireFinRole("accountant"), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(finInvoiceSeries)
    .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "series_not_found" }, 404);
  }

  if (existing[0].isDefault) {
    return c.json(
      { error: "cannot_delete_default_series", detail: "Demote seria ca non-default mai întâi" },
      400
    );
  }

  await db
    .delete(finInvoiceSeries)
    .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)));

  return c.json({ ok: true });
});

/**
 * POST /api/fin/series/:id/next — atomic number allocation.
 * UPDATE next_number = next_number + 1 RETURNING new value,
 * allocated = new - 1. No gaps or duplicates under concurrency.
 * CORE rule #9.
 */
finOrgRoutes.post("/series/:id/next", requireFinRole("viewer"), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const existing = await db
    .select({
      id: finInvoiceSeries.id,
      prefix: finInvoiceSeries.prefix,
      padWidth: finInvoiceSeries.padWidth,
    })
    .from(finInvoiceSeries)
    .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "series_not_found" }, 404);
  }

  const rows = await db
    .update(finInvoiceSeries)
    .set({ nextNumber: sql`${finInvoiceSeries.nextNumber} + 1`, updatedAt: new Date() })
    .where(and(eq(finInvoiceSeries.id, id), eq(finInvoiceSeries.tenantId, user.tenantId)))
    .returning({ nextNumber: finInvoiceSeries.nextNumber });

  const allocated = rows[0].nextNumber - 1;
  const serie = existing[0];
  const formatted = formatSeriesNumber(serie.prefix, allocated, serie.padWidth);

  return c.json({ number: allocated, formatted }, 200);
});
