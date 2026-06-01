/**
 * AI-A04 — Feature Flags
 *
 * Checks whether a specific AI feature is enabled for a tenant.
 * Defaults to true (enabled) if no explicit flag row exists (opt-out model).
 */
import { db } from "../../db/client";
import { aiFeatureFlags } from "../../db/schema";
import { and, eq } from "drizzle-orm";
import type { AiFeature } from "../../db/schema/aiFeatureFlags";

export type { AiFeature };

/**
 * Returns true if the feature is enabled for the tenant.
 * Defaults to true if no row exists (progressive rollout: enabled by default, admins can disable).
 */
export async function isEnabled(tenantId: string, feature: AiFeature): Promise<boolean> {
  const [row] = await db
    .select({ enabled: aiFeatureFlags.enabled })
    .from(aiFeatureFlags)
    .where(
      and(
        eq(aiFeatureFlags.tenantId, tenantId),
        eq(aiFeatureFlags.feature, feature)
      )
    )
    .limit(1);

  // Default: enabled (opt-out model)
  return row?.enabled ?? true;
}

/**
 * Upsert a feature flag for a tenant.
 */
export async function setFlag(tenantId: string, feature: string, enabled: boolean): Promise<void> {
  await db
    .insert(aiFeatureFlags)
    .values({ tenantId, feature, enabled })
    .onConflictDoUpdate({
      target: [aiFeatureFlags.tenantId, aiFeatureFlags.feature],
      set: { enabled, updatedAt: new Date() },
    });
}

/**
 * Get all feature flags for a tenant (returns defaults for missing rows).
 */
export async function getAllFlags(
  tenantId: string
): Promise<Array<{ feature: string; enabled: boolean }>> {
  const AI_FEATURES = [
    "lesson_summary",
    "churn_prediction",
    "lead_qualification",
    "reply_suggestion",
  ] as const;

  const rows = await db
    .select({ feature: aiFeatureFlags.feature, enabled: aiFeatureFlags.enabled })
    .from(aiFeatureFlags)
    .where(eq(aiFeatureFlags.tenantId, tenantId));

  const map = new Map(rows.map((r) => [r.feature, r.enabled]));

  return AI_FEATURES.map((f) => ({
    feature: f,
    enabled: map.get(f) ?? true, // default: enabled
  }));
}
