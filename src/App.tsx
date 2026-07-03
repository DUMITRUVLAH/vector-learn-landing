import { HashRouter, useRouter } from "./router/HashRouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BranchProvider } from "./contexts/BranchContext";
import { useEffect } from "react";

// PAR routes
import { ParCreateForm } from "./pages/par/ParCreateForm";
import { ParOnboarding } from "./pages/par/ParOnboarding";
import { ParDashboard } from "./pages/par/ParDashboard";
import ParInbox from "./pages/par/ParInbox";
import ParFinanceQueue from "./pages/par/ParFinanceQueue";
import { ParDetailPage } from "./pages/par/ParDetail";
import { ParAdmin } from "./pages/par/ParAdmin";
import { ParReports } from "./pages/par/ParReports";
import { ParFolders } from "./pages/par/ParFolders";

// DOCMERGE module routes
import { DocMergeTemplatesPage } from "./pages/business/docmerge/DocMergeTemplatesPage";
import { DocMergeJobPage } from "./pages/business/docmerge/DocMergeJobPage";
import { DocMergeWizardPage } from "./pages/business/docmerge/DocMergeWizardPage";

// Business / FinDesk routes
import { BusinessLandingPage } from "./pages/business/BusinessLandingPage";
import { BusinessLoginPage } from "./pages/business/BusinessLoginPage";
import { BusinessDashboardPage } from "./pages/business/BusinessDashboardPage";
import { BusinessGuardPage } from "./components/business/BusinessGuardPage";
import { ParGuardPage } from "./components/par/ParGuardPage";
// SHELL-503: PAR invite acceptance (public — no auth guard)
import { InvitePage } from "./pages/business/InvitePage";
import { WelcomePage } from "./pages/business/WelcomePage";

// FinDesk pages under /business/fin/*
import { FinHome } from "./pages/fin/FinHome";
import { FinCompany } from "./pages/fin/FinCompany";
import { FinOnboarding } from "./pages/fin/FinOnboarding";
import { FinAiAuditPage } from "./pages/fin/FinAiAuditPage";
import { FinSecuritySettingsPage } from "./pages/fin/FinSecuritySettingsPage";

// FinDesk app pages
import CapturesListPage from "./pages/fin/CapturesListPage";
import CapturePage from "./pages/fin/CapturePage";
import { FinInvoicesPage } from "./pages/app/FinInvoicesPage";
import { FinInvoiceDocPage } from "./pages/app/FinInvoiceDocPage";
import { FinExpensesPage } from "./pages/app/FinExpensesPage";
import { FinRegistryPage } from "./pages/app/FinRegistryPage";
import { FinEinvoicesPage } from "./pages/app/FinEinvoicesPage";
import { BudgetPage } from "./pages/app/BudgetPage";
import { AssetsPage } from "./pages/app/AssetsPage";
import { RevaluationPage } from "./pages/app/RevaluationPage";
import { InventoryPage } from "./pages/app/InventoryPage";
import { InventoryReportPage } from "./pages/app/InventoryReportPage";
import { PaymentAccountsPage } from "./pages/app/PaymentAccountsPage";
import { PaymentAccountEditorPage } from "./pages/app/PaymentAccountEditorPage";
import { PaymentAccountViewPage } from "./pages/app/PaymentAccountViewPage";
// FIX-502: Use FinDesk payroll pages (pages/fin/*) not the CRM payroll page (pages/app/PayrollPage).
// The CRM page calls /api/hr/payroll which is NOT mounted; FinDesk pages call /api/fin/payroll/* which IS mounted.
import { PayrollFINPage } from "./pages/fin/PayrollPage";
import { PayrollEmployeesPage } from "./pages/fin/PayrollEmployeesPage";
import { PayrollRunDetailPage } from "./pages/fin/PayrollRunDetailPage";
import ReconcilePage from "./pages/fin/ReconcilePage";
import CashPage from "./pages/fin/CashPage";
import { PartiesPage } from "./pages/app/fin/PartiesPage";
import { PartyDetailPage } from "./pages/app/fin/PartyDetailPage";
import { FinExportCenter } from "./pages/app/fin/ExportCenter";
import ItparkDetail from "./pages/app/fin/itpark/ItparkDetail";
import { FinInsightsPage } from "./pages/finance/FinInsightsPage";

import { lazy, Suspense, useState, useEffect as _useEffect } from "react";
import { getParMe } from "./lib/api/par";

// STMT-001..004: Statement pages
const StatementUploadPage = lazy(() => import("./pages/fin/StatementUploadPage"));
const StatementReviewPage = lazy(() => import("./pages/fin/StatementReviewPage"));
const StatementHistoryPage = lazy(() => import("./pages/fin/StatementHistoryPage"));

const BankLinkPage = lazy(() => import("./pages/fin/BankLinkPage"));
const BankLinkImportPage = lazy(() => import("./pages/fin/BankLinkImportPage"));
const BankLinkQueuePage = lazy(() => import("./pages/fin/BankLinkQueuePage"));
const BankLinkTransactionsPage = lazy(() => import("./pages/fin/BankLinkTransactionsPage"));
const AgreementsPage = lazy(() => import("./pages/fin/AgreementsPage").then(m => ({ default: m.AgreementsPage })));
const CashImportPage = lazy(() => import("./pages/fin/CashImportPage"));
const FinCalendarPage = lazy(() => import("./pages/fin/FinCalendarPage").then(m => ({ default: m.FinCalendarPage })));
const FinMassPage = lazy(() => import("./pages/fin/FinMassPage").then(m => ({ default: m.FinMassPage })));
const TaxPage = lazy(() => import("./pages/fin/TaxPage").then(m => ({ default: m.TaxPage })));
const FinPaymentsPage = lazy(() => import("./pages/fin/PaymentsPage"));

function ParAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  _useEffect(() => {
    getParMe()
      .then((r) => setIsAdmin(r.roles.includes("par_admin")))
      .catch(() => setIsAdmin(false));
  }, []);
  if (isAdmin === null) return null;
  return <ParAdmin isAdmin={isAdmin} />;
}

function RedirectToBusiness() {
  useEffect(() => {
    window.location.hash = "/business";
  }, []);
  return null;
}

/**
 * SHELL-501: redirect a legacy /app/* business path to its /business/* canonical.
 * Business modules (PAR, Cont de plată) used to live under /app/*, where AppShell renders
 * the CRM sidebar (with the grădiniță/kinder section). Canonicalizing them under /business/*
 * means they always render BusinessShell — no CRM-shell leak, no double-sidebar flash.
 */
function RedirectHash({ to }: { to: string }) {
  useEffect(() => {
    window.location.hash = to;
  }, [to]);
  return null;
}

function Routes() {
  const { path } = useRouter();

  // Root → redirect to /business
  if (path === "/" || path === "") return <RedirectToBusiness />;

  // SHELL-501: PAR is a business module — its canonical home is /business/par/* (BusinessShell).
  // Redirect any legacy /app/par/* link to /business/par/* so it never renders the CRM shell
  // (which would show the grădiniță sidebar) and never causes the double-sidebar flash.
  if (path.startsWith("/app/par")) return <RedirectHash to={path.replace("/app/par", "/business/par")} />;

  // SHELL-503: legacy invite URL redirect — /app/invite → /business/invite (preserves query string).
  // The query string is in the hash, so reconstruct it with whatever follows "?".
  if (path.startsWith("/app/invite")) {
    const qIdx = window.location.hash.indexOf("?");
    const qs = qIdx !== -1 ? window.location.hash.slice(qIdx) : "";
    return <RedirectHash to={`/business/invite${qs}`} />;
  }

  // SHELL-503: PAR invite acceptance page — PUBLIC (no BusinessGuard).
  // Must be before BusinessGuard so unauthenticated invitees can land here.
  if (path.startsWith("/business/invite")) return <InvitePage />;

  // SHELL-504: Google "create or join a workspace" choice screen — PUBLIC (relies on the
  // short-lived pending-identity cookie set by the Google callback, not on a session).
  if (path.startsWith("/business/welcome")) return <WelcomePage />;

  // Business landing + login
  if (path === "/business" || path === "/business/") return <BusinessLandingPage />;
  if (path.startsWith("/business/login")) return <BusinessLoginPage />;
  if (path.startsWith("/business/dashboard")) return <BusinessDashboardPage />;

  // FinDesk routes under /business/fin/*
  if (path.startsWith("/business/fin/banklink/transactions")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkTransactionsPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payroll/employees")) return <BusinessGuardPage><PayrollEmployeesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/settings/ai-audit")) return <BusinessGuardPage><FinAiAuditPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/settings/security")) return <BusinessGuardPage><FinSecuritySettingsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/inventory/report")) return <BusinessGuardPage><InventoryReportPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink/import")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkImportPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink/queue")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkQueuePage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/cash/import")) return <BusinessGuardPage><Suspense fallback={null}><CashImportPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/revaluation")) return <BusinessGuardPage><RevaluationPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/agreements")) return <BusinessGuardPage><Suspense fallback={null}><AgreementsPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/einvoices")) return <BusinessGuardPage><FinEinvoicesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/inventory")) return <BusinessGuardPage><InventoryPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/registry")) return <BusinessGuardPage><FinRegistryPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/invoices/document")) return <BusinessGuardPage><FinInvoiceDocPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/invoices")) return <BusinessGuardPage><FinInvoicesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/expenses")) return <BusinessGuardPage><FinExpensesPage /></BusinessGuardPage>;
  {
    // Invoice Reporting (captures): detail /business/fin/captures/:id before the list.
    const capMatch = path.match(/^\/business\/fin\/captures\/([^/?]+)/);
    if (capMatch) return <BusinessGuardPage><CapturePage captureId={capMatch[1]} /></BusinessGuardPage>;
  }
  if (path.startsWith("/business/fin/captures")) return <BusinessGuardPage><CapturesListPage /></BusinessGuardPage>;

  // STMT-001..004: Statement routes — most-specific prefix first
  if (path.startsWith("/business/fin/statement/upload"))
    return <BusinessGuardPage><Suspense fallback={null}><StatementUploadPage /></Suspense></BusinessGuardPage>;
  {
    const stmtMatch = path.match(/^\/business\/fin\/statement\/([^/?]+)/);
    if (stmtMatch)
      return <BusinessGuardPage><Suspense fallback={null}><StatementReviewPage captureId={stmtMatch[1]} /></Suspense></BusinessGuardPage>;
  }
  if (path.startsWith("/business/fin/statement"))
    return <BusinessGuardPage><Suspense fallback={null}><StatementHistoryPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/reconcile")) return <BusinessGuardPage><ReconcilePage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payments")) return <BusinessGuardPage><Suspense fallback={null}><FinPaymentsPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/calendar")) return <BusinessGuardPage><Suspense fallback={null}><FinCalendarPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkPage /></Suspense></BusinessGuardPage>;
  // AUTOBILL: the exact detail route MUST be matched before the startsWith list route below,
  // otherwise /business/fin/parties/:id renders the LIST (the detail route further down was
  // dead code) and clicking a partner appeared to "throw".
  if (path.match(/^\/business\/fin\/parties\/[^/]+$/)) return <BusinessGuardPage><PartyDetailPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/parties")) return <BusinessGuardPage><PartiesPage /></BusinessGuardPage>;
  // FIX-502: /business/fin/payroll/runs/:id must be matched before the list route
  if (path.match(/^\/business\/fin\/payroll\/runs\/[^/]+/)) return <BusinessGuardPage><PayrollRunDetailPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payroll")) return <BusinessGuardPage><PayrollFINPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/itpark")) return <BusinessGuardPage><ItparkDetail /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/assets")) return <BusinessGuardPage><AssetsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/ledger")) return <BusinessGuardPage><FinInsightsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/budget")) return <BusinessGuardPage><BudgetPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/export")) return <BusinessGuardPage><FinExportCenter /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/cash")) return <BusinessGuardPage><CashPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/mass")) return <BusinessGuardPage><Suspense fallback={null}><FinMassPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/tax")) return <BusinessGuardPage><Suspense fallback={null}><TaxPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/onboarding")) return <BusinessGuardPage><FinOnboarding /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/company")) return <BusinessGuardPage><FinCompany /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/")) return <BusinessGuardPage><FinHome /></BusinessGuardPage>;

  // PAR routes under /business/par/* — ParGuardPage (VM1-01 Decizia 9) hides the whole
  // module from users with zero PAR roles, even on direct URL access.
  if (path.startsWith("/business/par/onboarding")) return <BusinessGuardPage><ParGuardPage><ParOnboarding /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/new")) return <BusinessGuardPage><ParGuardPage><ParCreateForm /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/inbox")) return <BusinessGuardPage><ParGuardPage><ParInbox /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/finance")) return <BusinessGuardPage><ParGuardPage><ParFinanceQueue /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/admin")) return <BusinessGuardPage><ParGuardPage><ParAdminPage /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/folders")) return <BusinessGuardPage><ParGuardPage><ParFolders /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/reports")) return <BusinessGuardPage><ParGuardPage><ParReports /></ParGuardPage></BusinessGuardPage>;
  if (path.match(/^\/business\/par\/[^/]+$/)) return <BusinessGuardPage><ParGuardPage><ParDetailPage /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par")) return <BusinessGuardPage><ParGuardPage><ParDashboard /></ParGuardPage></BusinessGuardPage>;

  // DOCMERGE-001/002/003/004: Document Merge — more specific routes first
  if (path.startsWith("/business/docmerge/wizard")) return <BusinessGuardPage><DocMergeWizardPage /></BusinessGuardPage>;
  if (path.startsWith("/business/docmerge/job")) return <BusinessGuardPage><DocMergeJobPage /></BusinessGuardPage>;
  if (path.startsWith("/business/docmerge")) return <BusinessGuardPage><DocMergeTemplatesPage /></BusinessGuardPage>;

  // Payment accounts (cont de plată) — business module, canonical under /business/conturi-plata.
  // SHELL-501: redirect legacy /app/conturi-plata/* so it renders BusinessShell, not the CRM shell.
  if (path.startsWith("/app/conturi-plata")) return <RedirectHash to={path.replace("/app/conturi-plata", "/business/conturi-plata")} />;
  if (path.startsWith("/business/conturi-plata/nou")) return <BusinessGuardPage><PaymentAccountEditorPage /></BusinessGuardPage>;
  {
    const editMatch = path.match(/^\/business\/conturi-plata\/([^/?]+)\/editeaza/);
    if (editMatch) return <BusinessGuardPage><PaymentAccountEditorPage accountId={editMatch[1]} /></BusinessGuardPage>;
    const viewMatch = path.match(/^\/business\/conturi-plata\/([^/?]+)/);
    if (viewMatch) return <BusinessGuardPage><PaymentAccountViewPage accountId={viewMatch[1]} /></BusinessGuardPage>;
  }
  if (path.startsWith("/business/conturi-plata")) return <BusinessGuardPage><PaymentAccountsPage /></BusinessGuardPage>;

  // (Parties detail is matched above, before the /business/fin/parties list route.)

  // Fallback: orice altceva → /business
  return <RedirectToBusiness />;
}

function BoundedRoutes() {
  const { path } = useRouter();
  return (
    <ErrorBoundary resetKey={path}>
      <Routes />
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BranchProvider>
      <HashRouter>
        <BoundedRoutes />
      </HashRouter>
    </BranchProvider>
  );
}
