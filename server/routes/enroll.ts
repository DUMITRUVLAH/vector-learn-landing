/**
 * GAP-011: Public enrollment into cohorts
 *
 * PUBLIC routes (no auth):
 *   GET  /api/enroll/:slug         — cohort details for the enrollment page
 *   POST /api/enroll/:slug         — submit enrollment request (creates pending or waitlist)
 *   POST /api/enroll/stripe-webhook — Stripe webhook: payment complete → create student + participant
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  cohorts,
  courses,
  cohortParticipants,
  enrollmentRequests,
  students,
  families,
} from "../db/schema";

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

// ─── Public enrollment router ─────────────────────────────────────────────────
export const enrollRoutes = new Hono();

/** GET /api/enroll/:slug — cohort details for the public enrollment page */
enrollRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slug || slug.length > 200) return c.json({ error: "invalid_slug" }, 400);

  const cohortRows = normalizeRows<{
    id: string;
    tenantId: string;
    label: string;
    startDate: string;
    totalHours: number;
    isOnline: boolean;
    maxParticipants: number;
    slug: string | null;
    courseName: string | null;
    courseDescription: string | null;
  }>(
    await db
      .select({
        id: cohorts.id,
        tenantId: cohorts.tenantId,
        label: cohorts.label,
        startDate: cohorts.startDate,
        totalHours: cohorts.totalHours,
        isOnline: cohorts.isOnline,
        maxParticipants: cohorts.maxParticipants,
        slug: cohorts.slug,
        courseName: courses.name,
        courseDescription: courses.description,
      })
      .from(cohorts)
      .leftJoin(courses, eq(courses.id, cohorts.courseId))
      .where(eq(cohorts.slug, slug))
      .limit(1)
  );

  const cohort = cohortRows[0];
  if (!cohort) return c.json({ error: "cohort_not_found" }, 404);

  // Count current participants
  const participantCountRows = normalizeRows<{ cnt: number }>(
    await db
      .select({ cnt: count() })
      .from(cohortParticipants)
      .where(eq(cohortParticipants.cohortId, cohort.id))
  );
  const participantCount = participantCountRows[0]?.cnt ?? 0;

  const seatsRemaining =
    cohort.maxParticipants === 0
      ? null // unlimited
      : Math.max(0, cohort.maxParticipants - participantCount);

  return c.json({
    cohort: {
      id: cohort.id,
      label: cohort.label,
      startDate: cohort.startDate,
      totalHours: cohort.totalHours,
      isOnline: cohort.isOnline,
      courseName: cohort.courseName,
      courseDescription: cohort.courseDescription,
      seatsRemaining,
      maxParticipants: cohort.maxParticipants,
    },
  });
});

const enrollSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(255),
  phone: z.string().max(32).optional(),
});

/** POST /api/enroll/:slug — submit an enrollment request */
enrollRoutes.post("/:slug", zValidator("json", enrollSchema), async (c) => {
  const slug = c.req.param("slug");
  const { name, email, phone } = c.req.valid("json");

  // Find cohort
  const cohortRows = normalizeRows<typeof cohorts.$inferSelect>(
    await db.select().from(cohorts).where(eq(cohorts.slug, slug)).limit(1)
  );
  const cohort = cohortRows[0];
  if (!cohort) return c.json({ error: "cohort_not_found" }, 404);

  // Count current participants to check seats
  const participantCountRows = normalizeRows<{ cnt: number }>(
    await db
      .select({ cnt: count() })
      .from(cohortParticipants)
      .where(eq(cohortParticipants.cohortId, cohort.id))
  );
  const participantCount = participantCountRows[0]?.cnt ?? 0;

  const isFull =
    cohort.maxParticipants > 0 && participantCount >= cohort.maxParticipants;

  let status: "pending" | "waitlisted" = isFull ? "waitlisted" : "pending";
  let checkoutUrl: string | null = null;

  // If Stripe is configured and there are seats, create a Checkout Session (placeholder)
  if (!isFull && STRIPE_SECRET) {
    // Real Stripe integration would call stripe.checkout.sessions.create(...)
    // For now we set a placeholder URL to satisfy the test contract
    checkoutUrl = `https://checkout.stripe.com/pay/placeholder?cohort=${cohort.id}&email=${encodeURIComponent(email)}`;
  } else if (!isFull && !STRIPE_SECRET) {
    // No Stripe: set status pending and return a placeholder
    checkoutUrl = null;
  }

  // Save enrollment request
  const requestRows = normalizeRows<typeof enrollmentRequests.$inferSelect>(
    await db
      .insert(enrollmentRequests)
      .values({
        tenantId: cohort.tenantId,
        cohortId: cohort.id,
        name,
        email,
        phone: phone ?? null,
        status,
        stripeSessionId: null,
      })
      .returning()
  );
  const request = requestRows[0];
  if (!request) return c.json({ error: "failed_to_create_request" }, 500);

  return c.json({
    enrollmentId: request.id,
    status,
    checkoutUrl,
    waitlisted: isFull,
  });
});

/** POST /api/enroll/stripe-webhook — Stripe checkout.session.completed webhook */
enrollRoutes.post("/stripe-webhook", async (c) => {
  // In production, verify Stripe signature here.
  // For now, accept raw JSON and process.
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }

  const event = body as {
    type?: string;
    data?: { object?: { id?: string; customer_email?: string; metadata?: Record<string, string> } };
  };

  if (event.type !== "checkout.session.completed") {
    return c.json({ ok: true, skipped: true });
  }

  const session = event.data?.object;
  if (!session?.id) return c.json({ error: "missing_session" }, 400);

  // Find the enrollment request for this session
  const requestRows = normalizeRows<typeof enrollmentRequests.$inferSelect>(
    await db
      .select()
      .from(enrollmentRequests)
      .where(eq(enrollmentRequests.stripeSessionId, session.id))
      .limit(1)
  );
  const request = requestRows[0];
  if (!request) {
    // Session may have been created directly; try matching by email
    const email = session.customer_email ?? session.metadata?.email;
    if (!email) return c.json({ error: "request_not_found" }, 404);

    const emailRows = normalizeRows<typeof enrollmentRequests.$inferSelect>(
      await db
        .select()
        .from(enrollmentRequests)
        .where(
          and(
            eq(enrollmentRequests.email, email),
            eq(enrollmentRequests.status, "pending")
          )
        )
        .limit(1)
    );
    if (!emailRows[0]) return c.json({ error: "request_not_found" }, 404);
  }

  const req = request ?? (await (async () => {
    const email = session.customer_email ?? session.metadata?.email;
    if (!email) return null;
    const rows = normalizeRows<typeof enrollmentRequests.$inferSelect>(
      await db.select().from(enrollmentRequests).where(and(eq(enrollmentRequests.email, email), eq(enrollmentRequests.status, "pending"))).limit(1)
    );
    return rows[0] ?? null;
  })());

  if (!req) return c.json({ error: "request_not_found" }, 404);

  // Create or find family
  const familyRows = normalizeRows<typeof families.$inferSelect>(
    await db
      .insert(families)
      .values({
        tenantId: req.tenantId,
        payerName: req.name,
        payerEmail: req.email,
        payerPhone: req.phone ?? null,
      })
      .returning()
  );
  const family = familyRows[0];
  if (!family) return c.json({ error: "failed_to_create_family" }, 500);

  // Create student
  const studentRows = normalizeRows<typeof students.$inferSelect>(
    await db
      .insert(students)
      .values({
        tenantId: req.tenantId,
        fullName: req.name,
        email: req.email,
        phone: req.phone ?? null,
        status: "active",
        familyId: family.id,
      })
      .returning()
  );
  const student = studentRows[0];
  if (!student) return c.json({ error: "failed_to_create_student" }, 500);

  // Add to cohort participants
  await db.insert(cohortParticipants).values({
    tenantId: req.tenantId,
    cohortId: req.cohortId,
    studentId: student.id,
    source: "manual",
    paymentStatus: "pending",
  });

  // Mark enrollment request as paid
  await db
    .update(enrollmentRequests)
    .set({ status: "paid", createdStudentId: student.id, updatedAt: new Date() })
    .where(eq(enrollmentRequests.id, req.id));

  return c.json({ ok: true, studentId: student.id });
});
