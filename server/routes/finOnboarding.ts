/**
 * CORE-005: FinDesk onboarding progress API
 * Manages a per-tenant onboarding tracker (fin_onboarding table, CORE-001).
 *
 * Routes:
 *   GET  /api/fin/onboarding  → get current onboarding state (creates default if missing)
 *   PATCH /api/fin/onboarding → advance or skip to a step
 *
 * Mounted in server/app.ts: app.route("/api/fin/onboarding", finOnboardingRoutes)
 * Tenant isolation: all reads/writes scoped to c.get("user").tenantId.
 * Role: any fin member may view/advance onboarding (viewer+).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { finOnboarding } from "../db/schema/finCore";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireFinRole } from "../middleware/requireFinRole";

export const finOnboardingRoutes = new Hono<{ Variables: AuthVariables }>();
finOnboardingRoutes.use("*", requireAuth);

// ─── Validation ────────────────────────────────────────────────────────────────

const onboardingStepValues = ["company", "parties", "first_invoice", "done"] as const;
type OnboardingStep = (typeof onboardingStepValues)[number];

const patchSchema = z.object({
  step: z.enum(onboardingStepValues),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch or auto-create the tenant's onboarding record. */
async function getOrCreate(tenantId: string) {
  const existing = await db
    .select()
    .from(finOnboarding)
    .where(eq(finOnboarding.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(finOnboarding)
    .values({ tenantId, step: "company", completedSteps: [] })
    .returning();
  return created;
}

/** Ordered steps for auto-advance logic */
const STEP_ORDER: OnboardingStep[] = ["company", "parties", "first_invoice", "done"];

/** Return the next step after the given one, or "done" if already last. */
function nextStep(current: OnboardingStep): OnboardingStep {
  const idx = STEP_ORDER.indexOf(current);
  return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : "done";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/fin/onboarding
 * Returns the current onboarding state for the caller's tenant.
 * Auto-creates the record on first call.
 */
finOnboardingRoutes.get("/", requireFinRole("viewer"), async (c) => {
  const { tenantId } = c.get("user");
  const record = await getOrCreate(tenantId);
  return c.json({ onboarding: record });
});

/**
 * PATCH /api/fin/onboarding
 * Advances (or skips) to the specified step.
 * - If step = next natural step → marks current step as completed and advances.
 * - If step = arbitrary (skip) → allowed; marks intervening steps as skipped but records them
 *   in completedSteps so the wizard doesn't loop.
 * - If step = "done" → wizard is dismissed; GET will return step=done permanently.
 */
finOnboardingRoutes.patch(
  "/",
  requireFinRole("viewer"),
  zValidator("json", patchSchema),
  async (c) => {
    const { tenantId } = c.get("user");
    const { step } = c.req.valid("json");

    const record = await getOrCreate(tenantId);
    const currentIdx = STEP_ORDER.indexOf(record.step as OnboardingStep);
    const targetIdx = STEP_ORDER.indexOf(step);

    // Collect all steps that were "passed through" (including the current)
    const stepsToMark: string[] = [];
    for (let i = currentIdx; i < targetIdx; i++) {
      stepsToMark.push(STEP_ORDER[i]);
    }

    const alreadyCompleted = Array.isArray(record.completedSteps)
      ? (record.completedSteps as string[])
      : [];
    const newCompleted = Array.from(new Set([...alreadyCompleted, ...stepsToMark]));

    // Only advance if the target is further than current
    const newStep = targetIdx > currentIdx ? step : record.step;

    const [updated] = await db
      .update(finOnboarding)
      .set({
        step: newStep as OnboardingStep,
        completedSteps: newCompleted,
        updatedAt: new Date(),
      })
      .where(eq(finOnboarding.tenantId, tenantId))
      .returning();

    return c.json({ onboarding: updated });
  }
);
