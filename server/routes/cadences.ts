/**
 * CRM-126 — Follow-up cadences CRUD + tick endpoint
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lte, count } from "drizzle-orm";
import { db } from "../db/client";
import {
  cadences,
  leadCadenceEnrollments,
  leads,
  leadInteractions,
  leadTasks,
} from "../db/schema";
import type { CadenceStep } from "../db/schema/cadences";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const cadenceRoutes = new Hono<{ Variables: AuthVariables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const stepSchema = z.object({
  delay_days: z.number().int().min(0).max(365),
  action: z.enum(["send_template", "create_task"]),
  template_id: z.string().uuid().optional(),
  task_title: z.string().min(1).max(300).optional(),
});

const createCadenceSchema = z.object({
  name: z.string().min(1).max(200),
  triggerStage: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  steps: z.array(stepSchema).min(1, "At least one step required"),
});

const updateCadenceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  triggerStage: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).optional(),
});

// ─── Authenticated routes ─────────────────────────────────────────────────────

cadenceRoutes.use("/*", async (c, next) => {
  // Allow internal tick endpoint without user auth
  if (c.req.path.endsWith("/tick")) return next();
  return requireAuth(c, next);
});

/** List all cadences for tenant */
cadenceRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select()
    .from(cadences)
    .where(eq(cadences.tenantId, tenantId))
    .orderBy(cadences.createdAt);

  // Augment with active enrollment counts
  const enriched = await Promise.all(
    rows.map(async (cad) => {
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(leadCadenceEnrollments)
        .where(
          and(
            eq(leadCadenceEnrollments.cadenceId, cad.id),
            eq(leadCadenceEnrollments.status, "active")
          )
        );
      return { ...cad, activeEnrollments: Number(activeCount ?? 0) };
    })
  );

  return c.json({ cadences: enriched });
});

/** Create a new cadence */
cadenceRoutes.post("/", zValidator("json", createCadenceSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [created] = await db
    .insert(cadences)
    .values({
      tenantId,
      name: body.name,
      triggerStage: body.triggerStage,
      enabled: body.enabled,
      steps: body.steps,
    })
    .returning();

  return c.json(created, 201);
});

/** Update a cadence */
cadenceRoutes.patch("/:id", zValidator("json", updateCadenceSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.triggerStage !== undefined) patch.triggerStage = body.triggerStage;
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.steps !== undefined) patch.steps = body.steps;

  const [updated] = await db
    .update(cadences)
    .set(patch)
    .where(and(eq(cadences.id, id), eq(cadences.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

/** Disable (soft-delete) a cadence */
cadenceRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const [updated] = await db
    .update(cadences)
    .set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(cadences.id, id), eq(cadences.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ disabled: true });
});

/** Get active enrollment for a lead */
cadenceRoutes.get("/enrollments/:leadId", async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;

  const enrollments = await db
    .select({
      enrollment: leadCadenceEnrollments,
      cadence: cadences,
    })
    .from(leadCadenceEnrollments)
    .innerJoin(cadences, eq(leadCadenceEnrollments.cadenceId, cadences.id))
    .where(
      and(
        eq(leadCadenceEnrollments.leadId, leadId),
        eq(leadCadenceEnrollments.tenantId, tenantId)
      )
    )
    .orderBy(leadCadenceEnrollments.enrolledAt);

  return c.json({ enrollments });
});

/** Pause an enrollment */
cadenceRoutes.post("/enrollments/:enrollmentId/pause", async (c) => {
  const enrollmentId = c.req.param("enrollmentId");
  const tenantId = c.get("user").tenantId;

  const [updated] = await db
    .update(leadCadenceEnrollments)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      and(
        eq(leadCadenceEnrollments.id, enrollmentId),
        eq(leadCadenceEnrollments.tenantId, tenantId)
      )
    )
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// ─── Internal tick endpoint ────────────────────────────────────────────────────

/**
 * POST /api/cadences/tick — advances all due enrollments.
 * Protected by X-Internal-Key header (not user auth).
 * Call this from a cron job / scheduled function.
 */
cadenceRoutes.post("/tick", async (c) => {
  const internalKey = c.req.header("x-internal-key");
  const expectedKey = process.env.INTERNAL_KEY ?? "dev";
  if (internalKey !== expectedKey) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const now = new Date();

  // Find all active enrollments that are due
  const dueEnrollments = await db
    .select({
      enrollment: leadCadenceEnrollments,
      cadence: cadences,
    })
    .from(leadCadenceEnrollments)
    .innerJoin(cadences, eq(leadCadenceEnrollments.cadenceId, cadences.id))
    .where(
      and(
        eq(leadCadenceEnrollments.status, "active"),
        lte(leadCadenceEnrollments.nextFireAt, now)
      )
    );

  const results: Array<{ enrollmentId: string; status: string; detail: string }> = [];

  for (const { enrollment, cadence } of dueEnrollments) {
    const steps = (cadence.steps ?? []) as CadenceStep[];
    const currentStep = enrollment.currentStep;

    if (currentStep >= steps.length) {
      // All steps done
      await db
        .update(leadCadenceEnrollments)
        .set({ status: "completed", updatedAt: now })
        .where(eq(leadCadenceEnrollments.id, enrollment.id));
      results.push({ enrollmentId: enrollment.id, status: "completed", detail: "All steps done" });
      continue;
    }

    const step = steps[currentStep];
    if (!step) continue;

    // Fetch lead
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, enrollment.leadId),
    });

    if (!lead) {
      await db
        .update(leadCadenceEnrollments)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(leadCadenceEnrollments.id, enrollment.id));
      results.push({ enrollmentId: enrollment.id, status: "cancelled", detail: "Lead not found" });
      continue;
    }

    // Execute step action
    try {
      if (step.action === "send_template" && step.template_id) {
        await db.insert(leadInteractions).values({
          tenantId: enrollment.tenantId,
          leadId: lead.id,
          type: "system",
          direction: "outbound",
          body: `[Cadence: ${cadence.name}] Step ${currentStep + 1}: send template`,
          metadata: {
            cadence_id: cadence.id,
            cadence_step: currentStep,
            template_id: step.template_id,
            stub: true,
          },
        });
      } else if (step.action === "create_task" && step.task_title) {
        await db.insert(leadTasks).values({
          tenantId: enrollment.tenantId,
          leadId: lead.id,
          title: step.task_title.replace("{{full_name}}", lead.fullName),
          dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // due tomorrow
          status: "open",
        });
      }

      // Advance to next step
      const nextStep = currentStep + 1;
      const isLastStep = nextStep >= steps.length;
      const nextStepDef = !isLastStep ? steps[nextStep] : null;

      await db
        .update(leadCadenceEnrollments)
        .set({
          currentStep: nextStep,
          status: isLastStep ? "completed" : "active",
          nextFireAt: nextStepDef
            ? new Date(now.getTime() + nextStepDef.delay_days * 24 * 60 * 60 * 1000)
            : null,
          updatedAt: now,
        })
        .where(eq(leadCadenceEnrollments.id, enrollment.id));

      results.push({
        enrollmentId: enrollment.id,
        status: isLastStep ? "completed" : "advanced",
        detail: `Executed step ${currentStep + 1}/${steps.length}: ${step.action}`,
      });
    } catch (err) {
      results.push({
        enrollmentId: enrollment.id,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return c.json({ processed: results.length, results });
});

// ─── Helper: auto-enroll lead in matching cadences ────────────────────────────

/**
 * Call this when a lead's stage changes.
 * Enrolls the lead in all enabled cadences whose trigger_stage matches.
 * Fire-and-forget safe.
 */
export async function enrollLeadInCadences(
  tenantId: string,
  leadId: string,
  toStage: string
): Promise<void> {
  const matchingCadences = await db
    .select()
    .from(cadences)
    .where(
      and(
        eq(cadences.tenantId, tenantId),
        eq(cadences.enabled, true),
        eq(cadences.triggerStage, toStage)
      )
    );

  for (const cad of matchingCadences) {
    const steps = (cad.steps ?? []) as CadenceStep[];
    if (steps.length === 0) continue;

    const firstStep = steps[0];
    const now = new Date();

    await db.insert(leadCadenceEnrollments).values({
      tenantId,
      leadId,
      cadenceId: cad.id,
      enrolledAt: now,
      currentStep: 0,
      status: "active",
      nextFireAt: new Date(now.getTime() + firstStep.delay_days * 24 * 60 * 60 * 1000),
    });
  }
}

/**
 * Call this when an inbound interaction is logged for a lead.
 * Pauses all active enrollments for that lead.
 * Fire-and-forget safe.
 */
export async function pauseEnrollmentsOnReply(
  tenantId: string,
  leadId: string
): Promise<void> {
  await db
    .update(leadCadenceEnrollments)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      and(
        eq(leadCadenceEnrollments.tenantId, tenantId),
        eq(leadCadenceEnrollments.leadId, leadId),
        eq(leadCadenceEnrollments.status, "active")
      )
    );
}
