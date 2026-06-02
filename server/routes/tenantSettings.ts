/**
 * PAY-001: Tenant settings API
 * GET  /api/settings/tenant  — returns current tenant settings
 * PATCH /api/settings/tenant — updates configurable settings (invoice_prefix, etc.)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const tenantSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

tenantSettingsRoutes.use("*", requireAuth);

const updateSettingsSchema = z.object({
  invoicePrefix: z.string().min(1).max(20).optional(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  timezone: z.string().max(60).optional(),
});

tenantSettingsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [t] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      timezone: tenants.timezone,
      invoicePrefix: tenants.invoicePrefix,
      iban: tenants.iban,
      bic: tenants.bic,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!t) return c.json({ error: "not_found" }, 404);
  return c.json(t);
});

tenantSettingsRoutes.patch("/", zValidator("json", updateSettingsSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.invoicePrefix !== undefined) patch.invoicePrefix = body.invoicePrefix;
  if (body.iban !== undefined) patch.iban = body.iban ?? null;
  if (body.bic !== undefined) patch.bic = body.bic ?? null;
  if (body.timezone !== undefined) patch.timezone = body.timezone;

  const [updated] = await db
    .update(tenants)
    .set(patch)
    .where(eq(tenants.id, tenantId))
    .returning({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      timezone: tenants.timezone,
      invoicePrefix: tenants.invoicePrefix,
      iban: tenants.iban,
      bic: tenants.bic,
    });

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});
