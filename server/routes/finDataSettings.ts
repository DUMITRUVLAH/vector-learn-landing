/**
 * TRUST-001: FinDesk Data Trust & Privacy Settings routes
 *
 * Routes:
 *   GET   /api/fin/data-settings   — fetch current settings for tenant (upsert defaults)
 *   PATCH /api/fin/data-settings   — update pseudonymize_ai_prompts, retention, opt_in
 *
 * Design:
 * - GET always returns a row (upserts defaults on first call — no 404 on new tenants).
 * - PATCH validates with Zod; partial update (only supplied fields change).
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - FIN-CORE §1.16: Data Trust & Privacy layer.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { finDataSettings, FIN_DATA_SETTINGS_DEFAULTS } from "../db/schema/finDataSettings";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finDataSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

finDataSettingsRoutes.use("*", requireAuth);

// ─── Helper: upsert defaults ──────────────────────────────────────────────────

async function upsertDefaults(tenantId: string) {
  // Insert default row if not exists; on conflict (unique tenant_id) do nothing
  await db
    .insert(finDataSettings)
    .values({
      tenantId,
      ...FIN_DATA_SETTINGS_DEFAULTS,
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(finDataSettings)
    .where(eq(finDataSettings.tenantId, tenantId))
    .limit(1);

  return row;
}

// ─── GET /api/fin/data-settings ───────────────────────────────────────────────

finDataSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const row = await upsertDefaults(tenantId);
  return c.json(row, 200);
});

// ─── PATCH /api/fin/data-settings ─────────────────────────────────────────────

const patchSchema = z.object({
  pseudonymizeAiPrompts: z.boolean().optional(),
  aiLogRetentionDays: z
    .number()
    .int()
    .min(1, "Retenția minimă este 1 zi")
    .max(365, "Retenția maximă este 365 de zile")
    .optional(),
  aiOptIn: z.boolean().optional(),
});

finDataSettingsRoutes.patch(
  "/",
  zValidator("json", patchSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    // Ensure the row exists (upsert defaults on first call)
    await upsertDefaults(tenantId);

    // Build partial update — only supplied fields
    const updates: Partial<{
      pseudonymizeAiPrompts: boolean;
      aiLogRetentionDays: number;
      aiOptIn: boolean;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (body.pseudonymizeAiPrompts !== undefined) {
      updates.pseudonymizeAiPrompts = body.pseudonymizeAiPrompts;
    }
    if (body.aiLogRetentionDays !== undefined) {
      updates.aiLogRetentionDays = body.aiLogRetentionDays;
    }
    if (body.aiOptIn !== undefined) {
      updates.aiOptIn = body.aiOptIn;
    }

    await db
      .update(finDataSettings)
      .set(updates)
      .where(eq(finDataSettings.tenantId, tenantId));

    const [updated] = await db
      .select()
      .from(finDataSettings)
      .where(eq(finDataSettings.tenantId, tenantId))
      .limit(1);

    return c.json(updated, 200);
  }
);
