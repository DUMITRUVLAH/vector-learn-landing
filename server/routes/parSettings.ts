/**
 * PAR-003: PAR settings per tenant
 * GET/PATCH /api/par/settings — par_admin
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { parSettings } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parSettingsRoutes = new Hono<{ Variables: AuthVariables }>();
parSettingsRoutes.use("*", requireAuth);

const settingsSchema = z.object({
  microPurchaseThresholdCents: z.number().int().positive().optional(),
  defaultCurrency: z.string().length(3).optional(),
  orgLegalName: z.string().max(300).optional().nullable(),
  orgLogoUrl: z.string().url().max(1000).optional().nullable(),
  pdfHelpUrl: z.string().url().max(1000).optional().nullable(),
  requestNoPrefix: z.string().min(1).max(20).optional(),
  onboardingComplete: z.boolean().optional(),
  enforceThreeWayMatch: z.boolean().optional(),
});

/** GET /api/par/settings */
parSettingsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));

  if (!settings) {
    // Return defaults if not yet configured
    return c.json({
      microPurchaseThresholdCents: 1000000,
      defaultCurrency: "MDL",
      orgLegalName: null,
      orgLogoUrl: null,
      pdfHelpUrl: null,
      requestNoPrefix: "PAR",
      onboardingComplete: false,
      enforceThreeWayMatch: false,
    });
  }

  return c.json(settings);
});

/** PATCH /api/par/settings */
parSettingsRoutes.patch(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", settingsSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    // Upsert
    const existing = await db
      .select({ id: parSettings.id })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));

    if (existing.length > 0) {
      const [row] = await db
        .update(parSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(parSettings.tenantId, tenantId))
        .returning();
      return c.json(row);
    } else {
      // PARQA-012: spread the whole body over the defaults so EVERY provided field persists on the
      // first insert. The previous hand-listed value set silently dropped onboardingComplete,
      // enforceThreeWayMatch (and any future field) — a new tenant's first PATCH that set only one
      // of those created the row without it (insert-branch drift vs the update branch).
      const [row] = await db
        .insert(parSettings)
        .values({
          tenantId,
          microPurchaseThresholdCents: 1000000,
          defaultCurrency: "MDL",
          requestNoPrefix: "PAR",
          ...body,
        })
        .returning();
      return c.json(row, 201);
    }
  }
);
