/**
 * REGISTRY-002: FinDesk fiscal registry API routes
 *
 * GET    /api/fin/registry/tax-rates               → list tax rates (filterable by country, kind, date)
 * GET    /api/fin/registry/tax-rates/:id            → single tax rate or 404
 * POST   /api/fin/registry/tax-rates               → create tax rate (owner/admin only)
 * GET    /api/fin/registry/chart-of-accounts        → list chart-of-accounts entries (filterable by country, tenantId)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../db/client";
import { finTaxRates, finChartOfAccounts } from "../db/schema/finRegistry";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finRegistryRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finRegistryRoutes.use("/*", requireAuth);

// ─── Tax Rates ────────────────────────────────────────────────────────────────

/**
 * GET /api/fin/registry/tax-rates
 * Query params:
 *   country  — ISO 3166-1 alpha-2 (e.g. "MD", "RO")
 *   kind     — "vat" | "income_tax" | "social_contribution" | "dividend_tax" | "other"
 *   date     — ISO date string "YYYY-MM-DD" — if provided, returns only rates active on that date
 *   tenantId — filter by tenantId (optional); if omitted returns both global + tenant rates
 */
finRegistryRoutes.get("/tax-rates", async (c) => {
  const { country, kind, date, tenantId: tenantIdParam } = c.req.query();
  const user = c.get("user");

  const conditions = [];

  if (country) {
    conditions.push(eq(finTaxRates.country, country.toUpperCase()));
  }

  if (kind) {
    conditions.push(eq(finTaxRates.kind, kind as typeof finTaxRates.kind._.data));
  }

  if (date) {
    // Rates where effectiveFrom <= date AND (effectiveTo IS NULL OR effectiveTo >= date)
    conditions.push(lte(finTaxRates.effectiveFrom, date));
    conditions.push(
      or(isNull(finTaxRates.effectiveTo), lte(date, finTaxRates.effectiveTo as never))
    );
  }

  // Scope: global rates (tenantId IS NULL) + current tenant's rates
  const resolvedTenantId = tenantIdParam ?? user.tenantId;
  conditions.push(
    or(isNull(finTaxRates.tenantId), eq(finTaxRates.tenantId, resolvedTenantId))
  );

  const rows = await db
    .select()
    .from(finTaxRates)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({ data: rows });
});

/**
 * GET /api/fin/registry/tax-rates/:id
 */
finRegistryRoutes.get("/tax-rates/:id", async (c) => {
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finTaxRates)
    .where(eq(finTaxRates.id, id))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ data: rows[0] });
});

const createTaxRateSchema = z.object({
  tenantId: z.string().uuid().optional().nullable(),
  country: z.string().length(2),
  kind: z.enum(["vat", "income_tax", "social_contribution", "dividend_tax", "other"]),
  name: z.string().min(1).max(200),
  ratePct: z.string().regex(/^\d+(\.\d{1,4})?$/, "Must be a decimal with up to 4 decimal places"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  effectiveTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .optional()
    .nullable(),
  isDefault: z.boolean().optional().default(false),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * POST /api/fin/registry/tax-rates
 * Requires role: owner or admin
 */
finRegistryRoutes.post("/tax-rates", zValidator("json", createTaxRateSchema), async (c) => {
  const user = c.get("user");

  // Role guard: only owner or admin may add rates
  if (user.role !== "owner" && user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = c.req.valid("json");

  const [created] = await db
    .insert(finTaxRates)
    .values({
      tenantId: body.tenantId ?? user.tenantId,
      country: body.country.toUpperCase(),
      kind: body.kind,
      name: body.name,
      ratePct: body.ratePct,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
      isDefault: body.isDefault ?? false,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── Chart of Accounts ────────────────────────────────────────────────────────

/**
 * GET /api/fin/registry/chart-of-accounts
 * Query params:
 *   country  — ISO 3166-1 alpha-2
 *   tenantId — if omitted, returns global + tenant accounts
 */
finRegistryRoutes.get("/chart-of-accounts", async (c) => {
  const { country, tenantId: tenantIdParam } = c.req.query();
  const user = c.get("user");

  const conditions = [];

  if (country) {
    conditions.push(eq(finChartOfAccounts.country, country.toUpperCase()));
  }

  // Scope: global accounts (tenantId IS NULL) + current tenant's accounts
  const resolvedTenantId = tenantIdParam ?? user.tenantId;
  conditions.push(
    or(isNull(finChartOfAccounts.tenantId), eq(finChartOfAccounts.tenantId, resolvedTenantId))
  );

  const rows = await db
    .select()
    .from(finChartOfAccounts)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({ data: rows });
});
