/**
 * GAP-006: Lesson packages API — prepay bundles of N lessons per student per course.
 *
 * POST /api/lesson-packages              → create package
 * GET  /api/lesson-packages?studentId=   → list packages (with filter)
 * GET  /api/lesson-packages/:id          → single package detail
 * PATCH /api/lesson-packages/:id         → update (autoRenew, status, validUntil)
 * POST /api/lesson-packages/run-renewal  → GAP-008: trigger auto-renewal pass
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  lessonPackages,
  invoices,
  notificationQueue,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { sql } from "drizzle-orm";

export const lessonPackageRoutes = new Hono<{ Variables: AuthVariables }>();
lessonPackageRoutes.use("*", requireAuth);

// ── GET /api/lesson-packages ─────────────────────────────────────────────────
const listQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  status: z.enum(["active", "exhausted", "expired", "cancelled"]).optional(),
});

lessonPackageRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { studentId, courseId, status } = c.req.valid("query");

  const conditions = [eq(lessonPackages.tenantId, tenantId)];
  if (studentId) conditions.push(eq(lessonPackages.studentId, studentId));
  if (courseId) conditions.push(eq(lessonPackages.courseId, courseId));
  if (status) conditions.push(eq(lessonPackages.status, status));

  const items = await db
    .select()
    .from(lessonPackages)
    .where(and(...conditions))
    .orderBy(asc(lessonPackages.validFrom));

  return c.json({ items });
});

// ── GET /api/lesson-packages/:id ─────────────────────────────────────────────
lessonPackageRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const pkg = await db.query.lessonPackages.findFirst({
    where: and(eq(lessonPackages.id, id), eq(lessonPackages.tenantId, tenantId)),
  });
  if (!pkg) return c.json({ error: "not_found" }, 404);

  return c.json(pkg);
});

// ── POST /api/lesson-packages ─────────────────────────────────────────────────
const createPackageSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  unitsTotal: z.number().int().min(1).max(1000),
  autoRenew: z.boolean().optional().default(false),
  recoveryIncludedInPackage: z.boolean().optional().default(true),
  validFrom: z.string().length(10), // ISO date YYYY-MM-DD
  validUntil: z.string().length(10).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
});

lessonPackageRoutes.post("/", zValidator("json", createPackageSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [pkg] = await db
    .insert(lessonPackages)
    .values({
      tenantId,
      studentId: body.studentId,
      courseId: body.courseId,
      unitsTotal: body.unitsTotal,
      unitsRemaining: body.unitsTotal, // starts full
      autoRenew: body.autoRenew ?? false,
      recoveryIncludedInPackage: body.recoveryIncludedInPackage ?? true,
      validFrom: body.validFrom,
      validUntil: body.validUntil ?? undefined,
      invoiceId: body.invoiceId ?? undefined,
      status: "active",
    })
    .returning();

  // Schedule low-balance alert if already <= 2 (edge case: e.g. package of 1)
  if (pkg.unitsRemaining <= 2) {
    await scheduleExhaustionAlert(tenantId, pkg.id, pkg.studentId, pkg.unitsRemaining);
  }

  return c.json(pkg, 201);
});

// ── PATCH /api/lesson-packages/:id ─────────────────────────────────────────────
const patchPackageSchema = z.object({
  autoRenew: z.boolean().optional(),
  status: z.enum(["active", "exhausted", "expired", "cancelled"]).optional(),
  validUntil: z.string().length(10).optional().nullable(),
}).partial();

lessonPackageRoutes.patch("/:id", zValidator("json", patchPackageSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.lessonPackages.findFirst({
    where: and(eq(lessonPackages.id, id), eq(lessonPackages.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(lessonPackages)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(lessonPackages.id, id), eq(lessonPackages.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

// ── POST /api/lesson-packages/run-renewal ────────────────────────────────────
/**
 * GAP-008: Trigger auto-renewal for all exhausted packages with autoRenew = true.
 * Can be called from a cron job or manually.
 */
lessonPackageRoutes.post("/run-renewal", async (c) => {
  const tenantId = c.get("user").tenantId;

  const exhausted = await db
    .select()
    .from(lessonPackages)
    .where(
      and(
        eq(lessonPackages.tenantId, tenantId),
        eq(lessonPackages.status, "exhausted"),
        eq(lessonPackages.autoRenew, true),
      )
    );

  const results: Array<{ packageId: string; newPackageId: string; invoiceId: string | null }> = [];

  for (const pkg of exhausted) {
    const renewalResult = await renewPackage(tenantId, pkg);
    results.push(renewalResult);
  }

  return c.json({ renewed: results.length, results });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Schedule a low-balance alert via COMM-205 queue.
 */
export async function scheduleExhaustionAlert(
  tenantId: string,
  packageId: string,
  studentId: string,
  unitsRemaining: number
) {
  const student = await db.query.students.findFirst({ where: eq(students.id, studentId) });
  await db.insert(notificationQueue).values({
    tenantId,
    recipientType: "student",
    recipientId: studentId,
    channel: "email",
    payload: {
      body: unitsRemaining === 0
        ? `Pachetul de lecții s-a epuizat. Reîncarcă pentru a continua.`
        : `Ai ${unitsRemaining} ${unitsRemaining === 1 ? "lecție" : "lecții"} rămase în pachet. Reîncarcă în curând!`,
      context: { package_id: packageId, student_name: student?.fullName ?? "" },
    },
    scheduledFor: new Date(),
  });
}

/**
 * GAP-008: Renew an exhausted package by creating a new invoice and a new package.
 * Returns IDs of new package and invoice.
 */
async function renewPackage(
  tenantId: string,
  pkg: typeof lessonPackages.$inferSelect
): Promise<{ packageId: string; newPackageId: string; invoiceId: string | null }> {
  // Get current max invoice number for tenant to compute next
  const numRows = await db
    .select({ maxNum: sql<number>`coalesce(max(${invoices.number}), 0)::int` })
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId));
  const nextNum = (numRows[0]?.maxNum ?? 0) + 1;
  const invoiceNumber = `VECT-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}`;

  try {
    // Create invoice for the renewal
    const student = await db.query.students.findFirst({ where: eq(students.id, pkg.studentId) });
    const defaultAmountCents = 0; // placeholder — real pricing would come from package template

    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId,
        studentId: pkg.studentId,
        series: "VECT",
        number: nextNum,
        invoiceNumber,
        amountCents: defaultAmountCents,
        currency: "RON",
        status: "draft",
        notes: `Reînnoire automată pachet ${pkg.unitsTotal} lecții`,
      })
      .returning();

    // Create new package
    const today = new Date().toISOString().slice(0, 10);
    const [newPkg] = await db
      .insert(lessonPackages)
      .values({
        tenantId,
        studentId: pkg.studentId,
        courseId: pkg.courseId,
        unitsTotal: pkg.unitsTotal,
        unitsRemaining: pkg.unitsTotal,
        autoRenew: pkg.autoRenew,
        recoveryIncludedInPackage: pkg.recoveryIncludedInPackage,
        validFrom: today,
        invoiceId: inv.id,
        status: "active",
      })
      .returning();

    // Send notification to student
    await db.insert(notificationQueue).values({
      tenantId,
      recipientType: "student",
      recipientId: pkg.studentId,
      channel: "email",
      payload: {
        body: `Pachetul de lecții s-a epuizat. Factură nr. ${invoiceNumber} generată automat.`,
        context: {
          old_package_id: pkg.id,
          new_package_id: newPkg.id,
          invoice_id: inv.id,
          invoice_number: invoiceNumber,
          student_name: student?.fullName ?? "",
        },
      },
      scheduledFor: new Date(),
    });

    return { packageId: pkg.id, newPackageId: newPkg.id, invoiceId: inv.id };
  } catch {
    // Invoice creation failed — notify student to renew manually
    await db.insert(notificationQueue).values({
      tenantId,
      recipientType: "student",
      recipientId: pkg.studentId,
      channel: "email",
      payload: {
        body: `Pachetul de lecții s-a epuizat. Factura automată nu s-a putut genera — factură manuală necesară.`,
        context: { package_id: pkg.id },
      },
      scheduledFor: new Date(),
    });

    return { packageId: pkg.id, newPackageId: "", invoiceId: null };
  }
}
