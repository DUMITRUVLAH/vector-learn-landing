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

// DOCMERGE module routes
import { DocMergeTemplatesPage } from "./pages/business/docmerge/DocMergeTemplatesPage";
import { DocMergeJobPage } from "./pages/business/docmerge/DocMergeJobPage";
import { DocMergeWizardPage } from "./pages/business/docmerge/DocMergeWizardPage";

// Business / FinDesk routes
import { BusinessLandingPage } from "./pages/business/BusinessLandingPage";
import { BusinessLoginPage } from "./pages/business/BusinessLoginPage";
import { BusinessDashboardPage } from "./pages/business/BusinessDashboardPage";
import { BusinessGuardPage } from "./components/business/BusinessGuardPage";

// FinDesk pages under /business/fin/*
import { FinHome } from "./pages/fin/FinHome";
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

function Routes() {
  const { path } = useRouter();

  // Root → redirect to /business
  if (path === "/" || path === "") return <RedirectToBusiness />;

  // PAR routes under /app/par/*
  if (path.startsWith("/app/par/onboarding")) return <ParOnboarding />;
  if (path.startsWith("/app/par/new")) return <ParCreateForm />;
  if (path.startsWith("/app/par/inbox")) return <ParInbox />;
  if (path.startsWith("/app/par/finance")) return <ParFinanceQueue />;
  if (path.startsWith("/app/par/admin")) return <ParAdminPage />;
  if (path.startsWith("/app/par/reports")) return <ParReports />;
  if (path.match(/^\/app\/par\/[^/]+$/)) return <ParDetailPage />;
  if (path.startsWith("/app/par")) return <ParDashboard />;

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
  if (path.startsWith("/business/fin/reconcile")) return <BusinessGuardPage><ReconcilePage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payments")) return <BusinessGuardPage><Suspense fallback={null}><FinPaymentsPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/calendar")) return <BusinessGuardPage><Suspense fallback={null}><FinCalendarPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkPage /></Suspense></BusinessGuardPage>;
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
  if (path.startsWith("/business/fin/")) return <BusinessGuardPage><FinHome /></BusinessGuardPage>;

  // PAR routes under /business/par/*
  if (path.startsWith("/business/par/onboarding")) return <BusinessGuardPage><ParOnboarding /></BusinessGuardPage>;
  if (path.startsWith("/business/par/new")) return <BusinessGuardPage><ParCreateForm /></BusinessGuardPage>;
  if (path.startsWith("/business/par/inbox")) return <BusinessGuardPage><ParInbox /></BusinessGuardPage>;
  if (path.startsWith("/business/par/finance")) return <BusinessGuardPage><ParFinanceQueue /></BusinessGuardPage>;
  if (path.startsWith("/business/par/admin")) return <BusinessGuardPage><ParAdminPage /></BusinessGuardPage>;
  if (path.startsWith("/business/par/reports")) return <BusinessGuardPage><ParReports /></BusinessGuardPage>;
  if (path.match(/^\/business\/par\/[^/]+$/)) return <BusinessGuardPage><ParDetailPage /></BusinessGuardPage>;
  if (path.startsWith("/business/par")) return <BusinessGuardPage><ParDashboard /></BusinessGuardPage>;

  // DOCMERGE-001/002/003/004: Document Merge — more specific routes first
  if (path.startsWith("/business/docmerge/wizard")) return <BusinessGuardPage><DocMergeWizardPage /></BusinessGuardPage>;
  if (path.startsWith("/business/docmerge/job")) return <BusinessGuardPage><DocMergeJobPage /></BusinessGuardPage>;
  if (path.startsWith("/business/docmerge")) return <BusinessGuardPage><DocMergeTemplatesPage /></BusinessGuardPage>;

  // Payment accounts (cont de plată)
  if (path.startsWith("/app/conturi-plata/nou")) return <BusinessGuardPage><PaymentAccountEditorPage /></BusinessGuardPage>;
  {
    const editMatch = path.match(/^\/app\/conturi-plata\/([^/?]+)\/editeaza/);
    if (editMatch) return <BusinessGuardPage><PaymentAccountEditorPage accountId={editMatch[1]} /></BusinessGuardPage>;
    const viewMatch = path.match(/^\/app\/conturi-plata\/([^/?]+)/);
    if (viewMatch) return <BusinessGuardPage><PaymentAccountViewPage accountId={viewMatch[1]} /></BusinessGuardPage>;
  }
  if (path.startsWith("/app/conturi-plata")) return <BusinessGuardPage><PaymentAccountsPage /></BusinessGuardPage>;

  // Parties detail
  if (path.match(/^\/business\/fin\/parties\/[^/]+$/)) return <BusinessGuardPage><PartyDetailPage /></BusinessGuardPage>;

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
