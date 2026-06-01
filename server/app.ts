import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { tenants, users, students, lessons } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/students";
import { teacherRoutes } from "./routes/teachers";
import { courseRoutes } from "./routes/courses";
import { lessonRoutes } from "./routes/lessons";
import { paymentRoutes } from "./routes/payments";
import { leadRoutes } from "./routes/leads";
import { pipelineRoutes } from "./routes/pipeline";
import { taskRoutes } from "./routes/tasks";
import { templateRoutes } from "./routes/templates";
import { automationRoutes } from "./routes/automations";
import { analyticsRoutes } from "./routes/analytics";
import { tagRoutes } from "./routes/tags";
import { payrollRoutes } from "./routes/payroll";
import { hrTeacherRoutes } from "./routes/hrTeachers";
import { availabilityRoutes } from "./routes/availability";
import { auditLogRoutes } from "./routes/auditLog";
import { roomRoutes } from "./routes/rooms";
import { recurringRoutes } from "./routes/recurring";
import { savedViewsRoutes } from "./routes/saved-views";
import { leadsTodayRoutes } from "./routes/leads-today";
import { notificationRoutes } from "./routes/notifications";
import { cadenceRoutes } from "./routes/cadences";
import { auditRoutes } from "./routes/audit";
import { contractRoutes } from "./routes/contracts";
import { feedbackRoutes } from "./routes/feedback";
import { feedbackPublicRoutes } from "./routes/feedbackPublic";
import { contactRoutes } from "./routes/contacts";
import { teamRoutes } from "./routes/team";
import { invoiceRoutes } from "./routes/invoices";
import { cohortRoutes } from "./routes/cohorts";
import { cohortParticipantsRoutes } from "./routes/cohortParticipants";
import { certificateTemplatesRoutes } from "./routes/certificateTemplates"; // DIPLOMA-801
import { enrollRoutes } from "./routes/enroll"; // GAP-011
import { progressRoutes } from "./routes/progress"; // GAP-012
import { makeupRoutes } from "./routes/makeup"; // GAP-013
import { stripePaymentRoutes } from "./routes/stripePayments"; // GAP-014
import { lessonHomeworkRoutes, homeworkRoutes, studentHomeworkRoutes } from "./routes/homework"; // GAP-015

/**
 * The configured Hono app (routes + middleware), with NO server binding and NO
 * static-file serving. Shared by:
 *   - server/index.ts        → local single-port Node server (adds static + serve()).
 *   - server/vercel-entry.ts → Vercel serverless function (bundled by build-vercel.mjs).
 */
export const app = new Hono();

app.use("*", logger());

const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

app.use(
  "/api/*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  })
);

// UX-701: Health checks MUST be public and registered BEFORE any route that mounts
// auth middleware at "/api" (tagRoutes), otherwise /api/health is intercepted and returns
// 401 — which made the BackendStatusBadge show "API: down" on every page despite a healthy API.
app.get("/api/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1 as ping`);
    return c.json({ ok: true, db: "connected", time: new Date().toISOString() });
  } catch (error) {
    return c.json(
      { ok: false, db: "disconnected", error: error instanceof Error ? error.message : "unknown" },
      503
    );
  }
});

app.route("/api/auth", authRoutes);
app.route("/api/students", studentRoutes);
app.route("/api/teachers", teacherRoutes);
app.route("/api/courses", courseRoutes);
app.route("/api/lessons", lessonRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/leads/today", leadsTodayRoutes); // CRM-120: must be before /api/leads (more specific)
app.route("/api/leads", leadRoutes);
app.route("/api/pipeline-stages", pipelineRoutes);
app.route("/api/leads", taskRoutes); // tasks/attachments under /api/leads/:leadId/...
// CRM-114: lead contacts (B2B). Mounted at "/api" because its routes are "/leads/:id/contacts".
// Must be registered before tagRoutes (which mounts a global requireAuth at "/api" and would
// otherwise be the only handler matching /api/leads/:id/contacts → SPA index.html fallthrough).
app.route("/api", contactRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/automations", automationRoutes);
app.route("/api/analytics", analyticsRoutes);
// GAP-011: Public enrollment (BEFORE tagRoutes — no auth required)
app.route("/api/enroll", enrollRoutes);
// FEEDBACK-601: public (no-auth) routes must be registered BEFORE tagRoutes because tagRoutes
// is mounted at "/api" with a global requireAuth that otherwise intercepts all /api/* requests.
app.route("/api/feedback-public", feedbackPublicRoutes);
app.route("/api/feedback", feedbackRoutes);
app.route("/api", tagRoutes); // tags, custom-fields, field-values under /api/leads/:id/... and /api/settings/...
app.route("/api/hr/payroll", payrollRoutes);
app.route("/api/hr/teacher-stats", hrTeacherRoutes);
app.route("/api/hr/teachers", availabilityRoutes);
app.route("/api/hr/audit-log", auditLogRoutes);
app.route("/api/rooms", roomRoutes);
app.route("/api/lessons", recurringRoutes); // /api/lessons/recurring + /api/lessons/series/:id/future
app.route("/api/saved-views", savedViewsRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/cadences", cadenceRoutes);
app.route("/api/audit-log", auditRoutes);
app.route("/api/contracts", contractRoutes);
// FIN-601..604: invoices, debt reconciliation, recurring billing, e-Factura export
app.route("/api/invoices", invoiceRoutes);
// CRM-137: team members endpoint for AssigneePicker
app.route("/api/team", teamRoutes);
// CX-701: Cohorts (course editions) CRUD
app.route("/api/cohorts", cohortRoutes);
// CX-703: Cohort participants (must be mounted at /api/cohorts for /:cohortId/participants)
app.route("/api/cohorts", cohortParticipantsRoutes);
// DIPLOMA-801: Certificate templates
app.route("/api/certificate-templates", certificateTemplatesRoutes);
// GAP-012: Gradebook / student progress (public token route BEFORE tagRoutes)
app.route("/api/progress", progressRoutes);
app.route("/api/makeup", makeupRoutes); // GAP-013
app.route("/api/payments/stripe", stripePaymentRoutes); // GAP-014
// GAP-015: Homework — lesson-scoped and standalone and student-scoped
app.route("/api/lessons", lessonHomeworkRoutes); // GET/POST/DELETE /api/lessons/:id/homework
app.route("/api/homework", homeworkRoutes); // POST /api/homework/:id/submit
app.route("/api/students", studentHomeworkRoutes); // GET /api/students/:id/homework

app.get("/api/health/db", async (c) => {
  try {
    const tablesResult = await db.execute(
      sql`SELECT count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\\_\\_%' ESCAPE '\\'`
    );
    // postgres-js returns the rows array directly; PGlite wraps them in `.rows`.
    const tableRows = (Array.isArray(tablesResult) ? tablesResult : tablesResult.rows) as
      | Array<{ table_count: number }>
      | undefined;
    const tableRow = tableRows?.[0];
    const [tenantCount] = await db.select({ c: sql<number>`count(*)::int` }).from(tenants);
    const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    const [studentCount] = await db.select({ c: sql<number>`count(*)::int` }).from(students);
    const [lessonCount] = await db.select({ c: sql<number>`count(*)::int` }).from(lessons);
    return c.json({
      ok: true,
      tables: tableRow?.table_count ?? 0,
      counts: { tenants: tenantCount.c, users: userCount.c, students: studentCount.c, lessons: lessonCount.c },
    });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "unknown" }, 503);
  }
});

export default app;
