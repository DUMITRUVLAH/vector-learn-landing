import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { tenants, users } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { twoFactorRoutes } from "./routes/auth/twoFactor";
import { sessionMgmtRoutes } from "./routes/auth/sessions";
import { businessAuthRoutes } from "./routes/businessAuth";
import { companyRegistryRoutes } from "./routes/companyRegistry";
import { sellerProfileRoutes } from "./routes/sellerProfile";
import { companyClientRoutes } from "./routes/companyClients";
import { paymentAccountRoutes } from "./routes/paymentAccounts";
import { branchRoutes } from "./routes/branches";
import { notificationRoutes } from "./routes/notifications";
import { finAnalyticsRoutes } from "./routes/finAnalytics";

// FinDesk routes
import { finInvoicesRoutes } from "./routes/finInvoices";
import { finInvoiceDocRoutes } from "./routes/finInvoiceDoc";
import { finExpensesRoutes } from "./routes/finExpenses";
import { finCapturesRoutes } from "./routes/finCaptures";
import { finLedgerRoutes } from "./routes/finLedger";
import { finBudgetRoutes } from "./routes/finBudget";
import { finCashRoutes } from "./routes/finCash";
import { finCashAllocationsRoutes } from "./routes/finCashAllocations";
import { finBankLinkRoutes } from "./routes/finBankLink";
import { finMassRoutes } from "./routes/finMass";
import { finMembersRoutes } from "./routes/finMembers";
import { finOrgRoutes } from "./routes/finOrg";
import { finPartiesRoutes } from "./routes/finParties";
import { finAgreementsRoutes } from "./routes/finAgreements";
import { finInventoryRoutes } from "./routes/finInventory";
import { finAssetsRoutes } from "./routes/finAssets";
import { finPayrollRoutes } from "./routes/finPayroll";
import { finTaxRoutes } from "./routes/finTax";
import { finCalendarRoutes } from "./routes/finCalendar";
import { finExportRoutes } from "./routes/finExport";
import { finRegistryRoutes } from "./routes/finRegistry";
import { finEinvoicesRoutes } from "./routes/finEinvoices";
import { finExchangeRatesRoutes } from "./routes/finExchangeRates";
import { finAiAuditRoutes } from "./routes/finAiAudit";
import { finGdprRoutes } from "./routes/finGdpr";
import { finDataSettingsRoutes } from "./routes/finDataSettings";
import { finClientPortalRoutes } from "./routes/finClientPortal";
import { finOnboardingRoutes } from "./routes/finOnboarding";
import { finPaymentApprovalRoutes } from "./routes/finPaymentApproval";
import { finReconcileRoutes } from "./routes/finReconcile";
import { finRevaluationRoutes } from "./routes/finRevaluation";
import { itparkAiRoutes } from "./routes/itparkAi";
import { itparkCaemRoutes } from "./routes/itparkCaem";
import { itparkCalcRoutes } from "./routes/itparkCalc";
import { itparkDashboardRoutes } from "./routes/itparkDashboard";
import { itparkDocsRoutes } from "./routes/itparkDocs";
import { itparkEngagementsRoutes } from "./routes/itparkEngagements";
import { itparkImportRoutes } from "./routes/itparkImport";
import { itparkLinesRoutes } from "./routes/itparkLines";
import { itparkSettingsRoutes } from "./routes/itparkSettings";

// PAR (Payment Action Request) module
import { parMeRoutes } from "./routes/parMe";
// VM1-13: AI prefill for PAR form fields
import { parAiPrefillRoutes } from "./routes/parAiPrefill";
import { parMembersRoutes } from "./routes/parMembers";
import { parPayersRoutes } from "./routes/parPayers";
import { parProfilesRoutes } from "./routes/parProfiles";
import { parSuggestionsRoutes } from "./routes/parSuggestions";
import { parDoaRoutes } from "./routes/parDoa";
import { parBudgetCodesRoutes } from "./routes/parBudgetCodes";
import { parDepartmentsRoutes } from "./routes/parDepartments";
import { parProjectsRoutes } from "./routes/parProjects";
import { parEventsRoutes } from "./routes/parEvents";
import { parVendorsRoutes } from "./routes/parVendors";
import { parSettingsRoutes } from "./routes/parSettings";
import { parRoutes } from "./routes/par";
import { parFxRoutes } from "./routes/parFx";
import { parAttachmentsRoutes } from "./routes/parAttachments";
import { parApprovalsRoutes } from "./routes/parApprovals";
import { parTimelineRoutes } from "./routes/parTimeline";
import { parPaymentsRoutes } from "./routes/parPayments";
import { parReportsRoutes } from "./routes/parReports";
// PAR procure-to-pay (ported from par-app)
import { parInvitesRoutes } from "./routes/parInvites";
import { parTemplatesRoutes } from "./routes/parTemplates";
import { parAuditRoutes } from "./routes/parAudit";
import { parActivityRoutes } from "./routes/parActivity";
import { parDelegationsRoutes } from "./routes/parDelegations";
import { parPurchaseOrderRoutes } from "./routes/parPurchaseOrders";
import { parReceiptsRoutes } from "./routes/parReceipts";

// VM1-02: PAR config import (projects/departments/budget codes from Excel)
import { parConfigImportRoutes } from "./routes/parConfigImport";
// PAR-EFP: e-Factura primită de la prestator după plată
import { parEfacturaRoutes } from "./routes/parEfactura";
import { platformAdminRoutes } from "./routes/platformAdmin";
import { impersonationRoutes } from "./routes/impersonation";
import { myModulesRoutes } from "./routes/myModules";
import { telemetryRoutes } from "./routes/telemetry";
import { platformInsightsRoutes } from "./routes/platformInsights";
import { getTimeout } from "./middleware/getTimeout";
import { errorCapture } from "./middleware/errorCapture";
import { recordError } from "./lib/errorTelemetry";
import { alertOwnerOnNewError } from "./lib/errorAlerts";
import { requireAuth } from "./middleware/requireAuth";
import { requireModuleEntitlement } from "./middleware/requireModuleEntitlement";
import { securityHeaders } from "./middleware/securityHeaders";
import { httpCache } from "./middleware/httpCache";
import { authRateLimit, expensiveRateLimit } from "./middleware/rateLimit";

// STMT module (STMT-001..004): Statement upload → review → e-Factura → history
import { finStatementRoutes } from "./routes/finStatement";

// AUTOBILL: daily recurring-billing cron (generate → e-Factura → email PDF)
import { finCronRoutes } from "./routes/finCron";

// DOCMERGE module (DOCMERGE-001)
import { docmergeTemplatesRoutes } from "./routes/docmergeTemplates";
import { docsRoutes } from "./routes/docs";

export const app = new Hono();

app.onError((err, c) => {
  console.error("[ERR]", err.message);
  // PLATFORM-002: excepțiile nu mai mor în log-ul serverului — ajung în Consola Platformă,
  // iar la primul lor tip nou pleacă și un email către proprietar. `void`: raportarea nu
  // are voie să întârzie sau să schimbe răspunsul dat clientului.
  void recordError({
    kind: "server_exception",
    message: err.message,
    stack: err.stack ?? null,
    location: new URL(c.req.url).pathname,
    method: c.req.method,
    statusCode: 500,
    userAgent: c.req.header("user-agent") ?? null,
  }).then((result) => {
    if (result?.isNew) {
      void alertOwnerOnNewError({
        groupId: result.groupId,
        kind: "server_exception",
        message: err.message,
        location: new URL(c.req.url).pathname,
      });
    }
  });
  return c.json({ error: err.message }, 500);
});

app.use("*", logger());

// PERF/SEC-001: headere de securitate + politică de cache pe TOT traficul (inclusiv fișierele
// statice servite de server/index.ts). Montate primele, ca să acopere și răspunsurile rutelor
// de mai jos, și fallback-ul SPA.
app.use("*", securityHeaders);
app.use("*", httpCache);

// PLATFORM-002: prinde orice 5xx și orice 404 pe /api/* (rută nemontată = bug real aici).
// Montat înaintea rutelor, ca să vadă răspunsul fiecăreia.
app.use("/api/*", errorCapture);

// PLATFORM-404: nicio CITIRE nu are voie să atârne la infinit. Fără plafonul ăsta, o interogare
// al cărei răspuns nu mai vine (socket mort către pooler) ținea invocația până la 504-ul lui
// Vercel, iar în interfață toate cererile tabului rămâneau blocate pe „Se încarcă…".
// Montat DUPĂ errorCapture, ca 503-ul să fie vizibil în Consola Platformă.
app.use("/api/*", getTimeout);

// SEC-002: limitare de rată pe autentificare, invitații și endpoint-urile AI (cost real per apel).
// Fără ea, POST /api/business/auth/login accepta un număr nelimitat de încercări de parolă.
// Montată DUPĂ errorCapture, ca un 429 să fie și el vizibil în Consola Platformă.
app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/signup", authRateLimit);
app.use("/api/auth/forgot-password", authRateLimit);
app.use("/api/auth/reset-password", authRateLimit);
app.use("/api/business/auth/login", authRateLimit);
app.use("/api/business/auth/signup", authRateLimit);
app.use("/api/business/auth/forgot-password", authRateLimit);
app.use("/api/business/auth/reset-password", authRateLimit);
app.use("/api/par/invites/accept", authRateLimit);
app.use("/api/par/ai-prefill/*", expensiveRateLimit);
app.use("/api/itpark/ai/*", expensiveRateLimit);

const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

app.use(
  "/api/*",
  cors({
    // SEC-001: o origine necunoscută NU mai primește niciun header CORS. Varianta anterioară
    // (`: allowedOrigins[0]`) răspundea oricărui site cu `Access-Control-Allow-Origin:
    // http://localhost:5173` plus `credentials: true` — un header greșit, care în plus masca
    // un `ALLOWED_ORIGINS` neconfigurat în loc să-l facă vizibil.
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    credentials: true,
  })
);

// Auth
app.route("/api/auth", authRoutes);
app.route("/api/auth/2fa", twoFactorRoutes);
app.route("/api/auth/sessions", sessionMgmtRoutes);
app.route("/api/business", businessAuthRoutes);

// CONT-PLATA: payment accounts
app.route("/api/registry", companyRegistryRoutes);
app.route("/api/seller-profile", sellerProfileRoutes);
app.route("/api/company-clients", companyClientRoutes);
app.route("/api/payment-accounts", paymentAccountRoutes);

// Cross-cutting UI: branch switcher dropdown + notification bell (used on every page)
app.route("/api/branches", branchRoutes);
app.route("/api/notifications", notificationRoutes);

// FinDesk Insights widgets (metrics / aging / cashflow forecast / saved views / narratives)
app.route("/api/analytics/fin", finAnalyticsRoutes);

// STMT-001..004: Statement routes — mounted BEFORE /api/fin to avoid /statement being shadowed
// by the broad /api/fin catch of finCapturesRoutes/finEinvoicesRoutes.
app.route("/api/fin/statement", finStatementRoutes);
app.route("/api/fin/cron", finCronRoutes);

// FinDesk
app.route("/api/fin/invoices", finInvoicesRoutes);
app.route("/api/fin/invoices", finInvoiceDocRoutes);
// finExpensesRoutes defines paths as "/expenses/*" internally, so mount at /api/fin
// (mounting at /api/fin/expenses doubled the segment → /api/fin/expenses/expenses/summary).
app.route("/api/fin", finExpensesRoutes);
// finCapturesRoutes defines "/captures/*" internally → mount at /api/fin
// (mounting at /api/fin/captures doubled the segment → /api/fin/captures/captures/summary 404'd).
app.route("/api/fin", finCapturesRoutes);
app.route("/api/fin/ledger", finLedgerRoutes);
app.route("/api/fin/budget", finBudgetRoutes);
app.route("/api/fin/cash", finCashAllocationsRoutes);
app.route("/api/fin/cash", finCashRoutes);
// Frontend calls /api/fin/banklink (no hyphen) — mount must match or every bank-link call 404s.
app.route("/api/fin/banklink", finBankLinkRoutes);
app.route("/api/fin/mass", finMassRoutes);
app.route("/api/fin/members", finMembersRoutes);
// finOrgRoutes defines "/org", "/series", "/series/:id" internally, so mount at /api/fin —
// mounting at /api/fin/org doubled the segment → /api/fin/org/org 404'd every profile load/save
// (live: error_groups "route_not_found" at /api/fin/org, first seen 2026-08-10, still open).
app.route("/api/fin", finOrgRoutes);
app.route("/api/fin/parties", finPartiesRoutes);
app.route("/api/fin/agreements", finAgreementsRoutes);
app.route("/api/fin/inventory", finInventoryRoutes);
app.route("/api/fin/assets", finAssetsRoutes);
app.route("/api/fin/payroll", finPayrollRoutes);
app.route("/api/fin/tax", finTaxRoutes);
app.route("/api/fin/calendar", finCalendarRoutes);
app.route("/api/fin/export", finExportRoutes);
app.route("/api/fin/registry", finRegistryRoutes);
// finEinvoicesRoutes defines "/einvoices/*" and "/sfs-settings" internally → mount at /api/fin.
app.route("/api/fin", finEinvoicesRoutes);
app.route("/api/fin/exchange-rates", finExchangeRatesRoutes);
app.route("/api/fin/ai-audit", finAiAuditRoutes);
app.route("/api/fin/gdpr", finGdprRoutes);
app.route("/api/fin/data-settings", finDataSettingsRoutes);
app.route("/api/fin/client-portal", finClientPortalRoutes);
// ITPark clients and route modules use the standalone /api/itpark namespace.
// Mounting them under /api/fin/itpark made every ITPark dashboard/list request 404.
app.route("/api/itpark/ai", itparkAiRoutes);
app.route("/api/itpark/caem-codes", itparkCaemRoutes);
app.route("/api/itpark/calc", itparkCalcRoutes);
app.route("/api/itpark/dashboard", itparkDashboardRoutes);
app.route("/api/itpark/docs", itparkDocsRoutes);
app.route("/api/itpark/engagements", itparkEngagementsRoutes);
app.route("/api/itpark/import", itparkImportRoutes);
app.route("/api/itpark/lines", itparkLinesRoutes);
app.route("/api/itpark/settings", itparkSettingsRoutes);
app.route("/api/fin/onboarding", finOnboardingRoutes);
app.route("/api/fin/payment-approval", finPaymentApprovalRoutes);
app.route("/api/fin/reconcile", finReconcileRoutes);
app.route("/api/fin/revaluation", finRevaluationRoutes);

// PAR module
app.use("/api/par", requireAuth);
app.use("/api/par/*", requireAuth);
app.use("/api/par", requireModuleEntitlement("par"));
app.use("/api/par/*", requireModuleEntitlement("par"));
app.route("/api/par/me", parMeRoutes);
app.route("/api/par/ai-prefill", parAiPrefillRoutes);
app.route("/api/par/config-import", parConfigImportRoutes);
app.route("/api/par/members", parMembersRoutes);
app.route("/api/par/payers", parPayersRoutes);
app.route("/api/par/profiles", parProfilesRoutes);
app.route("/api/par/suggestions", parSuggestionsRoutes);
app.route("/api/par/doa", parDoaRoutes);
app.route("/api/par/budget-codes", parBudgetCodesRoutes);
app.route("/api/par/departments", parDepartmentsRoutes);
app.route("/api/par/projects", parProjectsRoutes);
app.route("/api/par/events", parEventsRoutes);
app.route("/api/par/vendors", parVendorsRoutes);
app.route("/api/par/settings", parSettingsRoutes);
app.route("/api/par/efactura", parEfacturaRoutes);
app.route("/api/par/fx", parFxRoutes);
app.route("/api/par/invites", parInvitesRoutes);
app.route("/api/par/templates", parTemplatesRoutes);
app.route("/api/par/reports", parReportsRoutes);
app.route("/api/par/audit", parAuditRoutes);
app.route("/api/par/activity", parActivityRoutes);
app.route("/api/par/delegations", parDelegationsRoutes);
app.route("/api/par", parPaymentsRoutes);
app.route("/api/par", parApprovalsRoutes);
app.route("/api/par", parTimelineRoutes);
app.route("/api/par", parPurchaseOrderRoutes);
app.route("/api/par", parReceiptsRoutes);
app.route("/api/par", parRoutes);
app.route("/api/par", parAttachmentsRoutes);

// Platform operations (global superadmin only)
app.route("/api/platform", platformAdminRoutes);
app.route("/api/impersonation", impersonationRoutes);
// PLATFORM-002: erorile clienților + semnalele de creștere (același prefix, router separat,
// cu propriile requireAuth + requirePlatformAdmin — nu moștenește nimic de la vecin).
app.route("/api/platform", platformInsightsRoutes);
// PLATFORM-001: ce module vede workspace-ul curent (citit de shell-ul FinFlow).
app.route("/api/modules", myModulesRoutes);
// PLATFORM-002: raportarea erorilor din browser (public — vezi routes/telemetry.ts).
app.route("/api/telemetry", telemetryRoutes);

// DOCMERGE-001: Document Merge templates
app.route("/api/docmerge", docmergeTemplatesRoutes);
// DG-102: registrul de acte (generare documente → PDF → PAR)
app.route("/api/docs", docsRoutes);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableRows = (Array.isArray(tablesResult) ? tablesResult : (tablesResult as any).rows) as
      | Array<{ table_count: number }>
      | undefined;
    const tableRow = tableRows?.[0];
    const [tenantCount] = await db.select({ c: sql<number>`count(*)::int` }).from(tenants);
    const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    return c.json({
      ok: true,
      tables: tableRow?.table_count ?? 0,
      counts: { tenants: tenantCount.c, users: userCount.c },
    });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "unknown" }, 503);
  }
});

/**
 * PLATFORM-002 — plasa de la capătul lui `/api/*`.
 *
 * Fără ea, o cerere către o rută API care NU există cade în fallback-ul SPA și primește
 * `200` + index.html. Clientul face `JSON.parse("<!doctype …")` și pagina crapă cu
 * „Unexpected token '<'" — clasa de bug-uri #1 din acest repo (44 de routere au fost odată
 * orfane, iar simptomul arăta ca o pagină stricată, nu ca o rută lipsă).
 *
 * Declarată DUPĂ toate `app.route(...)`, deci prinde exact ce n-a fost montat. Răspunde
 * JSON, ca frontend-ul să primească o eroare pe care o poate citi, iar `errorCapture` să o
 * poată raporta ca `api_route_missing`.
 */
app.all("/api/*", (c) => c.json({ error: "route_not_found", path: new URL(c.req.url).pathname }, 404));

export default app;
