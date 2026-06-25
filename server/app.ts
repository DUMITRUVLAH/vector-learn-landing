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
import { parMembersRoutes } from "./routes/parMembers";
import { parDoaRoutes } from "./routes/parDoa";
import { parBudgetCodesRoutes } from "./routes/parBudgetCodes";
import { parDepartmentsRoutes } from "./routes/parDepartments";
import { parProjectsRoutes } from "./routes/parProjects";
import { parEventsRoutes } from "./routes/parEvents";
import { parVendorsRoutes } from "./routes/parVendors";
import { parSettingsRoutes } from "./routes/parSettings";
import { parRoutes } from "./routes/par";
import { parAttachmentsRoutes } from "./routes/parAttachments";
import { parApprovalsRoutes } from "./routes/parApprovals";
import { parTimelineRoutes } from "./routes/parTimeline";
import { parPaymentsRoutes } from "./routes/parPayments";
import { parReportsRoutes } from "./routes/parReports";
// PAR procure-to-pay (ported from par-app)
import { parInvitesRoutes } from "./routes/parInvites";
import { parTemplatesRoutes } from "./routes/parTemplates";
import { parAuditRoutes } from "./routes/parAudit";
import { parDelegationsRoutes } from "./routes/parDelegations";
import { parPurchaseOrderRoutes } from "./routes/parPurchaseOrders";
import { parReceiptsRoutes } from "./routes/parReceipts";

// DOCMERGE module (DOCMERGE-001)
import { docmergeTemplatesRoutes } from "./routes/docmergeTemplates";

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
app.route("/api/fin/org", finOrgRoutes);
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
app.route("/api/fin/itpark/ai", itparkAiRoutes);
app.route("/api/fin/itpark/caem", itparkCaemRoutes);
app.route("/api/fin/itpark/calc", itparkCalcRoutes);
app.route("/api/fin/itpark/dashboard", itparkDashboardRoutes);
app.route("/api/fin/itpark/docs", itparkDocsRoutes);
app.route("/api/fin/itpark/engagements", itparkEngagementsRoutes);
app.route("/api/fin/itpark/import", itparkImportRoutes);
app.route("/api/fin/itpark/lines", itparkLinesRoutes);
app.route("/api/fin/itpark/settings", itparkSettingsRoutes);
app.route("/api/fin/onboarding", finOnboardingRoutes);
app.route("/api/fin/payment-approval", finPaymentApprovalRoutes);
app.route("/api/fin/reconcile", finReconcileRoutes);
app.route("/api/fin/revaluation", finRevaluationRoutes);

// PAR module
app.route("/api/par/me", parMeRoutes);
app.route("/api/par/members", parMembersRoutes);
app.route("/api/par/doa", parDoaRoutes);
app.route("/api/par/budget-codes", parBudgetCodesRoutes);
app.route("/api/par/departments", parDepartmentsRoutes);
app.route("/api/par/projects", parProjectsRoutes);
app.route("/api/par/events", parEventsRoutes);
app.route("/api/par/vendors", parVendorsRoutes);
app.route("/api/par/settings", parSettingsRoutes);
app.route("/api/par/invites", parInvitesRoutes);
app.route("/api/par/templates", parTemplatesRoutes);
app.route("/api/par/reports", parReportsRoutes);
app.route("/api/par/audit", parAuditRoutes);
app.route("/api/par/delegations", parDelegationsRoutes);
app.route("/api/par", parPaymentsRoutes);
app.route("/api/par", parApprovalsRoutes);
app.route("/api/par", parTimelineRoutes);
app.route("/api/par", parPurchaseOrderRoutes);
app.route("/api/par", parReceiptsRoutes);
app.route("/api/par", parRoutes);
app.route("/api/par", parAttachmentsRoutes);

// DOCMERGE-001: Document Merge templates
app.route("/api/docmerge", docmergeTemplatesRoutes);

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

export default app;
