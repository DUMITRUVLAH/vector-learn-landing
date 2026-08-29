import { HashRouter, useRouter } from "./router/HashRouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BranchProvider } from "./contexts/BranchContext";
import { Suspense, useEffect, useState } from "react";
import { getParMe } from "./lib/api/par";
import { RouteFallback } from "./components/RouteFallback";
import { lazyWithTimeout } from "./lib/lazyWithTimeout";

/**
 * PERF-003 — fiecare pagină e un chunk separat.
 *
 * Înainte, acest fișier importa STATIC ~60 de pagini. Rezultatul măsurat: un singur bundle de
 * 3,06 MB (669 KB gzip), descărcat integral inclusiv de cineva care doar deschide ecranul de
 * login. Prin importurile statice intrau în el și `recharts` (via ParReports), `jspdf` +
 * `html2canvas` (via ParDetail → parPdf) și `qrcode` — biblioteci de care 90% dintre sesiuni
 * n-au nevoie niciodată.
 *
 * `lazy()` face ca fiecare rută să-și aducă propriul cod la prima vizită și doar atunci.
 * Excepțiile eager, intenționat: infrastructura shell-ului (router, guard-uri, error boundary)
 * și primele două ecrane pe care le vede un utilizator nelogat (landing + login) — pentru ele,
 * un chunk separat ar însemna un dus-întors în plus exact pe calea critică.
 */

// Guard-uri + shell — eager (apar pe fiecare rută, n-au ce câștiga dintr-un chunk separat).
import { BusinessGuardPage } from "./components/business/BusinessGuardPage";
import { ParGuardPage } from "./components/par/ParGuardPage";
// Primul ecran pentru un utilizator nelogat — eager, ca să nu adauge un dus-întors la login.
import { BusinessLandingPage } from "./pages/business/BusinessLandingPage";
import { BusinessLoginPage } from "./pages/business/BusinessLoginPage";

// PAR
const ParCreateForm = lazyWithTimeout(() => import("./pages/par/ParCreateForm").then((m) => ({ default: m.ParCreateForm })));
const ParOnboarding = lazyWithTimeout(() => import("./pages/par/ParOnboarding").then((m) => ({ default: m.ParOnboarding })));
const ParDashboard = lazyWithTimeout(() => import("./pages/par/ParDashboard").then((m) => ({ default: m.ParDashboard })));
const ParInbox = lazyWithTimeout(() => import("./pages/par/ParInbox"));
const ParFinanceQueue = lazyWithTimeout(() => import("./pages/par/ParFinanceQueue"));
const ParDetailPage = lazyWithTimeout(() => import("./pages/par/ParDetail").then((m) => ({ default: m.ParDetailPage })));
const ParAdmin = lazyWithTimeout(() => import("./pages/par/ParAdmin").then((m) => ({ default: m.ParAdmin })));
const ParReports = lazyWithTimeout(() => import("./pages/par/ParReports").then((m) => ({ default: m.ParReports })));
const ParFolders = lazyWithTimeout(() => import("./pages/par/ParFolders").then((m) => ({ default: m.ParFolders })));
// FX-001: curs valutar BNM — lazy, ca recharts să nu intre în bundle-ul de login.
const ParExchange = lazyWithTimeout(() => import("./pages/par/ParExchange").then((m) => ({ default: m.ParExchange })));
const ParEfacturaQueue = lazyWithTimeout(() => import("./pages/par/ParEfacturaQueue"));

// DOCMERGE
const DocsPage = lazyWithTimeout(() => import("./pages/business/docs/DocsPage").then((m) => ({ default: m.DocsPage })));
const DocMergeTemplatesPage = lazyWithTimeout(() => import("./pages/business/docmerge/DocMergeTemplatesPage").then((m) => ({ default: m.DocMergeTemplatesPage })));
const DocMergeJobPage = lazyWithTimeout(() => import("./pages/business/docmerge/DocMergeJobPage").then((m) => ({ default: m.DocMergeJobPage })));
const DocMergeWizardPage = lazyWithTimeout(() => import("./pages/business/docmerge/DocMergeWizardPage").then((m) => ({ default: m.DocMergeWizardPage })));

// Business — ciclul de viață al contului
const BusinessSignupPage = lazyWithTimeout(() => import("./pages/business/BusinessSignupPage").then((m) => ({ default: m.BusinessSignupPage })));
const ForgotPasswordPage = lazyWithTimeout(() => import("./pages/business/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazyWithTimeout(() => import("./pages/business/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const BusinessDashboardPage = lazyWithTimeout(() => import("./pages/business/BusinessDashboardPage").then((m) => ({ default: m.BusinessDashboardPage })));
const PlatformAdminPage = lazyWithTimeout(() => import("./pages/business/PlatformAdminPage").then((m) => ({ default: m.PlatformAdminPage })));
// PLATFORM-001: Consola Platformă. Lazy ca restul rutelor — o vede doar superadminul,
// deci n-are ce căuta în bundle-ul pe care îl descarcă fiecare client.
const PlatformConsolePage = lazyWithTimeout(() => import("./pages/business/platform/PlatformConsolePage").then((m) => ({ default: m.PlatformConsolePage })));
// SHELL-503: PAR invite acceptance (public — no auth guard)
const InvitePage = lazyWithTimeout(() => import("./pages/business/InvitePage").then((m) => ({ default: m.InvitePage })));
const WelcomePage = lazyWithTimeout(() => import("./pages/business/WelcomePage").then((m) => ({ default: m.WelcomePage })));

// FinDesk — /business/fin/*
const FinHome = lazyWithTimeout(() => import("./pages/fin/FinHome").then((m) => ({ default: m.FinHome })));
const FinCompany = lazyWithTimeout(() => import("./pages/fin/FinCompany").then((m) => ({ default: m.FinCompany })));
const FinOnboarding = lazyWithTimeout(() => import("./pages/fin/FinOnboarding").then((m) => ({ default: m.FinOnboarding })));
const FinAiAuditPage = lazyWithTimeout(() => import("./pages/fin/FinAiAuditPage").then((m) => ({ default: m.FinAiAuditPage })));
const FinSecuritySettingsPage = lazyWithTimeout(() => import("./pages/fin/FinSecuritySettingsPage").then((m) => ({ default: m.FinSecuritySettingsPage })));

const CapturesListPage = lazyWithTimeout(() => import("./pages/fin/CapturesListPage"));
const CapturePage = lazyWithTimeout(() => import("./pages/fin/CapturePage"));
const FinInvoicesPage = lazyWithTimeout(() => import("./pages/app/FinInvoicesPage").then((m) => ({ default: m.FinInvoicesPage })));
const FinInvoiceDocPage = lazyWithTimeout(() => import("./pages/app/FinInvoiceDocPage").then((m) => ({ default: m.FinInvoiceDocPage })));
const FinExpensesPage = lazyWithTimeout(() => import("./pages/app/FinExpensesPage").then((m) => ({ default: m.FinExpensesPage })));
const FinRegistryPage = lazyWithTimeout(() => import("./pages/app/FinRegistryPage").then((m) => ({ default: m.FinRegistryPage })));
const FinEinvoicesPage = lazyWithTimeout(() => import("./pages/app/FinEinvoicesPage").then((m) => ({ default: m.FinEinvoicesPage })));
const BudgetPage = lazyWithTimeout(() => import("./pages/app/BudgetPage").then((m) => ({ default: m.BudgetPage })));
const AssetsPage = lazyWithTimeout(() => import("./pages/app/AssetsPage").then((m) => ({ default: m.AssetsPage })));
const RevaluationPage = lazyWithTimeout(() => import("./pages/app/RevaluationPage").then((m) => ({ default: m.RevaluationPage })));
const InventoryPage = lazyWithTimeout(() => import("./pages/app/InventoryPage").then((m) => ({ default: m.InventoryPage })));
const InventoryReportPage = lazyWithTimeout(() => import("./pages/app/InventoryReportPage").then((m) => ({ default: m.InventoryReportPage })));
const PaymentAccountsPage = lazyWithTimeout(() => import("./pages/app/PaymentAccountsPage").then((m) => ({ default: m.PaymentAccountsPage })));
const PaymentAccountEditorPage = lazyWithTimeout(() => import("./pages/app/PaymentAccountEditorPage").then((m) => ({ default: m.PaymentAccountEditorPage })));
const PaymentAccountViewPage = lazyWithTimeout(() => import("./pages/app/PaymentAccountViewPage").then((m) => ({ default: m.PaymentAccountViewPage })));
// FIX-502: Use FinDesk payroll pages (pages/fin/*) not the CRM payroll page (pages/app/PayrollPage).
// The CRM page calls /api/hr/payroll which is NOT mounted; FinDesk pages call /api/fin/payroll/* which IS mounted.
const PayrollFINPage = lazyWithTimeout(() => import("./pages/fin/PayrollPage").then((m) => ({ default: m.PayrollFINPage })));
const PayrollEmployeesPage = lazyWithTimeout(() => import("./pages/fin/PayrollEmployeesPage").then((m) => ({ default: m.PayrollEmployeesPage })));
const PayrollRunDetailPage = lazyWithTimeout(() => import("./pages/fin/PayrollRunDetailPage").then((m) => ({ default: m.PayrollRunDetailPage })));
const ReconcilePage = lazyWithTimeout(() => import("./pages/fin/ReconcilePage"));
const CashPage = lazyWithTimeout(() => import("./pages/fin/CashPage"));
const PartiesPage = lazyWithTimeout(() => import("./pages/app/fin/PartiesPage").then((m) => ({ default: m.PartiesPage })));
const PartyDetailPage = lazyWithTimeout(() => import("./pages/app/fin/PartyDetailPage").then((m) => ({ default: m.PartyDetailPage })));
const FinExportCenter = lazyWithTimeout(() => import("./pages/app/fin/ExportCenter").then((m) => ({ default: m.FinExportCenter })));
const ItparkDetail = lazyWithTimeout(() => import("./pages/app/fin/itpark/ItparkDetail"));
const FinInsightsPage = lazyWithTimeout(() => import("./pages/finance/FinInsightsPage").then((m) => ({ default: m.FinInsightsPage })));
const CXPage = lazyWithTimeout(() => import("./pages/app/CXPage").then((m) => ({ default: m.CXPage })));

// STMT-001..004: Statement pages
const StatementUploadPage = lazyWithTimeout(() => import("./pages/fin/StatementUploadPage"));
const StatementReviewPage = lazyWithTimeout(() => import("./pages/fin/StatementReviewPage"));
const StatementHistoryPage = lazyWithTimeout(() => import("./pages/fin/StatementHistoryPage"));

const BankLinkPage = lazyWithTimeout(() => import("./pages/fin/BankLinkPage"));
const BankLinkImportPage = lazyWithTimeout(() => import("./pages/fin/BankLinkImportPage"));
const BankLinkQueuePage = lazyWithTimeout(() => import("./pages/fin/BankLinkQueuePage"));
const BankLinkTransactionsPage = lazyWithTimeout(() => import("./pages/fin/BankLinkTransactionsPage"));
const AgreementsPage = lazyWithTimeout(() => import("./pages/fin/AgreementsPage").then(m => ({ default: m.AgreementsPage })));
const CashImportPage = lazyWithTimeout(() => import("./pages/fin/CashImportPage"));
const FinCalendarPage = lazyWithTimeout(() => import("./pages/fin/FinCalendarPage").then(m => ({ default: m.FinCalendarPage })));
const FinMassPage = lazyWithTimeout(() => import("./pages/fin/FinMassPage").then(m => ({ default: m.FinMassPage })));
const TaxPage = lazyWithTimeout(() => import("./pages/fin/TaxPage").then(m => ({ default: m.TaxPage })));
const FinPaymentsPage = lazyWithTimeout(() => import("./pages/fin/PaymentsPage"));

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

  // Business landing + login + account lifecycle (all PUBLIC — no session required)
  if (path === "/business" || path === "/business/") return <BusinessLandingPage />;
  if (path.startsWith("/business/login")) return <BusinessLoginPage />;
  if (path.startsWith("/business/signup")) return <BusinessSignupPage />;
  if (path.startsWith("/business/forgot")) return <ForgotPasswordPage />;
  if (path.startsWith("/business/reset")) return <ResetPasswordPage />;
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

  // PLATFORM-001: consola completă (workspace-uri, module, statistici, logări, audit).
  // Ecranul vechi, per entitate juridică, rămâne pe ruta lui — deci trebuie testat ÎNAINTE,
  // altfel `startsWith("/business/platform")` l-ar înghiți.
  if (path.startsWith("/business/platform-admin")) return <BusinessGuardPage><PlatformAdminPage /></BusinessGuardPage>;
  if (path.startsWith("/business/platform")) return <BusinessGuardPage><PlatformConsolePage /></BusinessGuardPage>;

  // PAR routes under /business/par/* — ParGuardPage (VM1-01 Decizia 9) hides the whole
  // module from users with zero PAR roles, even on direct URL access.
  if (path.startsWith("/business/par/onboarding")) return <BusinessGuardPage><ParGuardPage requiredRoles={["par_admin"]}><ParOnboarding /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/new")) return <BusinessGuardPage><ParGuardPage><ParCreateForm /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/inbox")) return <BusinessGuardPage><ParGuardPage requiredRoles={["approver", "par_admin"]}><ParInbox /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/finance")) return <BusinessGuardPage><ParGuardPage requiredRoles={["finance", "par_admin"]}><ParFinanceQueue /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/admin")) return <BusinessGuardPage><ParGuardPage requiredRoles={["par_admin"]}><ParAdminPage /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/efactura")) return <BusinessGuardPage><ParGuardPage requiredRoles={["finance", "par_admin"]}><ParEfacturaQueue /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/exchange")) return <BusinessGuardPage><ParGuardPage><ParExchange /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/folders")) return <BusinessGuardPage><ParGuardPage requiredRoles={["approver", "finance", "par_admin"]}><ParFolders /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par/reports")) return <BusinessGuardPage><ParGuardPage requiredRoles={["approver", "finance", "par_admin"]}><ParReports /></ParGuardPage></BusinessGuardPage>;
  // PARQA-001: edit an existing draft / changes_requested PAR (ParCreateForm loads it by :id).
  if (path.match(/^\/business\/par\/[^/]+\/edit$/)) return <BusinessGuardPage><ParGuardPage><ParCreateForm /></ParGuardPage></BusinessGuardPage>;
  if (path.match(/^\/business\/par\/[^/]+$/)) return <BusinessGuardPage><ParGuardPage><ParDetailPage /></ParGuardPage></BusinessGuardPage>;
  if (path.startsWith("/business/par")) return <BusinessGuardPage><ParGuardPage><ParDashboard /></ParGuardPage></BusinessGuardPage>;

  // DOCMERGE-001/002/003/004: Document Merge — more specific routes first
  // DG-103: registrul de acte. ÎNAINTEA lui /business/docmerge, ca prefixul mai scurt să nu-l înghită.
  if (path.startsWith("/business/docs")) return <BusinessGuardPage><DocsPage /></BusinessGuardPage>;
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
  if (path.startsWith("/app/cx")) return <CXPage />;
  return <RedirectToBusiness />;
}

function BoundedRoutes() {
  const { path } = useRouter();
  return (
    <ErrorBoundary resetKey={path}>
      {/* PERF-003: o singură graniță Suspense pentru toate rutele lazy. `key={path}` o resetează
          la navigare, ca fallback-ul să apară pentru pagina nouă, nu pentru cea părăsită. */}
      <Suspense key={path} fallback={<RouteFallback />}>
        <Routes />
      </Suspense>
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
