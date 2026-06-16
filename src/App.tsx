import { HashRouter, useRouter } from "./router/HashRouter";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { TrustBar } from "./components/TrustBar";
import { Features } from "./components/Features";
import { Stats } from "./components/Stats";
import { Integrations } from "./components/Integrations";
import { Comparison } from "./components/Comparison";
import { Pricing } from "./components/Pricing";
import { Testimonials } from "./components/Testimonials";
import { FAQ } from "./components/FAQ";
import { CTA } from "./components/CTA";
import { Footer } from "./components/Footer";
import { BackendStatusBadge } from "./components/BackendStatusBadge";
import { ErrorBoundary } from "./components/ErrorBoundary";

// PAR routes
import { ParCreateWizard } from "./pages/par/ParCreateWizard";
import { ParDashboard } from "./pages/par/ParDashboard";
import ParInbox from "./pages/par/ParInbox";
import ParFinanceQueue from "./pages/par/ParFinanceQueue";
import ParDetailPage from "./pages/par/ParDetail";
import ParAdmin from "./pages/par/ParAdmin";
import { ParReports } from "./pages/par/ParReports";

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
import { PayrollPage } from "./pages/app/PayrollPage";
import ReconcilePage from "./pages/fin/ReconcilePage";
import CashPage from "./pages/fin/CashPage";
import { PartiesPage } from "./pages/app/fin/PartiesPage";
import { PartyDetailPage } from "./pages/app/fin/PartyDetailPage";
import { FinExportCenter } from "./pages/app/fin/ExportCenter";
import ItparkDetail from "./pages/app/fin/itpark/ItparkDetail";
import { FinInsightsPage } from "./pages/finance/FinInsightsPage";

// Lazy-loaded heavy pages
import { lazy, Suspense, useState, useEffect } from "react";
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

/** PAR-116: Role-aware wrapper */
function ParAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    getParMe()
      .then((r) => setIsAdmin(r.roles.includes("par_admin")))
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) return null;
  return <ParAdmin isAdmin={isAdmin} />;
}

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <Features />
        <Stats />
        <Integrations />
        <Comparison />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

function Routes() {
  const { path } = useRouter();

  // PAR routes under /app/par/*
  if (path.startsWith("/app/par/new")) return <ParCreateWizard />;
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
  if (path.startsWith("/business/fin/payroll/employees")) return <BusinessGuardPage><PayrollPage /></BusinessGuardPage>;
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
  if (path.startsWith("/business/fin/captures")) return <BusinessGuardPage><FinRegistryPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/reconcile")) return <BusinessGuardPage><ReconcilePage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payments")) return <BusinessGuardPage><Suspense fallback={null}><FinPaymentsPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/calendar")) return <BusinessGuardPage><Suspense fallback={null}><FinCalendarPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink")) return <BusinessGuardPage><Suspense fallback={null}><BankLinkPage /></Suspense></BusinessGuardPage>;
  if (path.startsWith("/business/fin/parties")) return <BusinessGuardPage><PartiesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payroll")) return <BusinessGuardPage><PayrollPage /></BusinessGuardPage>;
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
  if (path.startsWith("/business/par/new")) return <BusinessGuardPage><ParCreateWizard /></BusinessGuardPage>;
  if (path.startsWith("/business/par/inbox")) return <BusinessGuardPage><ParInbox /></BusinessGuardPage>;
  if (path.startsWith("/business/par/finance")) return <BusinessGuardPage><ParFinanceQueue /></BusinessGuardPage>;
  if (path.startsWith("/business/par/admin")) return <BusinessGuardPage><ParAdminPage /></BusinessGuardPage>;
  if (path.startsWith("/business/par/reports")) return <BusinessGuardPage><ParReports /></BusinessGuardPage>;
  if (path.match(/^\/business\/par\/[^/]+$/)) return <BusinessGuardPage><ParDetailPage /></BusinessGuardPage>;
  if (path.startsWith("/business/par")) return <BusinessGuardPage><ParDashboard /></BusinessGuardPage>;

  // Payment accounts (cont de plată)
  if (path.startsWith("/app/conturi-plata/setari")) return <BusinessGuardPage><PaymentAccountEditorPage /></BusinessGuardPage>;
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

  return <HomePage />;
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
    <HashRouter>
      <BoundedRoutes />
      {import.meta.env.DEV && <BackendStatusBadge />}
    </HashRouter>
  );
}
