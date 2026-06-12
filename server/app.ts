import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { tenants, users, students, lessons } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { institutionRoutes } from "./routes/institution";
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
import { auditLogSettingsRoutes } from "./routes/auditLogSettings"; // SET-803/804
import { notificationSettingsRoutes } from "./routes/notificationSettings"; // SET-805
import { apiKeyRoutes } from "./routes/apiKeys"; // INT-901
import { webhookSettingsRoutes } from "./routes/webhookSettings"; // INT-902
import { badgesRoutes } from "./routes/badges"; // GAP-019/020 gamification
import { companyRegistryRoutes } from "./routes/companyRegistry"; // CONT-PLATA: contafirm.md registry proxy
import { sellerProfileRoutes } from "./routes/sellerProfile"; // CONT-PLATA: issuer details
import { companyClientRoutes } from "./routes/companyClients"; // CONT-PLATA: saved counterparties
import { paymentAccountRoutes } from "./routes/paymentAccounts"; // CONT-PLATA: payment accounts
// Previously-orphaned routers (IMPROVEMENTS #1) — the frontend api modules already call these;
// they were built end-to-end but never mounted, so they fell through to the SPA HTML fallback.
import { accountingRoutes } from "./routes/accounting";
import { admissionsRoutes } from "./routes/admissions";
import { aiRoutes } from "./routes/ai";
import { aiChurnRoutes } from "./routes/aiChurn";
import { aiLeadsRoutes } from "./routes/aiLeads";
import { aiSettingsRoutes } from "./routes/aiSettings";
import { attendanceRoutes } from "./routes/attendance";
import { branchReportsRoutes } from "./routes/branchReports";
import { branchRoutes } from "./routes/branches";
import { broadcastRoutes } from "./routes/broadcasts";
import { certificatesIssueRoutes } from "./routes/certificatesIssue";
import { consentRoutes } from "./routes/consent";
import { formRoutes } from "./routes/forms";
import { gradesRoutes } from "./routes/grades";
import { groupRoutes } from "./routes/groups";
import { guardianRoutes } from "./routes/guardians";
import { lessonHomeworkRoutes, homeworkRoutes, studentHomeworkRoutes } from "./routes/homework";
import { integrationTriggersRoutes } from "./routes/integrationTriggers";
import { lessonPackageRoutes } from "./routes/lessonPackages";
import { messageRoutes } from "./routes/messages";
import { parentPortalRoutes, schoolNewsAdminRoutes } from "./routes/parentPortal";
import { paymentPlanRoutes } from "./routes/paymentPlans";
import { portalInvoiceRoutes } from "./routes/portalInvoice";
import { progressRoutes } from "./routes/progress";
import { promoCodeRoutes } from "./routes/promoCodes";
import { recoveryRoutes } from "./routes/recovery";
import { refundRoutes } from "./routes/refunds";
import { reminderRoutes } from "./routes/reminders";
import { schoolRoutes } from "./routes/school";
import { settingsRoutes } from "./routes/settings";
import { stripeRoutes, stripeWebhookRoutes } from "./routes/stripe";
import { tenantSettingsRoutes } from "./routes/tenantSettings";
import { timetableRoutes } from "./routes/timetable";
import { tuitionRoutes } from "./routes/tuition";
import { userRoutes } from "./routes/users";
import { waitlistRoutes } from "./routes/waitlist";
import { twoFactorRoutes } from "./routes/auth/twoFactor"; // AUTH-004: 2FA setup/verify/disable
import { sessionMgmtRoutes } from "./routes/auth/sessions"; // active session management
// PAR (Payment Action Request) module — Phase A routes
import { parMeRoutes } from "./routes/parMe"; // PAR-002: GET /api/par/me
import { parMembersRoutes } from "./routes/parMembers"; // PAR-002: members CRUD
import { parDoaRoutes } from "./routes/parDoa"; // PAR-002: DOA matrix CRUD
import { parBudgetCodesRoutes } from "./routes/parBudgetCodes"; // PAR-003: budget codes
import { parDepartmentsRoutes } from "./routes/parDepartments"; // PAR-003: departments
import { parProjectsRoutes } from "./routes/parProjects"; // PAR-003: projects/programs
import { parVendorsRoutes } from "./routes/parVendors"; // PAR-003: vendor/payee registry
import { parSettingsRoutes } from "./routes/parSettings"; // PAR-003: org settings
// PAR Phase B routes
import { parRoutes } from "./routes/par"; // PAR-101/102/103: request CRUD + line items + payee
import { parAttachmentsRoutes } from "./routes/parAttachments"; // PAR-104: attachments upload/list/delete
// PAR Phase C routes
import { parApprovalsRoutes } from "./routes/parApprovals"; // PAR-108/113: approve/reject/request-changes + inbox + reapprove
import { parTimelineRoutes } from "./routes/parTimeline"; // PAR-110: timeline / audit log
// PAR Phase D routes
import { parPaymentsRoutes } from "./routes/parPayments"; // PAR-112/113: finance queue + section 16 + pay

/**
 * The configured Hono app (routes + middleware), with NO server binding and NO
 * static-file serving. Shared by:
 *   - server/index.ts        → local single-port Node server (adds static + serve()).
 *   - server/vercel-entry.ts → Vercel serverless function (bundled by build-vercel.mjs).
 */
export const app = new Hono();

app.onError((err, c) => {
  console.error("[ERR]", err.message);
  return c.json({ error: err.message }, 500);
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
app.route("/api/auth/2fa", twoFactorRoutes); // AUTH-004: /setup, /verify, /enable, /disable
app.route("/api/auth/sessions", sessionMgmtRoutes); // list + revoke active sessions
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
// GAP-019/020: Gamification badges + leaderboard
app.route("/api/badges", badgesRoutes);
// SET-802: Branding settings (logo, colors, tenant name)
// CONT-PLATA: company registry (contafirm.md proxy) + payment accounts ("cont de plată")
app.route("/api/registry", companyRegistryRoutes);
app.route("/api/seller-profile", sellerProfileRoutes);
app.route("/api/company-clients", companyClientRoutes);
app.route("/api/payment-accounts", paymentAccountRoutes);
app.route("/api/settings/branding", brandingSettingsRoutes);
// SET-803/804: Audit log settings
app.route("/api/settings/audit-log", auditLogSettingsRoutes);
// SET-805: Notification preferences per user
app.route("/api/settings/notifications", notificationSettingsRoutes);
// INT-901/902: API keys + outbound webhook endpoints (settings pages)
app.route("/api/settings/api-keys", apiKeyRoutes);
app.route("/api/settings/webhooks", webhookSettingsRoutes);

// ── Previously-orphaned routers (IMPROVEMENTS #1). Mount prefixes derived from each route file's
// internal paths + the frontend api module that calls it. MORE-SPECIFIC prefixes are registered
// BEFORE the general ones they share a base with (Hono matches in registration order).
// AI: churn + settings are more specific than the bare /api/ai family.
app.route("/api/ai/churn", aiChurnRoutes);
app.route("/api/settings/ai", aiSettingsRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/ai", aiLeadsRoutes); // /qualify-leads, /reply-suggestion
// School / K-12 vertical: timetable, tuition, admissions are sub-namespaces of /api/school.
app.route("/api/school/timetable", timetableRoutes);
app.route("/api/school/tuition", tuitionRoutes);
app.route("/api/school/admissions", admissionsRoutes);
app.route("/api/school", schoolRoutes); // /years, /terms, /classes
app.route("/api/school", gradesRoutes); // /subjects, /grades/...
app.route("/api/school", schoolNewsAdminRoutes); // /news (admin)
// Branches (reports is more specific than /api/branches).
app.route("/api/branches/reports", branchReportsRoutes);
app.route("/api/branches", branchRoutes);
// Standalone /api/<prefix> CRUD routers.
app.route("/api/attendance", attendanceRoutes);
app.route("/api/broadcasts", broadcastRoutes);
app.route("/api/certificates", certificatesIssueRoutes); // /issue, /issue-bulk
app.route("/api/consent", consentRoutes);
app.route("/api/forms", formRoutes);
app.route("/api/groups", groupRoutes);
app.route("/api/integrations/triggers", integrationTriggersRoutes);
app.route("/api/lesson-packages", lessonPackageRoutes);
app.route("/api/messages", messageRoutes);
// NOTE: mobileRoutes (/api/m) is intentionally NOT mounted — mobile.ts imports a non-existent
// `homework` schema export (queries a `homework` table with studentId/deadline/status that was
// never created; lesson_homework has none of those). Mounting it crashes server boot. Needs a
// real rewrite (join lesson_homework + homework_submissions). Tracked in IMPROVEMENTS. (mount-exempt)
app.route("/api/parent", parentPortalRoutes); // /children/...
app.route("/api/payment-plans", paymentPlanRoutes);
app.route("/api/portal", portalInvoiceRoutes); // /invoice/:id (composes with other /api/portal mounts)
app.route("/api/progress", progressRoutes);
app.route("/api/promo-codes", promoCodeRoutes);
app.route("/api/recovery", recoveryRoutes);
app.route("/api/settings", settingsRoutes); // /rr-assign (round-robin assignment)
app.route("/api/tenantSettings", tenantSettingsRoutes);
app.route("/api/users", userRoutes);
// Routers whose internal paths already carry the feature segment → mount at "/api".
app.route("/api", accountingRoutes); // /accounting/export, /accounting/summary, /accounting/mappings
app.route("/api/students", guardianRoutes); // /:studentId/guardians
app.route("/api/students", studentHomeworkRoutes); // /:studentId/homework
app.route("/api/lessons", lessonHomeworkRoutes); // /:lessonId/homework
app.route("/api/homework", homeworkRoutes); // /:id/submit
app.route("/api", refundRoutes); // /invoices/:id/refund, /refunds
app.route("/api", reminderRoutes); // /admin/run-reminders, /invoices/:id/reminders, /payments/overdue-summary
app.route("/api", waitlistRoutes); // /courses/:id/waitlist
// Stripe: signature verification on the webhook is now mandatory (security C-1 fix), safe to mount.
app.route("/api", stripeRoutes); // /settings/stripe, /invoices/:id/stripe-link
app.route("/api", stripeWebhookRoutes); // /webhooks/stripe
// INST-001: Institution type (gradinita | scoala | mixt) — drives module visibility
app.route("/api/settings/institution", institutionRoutes);

// PAR (Payment Action Request) module — Phase A
// Specific-path prefixes MUST be registered BEFORE the generic /api/par/:id handlers.
app.route("/api/par/me", parMeRoutes);
app.route("/api/par/members", parMembersRoutes);
app.route("/api/par/doa", parDoaRoutes);
app.route("/api/par/budget-codes", parBudgetCodesRoutes);
app.route("/api/par/departments", parDepartmentsRoutes);
app.route("/api/par/projects", parProjectsRoutes);
app.route("/api/par/vendors", parVendorsRoutes);
app.route("/api/par/settings", parSettingsRoutes);
// PAR Phase D (specific paths) — register BEFORE generic /api/par to prevent
// /api/par/finance being captured by /:id as "finance"
app.route("/api/par", parPaymentsRoutes);
// PAR Phase B — request CRUD + line items + payee (PAR-101/102/103)
// Mount AFTER all more-specific paths to avoid path conflicts
app.route("/api/par", parRoutes);
// PAR-104: attachments — mounted under /api/par (handles /:id/attachments paths)
app.route("/api/par", parAttachmentsRoutes);
// PAR Phase C — approval actions + inbox (PAR-108)
// /inbox is a more-specific path; register BEFORE generic /:id handlers
app.route("/api/par", parApprovalsRoutes);
// PAR-110: timeline endpoint — mounted AFTER approval routes
app.route("/api/par", parTimelineRoutes);

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
