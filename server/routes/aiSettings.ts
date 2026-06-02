/**
 * AI-A04 — AI Settings routes
 * GET  /api/settings/ai  — fetch usage stats, budget, feature flags
 * PATCH /api/settings/ai — update budget + feature flags
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getMonthlyUsage } from "../lib/ai/budgetGuard";
import { getAllFlags, setFlag } from "../lib/ai/featureFlags";

export const aiSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

aiSettingsRoutes.use("*", requireAuth);

// ─── GET /api/settings/ai ──────────────────────────────────────────────────────

aiSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Fetch budget from tenant row
  const [tenantRow] = await db
    .select({ budgetCents: tenants.aiMonthlyBudgetUsdCents })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  if (!tenantRow) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  // Fetch current-month usage
  const usage = await getMonthlyUsage(user.tenantId);

  // Fetch feature flags
  const featureFlags = await getAllFlags(user.tenantId);

  return c.json({
    monthlyBudgetUsdCents: tenantRow.budgetCents ?? null,
    currentMonthCostUsdCents: usage.currentMonthCostUsdCents,
    callCount: usage.callCount,
    totalTokens: usage.totalTokens,
    featureFlags,
  });
});

// ─── PATCH /api/settings/ai ───────────────────────────────────────────────────

const patchSchema = z.object({
  monthlyBudgetUsdCents: z.number().int().min(0).nullable().optional(),
  featureFlags: z
    .array(
      z.object({
        feature: z.string().min(1).max(50),
        enabled: z.boolean(),
      })
    )
    .optional(),
});

aiSettingsRoutes.patch(
  "/",
  zValidator("json", patchSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Update budget if provided
    if (body.monthlyBudgetUsdCents !== undefined) {
      await db
        .update(tenants)
        .set({
          aiMonthlyBudgetUsdCents: body.monthlyBudgetUsdCents,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, user.tenantId));
    }

    // Update feature flags if provided
    if (body.featureFlags && body.featureFlags.length > 0) {
      for (const flag of body.featureFlags) {
        await setFlag(user.tenantId, flag.feature, flag.enabled);
      }
    }

    return c.json({ ok: true });
  }
);
