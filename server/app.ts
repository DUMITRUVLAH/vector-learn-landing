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
import { kinderRoutes } from "./routes/kinder"; // KINDER-001
import { kinderDiaryRoutes } from "./routes/kinderDiary"; // KINDER-002
import { kinderRatioRoutes } from "./routes/kinderRatio"; // KINDER-003
import { kinderMedicalRoutes } from "./routes/kinderMedical"; // KINDER-004
import { kinderParentFeedRoutes } from "./routes/kinderParentFeed"; // KINDER-005
import { kinderComplianceRoutes } from "./routes/kinderCompliance"; // KINDER-006
import { kinderIncidentsRoutes } from "./routes/kinderIncidents"; // KINDER-007
import { publicFormGetHandler, publicFormSubmitHandler, publicFormPingHandler } from "./routes/publicForms";
import { enrollRoutes } from "./routes/enroll";
import { certificatesPublicRoutes } from "./routes/certificatesPublic";
import { portalRoutes, portalAdminRoutes } from "./routes/portal";
import { portalNotifsRoutes, portalNotifsAdminRoutes, portalCronRoutes } from "./routes/portalNotifs";
import { publicTeamRoutes } from "./routes/team";
// SET-801..805: Settings routes
import { brandingSettingsRoutes } from "./routes/brandingSettings"; // SET-802
import { localeSettingsRoutes } from "./routes/localeSettings"; // SET-802
import { auditLogSettingsRoutes } from "./routes/auditLogSettings"; // SET-803/804
import { notificationSettingsRoutes } from "./routes/notificationSettings"; // SET-805

/**
 * The configured Hono app (routes + middleware), with NO server binding and NO
 * static-file serving. Shared by:
 *   - server/index.ts        → local single-port Node server (adds static + serve()).
 *   - server/vercel-entry.ts → Vercel serverless function (bundled by build-vercel.mjs).
 */
export const app = new Hono();

// Temporary error handler — exposes error message to diagnose prod 500s
app.onError((err, c) => {
  console.error("[UNHANDLED]", err);
  return c.json({ error: "internal_error", message: err.message, stack: err.stack?.split("\n").slice(0, 5) }, 500);
});

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

// FORMS-001: public (no-auth) form routes — registered as DIRECT app handlers immediately
// after /api/health, before ANY sub-router mounted at "/api" (contactRoutes, tagRoutes, etc.)
// because those sub-routers use("/*", requireAuth) which becomes ALL /api/* middleware and
// intercepts any path registered AFTER them, even direct app.get handlers.
app.get("/api/public/forms/:slug", publicFormGetHandler);
app.post("/api/public/forms/:slug/submit", publicFormSubmitHandler);
// FORMS-005: analytics ping (no-auth, fire-and-forget from renderer)
app.post("/api/public/forms/:slug/ping", publicFormPingHandler);

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
// DIPLOMA-805: public certificate verification — no auth required.
// Must be BEFORE tagRoutes (which mounts global requireAuth at "/api").
app.route("/api/public/certificates", certificatesPublicRoutes);
app.route("/api/feedback", feedbackRoutes);
// GAP-010: Student portal — public token access (BEFORE tagRoutes which has global requireAuth)
app.route("/api/portal", portalRoutes);
// GAP-010: Student portal admin (generate token) — requires auth
app.route("/api/portal", portalAdminRoutes);
// GAP-017: Portal notification prefs — public token routes (BEFORE tagRoutes)
app.route("/api/portal", portalNotifsRoutes);
// GAP-017: Portal notification admin routes
app.route("/api/portal", portalNotifsAdminRoutes);
// GAP-017: Cron routes for proactive alerts (internal, no auth — call from scheduler)
app.route("/api/portal", portalCronRoutes);
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
// AUTH-002: public (no-auth) team routes — accept-invitation
app.route("/api/team", publicTeamRoutes);
// CX-701: Cohorts (course editions) CRUD
app.route("/api/cohorts", cohortRoutes);
// CX-703: Cohort participants (must be mounted at /api/cohorts for /:cohortId/participants)
app.route("/api/cohorts", cohortParticipantsRoutes);
// DIPLOMA-801: Certificate templates
app.route("/api/certificate-templates", certificateTemplatesRoutes);
// KINDER-001: Kindergarten check-in / sign-out + authorized pickups
app.route("/api/kinder", kinderRoutes);
// KINDER-002: Daily report / child diary events
app.route("/api/kinder", kinderDiaryRoutes);
// KINDER-003: Staff-to-child ratio monitoring
app.route("/api/kinder", kinderRatioRoutes);
// KINDER-004: Medical — allergies, immunization records, medication log
app.route("/api/kinder", kinderMedicalRoutes);
// KINDER-005: Parent feed + messaging
app.route("/api/kinder", kinderParentFeedRoutes);
// KINDER-006: Licensing/compliance reports (no new migrations)
app.route("/api/kinder", kinderComplianceRoutes);
// KINDER-007: Incident/accident reports + parent acknowledgment
app.route("/api/kinder", kinderIncidentsRoutes);
// SET-802: Branding settings (logo, colors, tenant name)
app.route("/api/settings/branding", brandingSettingsRoutes);
// SET-802: Locale / timezone settings per user
app.route("/api/settings/locale", localeSettingsRoutes);
// SET-803/804: Audit log settings
app.route("/api/settings/audit-log", auditLogSettingsRoutes);
// SET-805: Notification preferences per user
app.route("/api/settings/notifications", notificationSettingsRoutes);

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

app.get("/api/health/db", async (c) => {
  try {
    const tablesResult = await db.execute(
      sql`SELECT count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\\_\\_%' ESCAPE '\\'`
    );
    // postgres-js returns the rows array directly; PGlite wraps them in `.rows`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableRows = (Array.isArray(tablesResult) ? tablesResult : (tablesResult as any).rows) as
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
