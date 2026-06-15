import { HashRouter, useRouter } from "./router/HashRouter";
import { BranchProvider } from "./contexts/BranchContext";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { TrustBar } from "./components/TrustBar";
import { Features } from "./components/Features";
import { ModuleSpotlight } from "./components/ModuleSpotlight";
import { Stats } from "./components/Stats";
import { Audience } from "./components/Audience";
import { Integrations } from "./components/Integrations";
import { Comparison } from "./components/Comparison";
import { Pricing } from "./components/Pricing";
import { Testimonials } from "./components/Testimonials";
import { FAQ } from "./components/FAQ";
import { CTA } from "./components/CTA";
import { Footer } from "./components/Footer";
import { lazy, Suspense } from "react";
// PERF: route-level pages are code-split via React.lazy so each route ships its own
// chunk instead of bundling the whole app (CRM + Business Suite + FinDesk + PAR + ITPark)
// into one ~5MB synchronous bundle. `named()` adapts named exports to lazy()'s default-export shape.
function named<T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) {
  return lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType<unknown> })));
}
const OrarPage = named(() => import("./pages/modules/OrarPage"), "OrarPage");
const FinantePage = named(() => import("./pages/modules/FinantePage"), "FinantePage");
const CRMPage = named(() => import("./pages/modules/CRMPage"), "CRMPage");
const ComunicarePage = named(() => import("./pages/modules/ComunicarePage"), "ComunicarePage");
const MobilePage = named(() => import("./pages/modules/MobilePage"), "MobilePage");
const RapoartePage = named(() => import("./pages/modules/RapoartePage"), "RapoartePage");
const HRPage = named(() => import("./pages/modules/HRPage"), "HRPage");
const MultifilalePage = named(() => import("./pages/modules/MultifilalePage"), "MultifilalePage");
const IntegrariPage = named(() => import("./pages/modules/IntegrariPage"), "IntegrariPage");
const AIPage = named(() => import("./pages/modules/AIPage"), "AIPage");
const LimbiPage = named(() => import("./pages/audiences/LimbiPage"), "LimbiPage");
const ProgramarePage = named(() => import("./pages/audiences/ProgramarePage"), "ProgramarePage");
const MuzicaPage = named(() => import("./pages/audiences/MuzicaPage"), "MuzicaPage");
const ExamenePage = named(() => import("./pages/audiences/ExamenePage"), "ExamenePage");
const ROICalculatorPage = named(() => import("./pages/tools/ROICalculatorPage"), "ROICalculatorPage");
const MigrationEstimatorPage = named(() => import("./pages/tools/MigrationEstimatorPage"), "MigrationEstimatorPage");
const PricingConfiguratorPage = named(() => import("./pages/tools/PricingConfiguratorPage"), "PricingConfiguratorPage");
import { BackendStatusBadge } from "./components/BackendStatusBadge";
const LoginPage = named(() => import("./pages/app/LoginPage"), "LoginPage");
const SignupPage = named(() => import("./pages/app/SignupPage"), "SignupPage");
const DashboardPage = named(() => import("./pages/app/DashboardPage"), "DashboardPage");
const StudentsPage = named(() => import("./pages/app/StudentsPage"), "StudentsPage");
const StudentDetailPage = named(() => import("./pages/app/StudentDetailPage"), "StudentDetailPage"); // STU-201
const SchedulePage = named(() => import("./pages/app/SchedulePage"), "SchedulePage");
const TeachersPage = named(() => import("./pages/app/TeachersPage"), "TeachersPage");
const PaymentsPage = named(() => import("./pages/app/PaymentsPage"), "PaymentsPage");
const LeadsPage = named(() => import("./pages/app/LeadsPage"), "LeadsPage");
const LeadCardPage = named(() => import("./pages/app/LeadCardPage"), "LeadCardPage");
const TemplatesPage = named(() => import("./pages/app/TemplatesPage"), "TemplatesPage");
const AutomationsPage = named(() => import("./pages/app/AutomationsPage"), "AutomationsPage");
const AnalyticsPage = named(() => import("./pages/app/AnalyticsPage"), "AnalyticsPage");
const AdvancedAnalyticsPage = named(() => import("./pages/app/AdvancedAnalyticsPage"), "AdvancedAnalyticsPage"); // GAP-016
const PayrollPage = named(() => import("./pages/app/PayrollPage"), "PayrollPage");
const TeacherStatsPage = named(() => import("./pages/app/TeacherStatsPage"), "TeacherStatsPage");
const AvailabilityPage = named(() => import("./pages/app/AvailabilityPage"), "AvailabilityPage");
const AuditLogPage = named(() => import("./pages/app/AuditLogPage"), "AuditLogPage");
const TodayDashboardPage = named(() => import("./pages/app/TodayDashboardPage"), "TodayDashboardPage");
const CadencesPage = named(() => import("./pages/app/CadencesPage"), "CadencesPage");
const LeadAuditLogPage = named(() => import("./pages/app/LeadAuditLogPage"), "LeadAuditLogPage");
const ContractsPage = named(() => import("./pages/app/ContractsPage"), "ContractsPage");
const FeedbackPage = named(() => import("./pages/app/FeedbackPage"), "FeedbackPage");
const FeedbackPublicPage = named(() => import("./pages/app/FeedbackPublicPage"), "FeedbackPublicPage");
const InvoicesPage = named(() => import("./pages/app/InvoicesPage"), "InvoicesPage");
const PaymentAccountsPage = named(() => import("./pages/app/PaymentAccountsPage"), "PaymentAccountsPage"); // CONT-PLATA
const PaymentAccountEditorPage = named(() => import("./pages/app/PaymentAccountEditorPage"), "PaymentAccountEditorPage"); // CONT-PLATA
const PaymentAccountViewPage = named(() => import("./pages/app/PaymentAccountViewPage"), "PaymentAccountViewPage"); // CONT-PLATA
const SellerProfilePage = named(() => import("./pages/app/SellerProfilePage"), "SellerProfilePage"); // CONT-PLATA
const CXPage = named(() => import("./pages/app/CXPage"), "CXPage");
const DiplomaPage = named(() => import("./pages/app/DiplomaPage"), "DiplomaPage");
const KinderCheckinPage = named(() => import("./pages/app/KinderCheckinPage"), "KinderCheckinPage");
const KinderPickupsPage = named(() => import("./pages/app/KinderPickupsPage"), "KinderPickupsPage");
const KinderDiaryPage = named(() => import("./pages/app/KinderDiaryPage"), "KinderDiaryPage");
const KinderRatioPage = named(() => import("./pages/app/KinderRatioPage"), "KinderRatioPage");
const KinderMedicalPage = named(() => import("./pages/app/KinderMedicalPage"), "KinderMedicalPage");
const KinderImmunizationReportPage = named(() => import("./pages/app/KinderImmunizationReportPage"), "KinderImmunizationReportPage");
const KinderParentFeedPage = named(() => import("./pages/app/KinderParentFeedPage"), "KinderParentFeedPage");
const KinderCompliancePage = named(() => import("./pages/app/KinderCompliancePage"), "KinderCompliancePage");
const KinderIncidentsPage = lazy(() => import("./pages/app/KinderIncidentsPage"));
const MobileSchedulePage = named(() => import("./pages/app/mobile/MobileSchedulePage"), "MobileSchedulePage");
const HomeworkPage = named(() => import("./pages/app/mobile/HomeworkPage"), "HomeworkPage");
const NotificationsSettingsPage = named(() => import("./pages/app/mobile/NotificationsSettingsPage"), "NotificationsSettingsPage");
const ParentDashboardPage = named(() => import("./pages/app/mobile/ParentDashboardPage"), "ParentDashboardPage");
const ChatPage = named(() => import("./pages/app/mobile/ChatPage"), "ChatPage");
const XpPage = named(() => import("./pages/app/mobile/XpPage"), "XpPage");
const LeaderboardPage = named(() => import("./pages/app/mobile/LeaderboardPage"), "LeaderboardPage");
const StudentDashboardPage = named(() => import("./pages/app/mobile/StudentDashboardPage"), "StudentDashboardPage");
const GradingPage = named(() => import("./pages/app/GradingPage"), "GradingPage");
const GamificationPage = named(() => import("./pages/app/GamificationPage"), "GamificationPage");
const ApiKeysPage = named(() => import("./pages/app/settings/ApiKeysPage"), "ApiKeysPage");
const WebhooksPage = named(() => import("./pages/app/settings/WebhooksPage"), "WebhooksPage");
const IntegrationsPage = named(() => import("./pages/app/settings/IntegrationsPage"), "IntegrationsPage");
const InstitutionPage = named(() => import("./pages/app/settings/InstitutionPage"), "InstitutionPage");
const KpiDashboardPage = named(() => import("./pages/app/KpiDashboardPage"), "KpiDashboardPage");
const RevenueChartsPage = named(() => import("./pages/app/RevenueChartsPage"), "RevenueChartsPage");
const StudentRetentionPage = named(() => import("./pages/app/StudentRetentionPage"), "StudentRetentionPage");
const ExportPage = named(() => import("./pages/app/ExportPage"), "ExportPage");
const InvoicePortalPage = named(() => import("./pages/portal/InvoicePortalPage"), "InvoicePortalPage");
const VerifyCertificatePage = named(() => import("./pages/public/VerifyCertificatePage"), "VerifyCertificatePage");
import { ErrorBoundary } from "./components/ErrorBoundary";
const ParCreateWizard = named(() => import("./pages/par/ParCreateWizard"), "ParCreateWizard"); // PAR-105
const ParDashboard = named(() => import("./pages/par/ParDashboard"), "ParDashboard"); // PAR-106
const ParInbox = lazy(() => import("./pages/par/ParInbox")); // PAR-108
const ParFinanceQueue = lazy(() => import("./pages/par/ParFinanceQueue")); // PAR-112
const ParDetailPage = lazy(() => import("./pages/par/ParDetail")); // PAR-115
const ParAdmin = lazy(() => import("./pages/par/ParAdmin")); // PAR-116
const ParReports = named(() => import("./pages/par/ParReports"), "ParReports"); // PAR-117
import { useState, useEffect } from "react";
import { getParMe } from "./lib/api/par";
const ItparkList = lazy(() => import("./pages/app/fin/itpark/ItparkList"));
const ItparkDashboardPage = lazy(() => import("./pages/app/fin/itpark/ItparkDashboardPage"));
const CapturesListPage = lazy(() => import("./pages/fin/CapturesListPage"));
const ReconcilePage = lazy(() => import("./pages/fin/ReconcilePage"));
const CashPage = lazy(() => import("./pages/fin/CashPage"));
const CashImportPage = lazy(() => import("./pages/fin/CashImportPage"));
const FinPaymentsPage = lazy(() => import("./pages/fin/PaymentsPage"));
const BankLinkPage = lazy(() => import("./pages/fin/BankLinkPage"));
const BankLinkImportPage = lazy(() => import("./pages/fin/BankLinkImportPage"));
const BankLinkTransactionsPage = lazy(() => import("./pages/fin/BankLinkTransactionsPage"));
const BankLinkQueuePage = lazy(() => import("./pages/fin/BankLinkQueuePage"));
const FinInsightsPage = named(() => import("./pages/finance/FinInsightsPage"), "FinInsightsPage");
const FinEinvoicesPage = named(() => import("./pages/app/FinEinvoicesPage"), "FinEinvoicesPage");
const FinAiAuditPage = named(() => import("./pages/fin/FinAiAuditPage"), "FinAiAuditPage");
const AssetsPage = named(() => import("./pages/app/AssetsPage"), "AssetsPage");
const FinHome = named(() => import("./pages/fin/FinHome"), "FinHome");
const PayrollFINPage = named(() => import("./pages/fin/PayrollPage"), "PayrollFINPage");
const BudgetPage = named(() => import("./pages/app/BudgetPage"), "BudgetPage");
const FinExpensesPage = named(() => import("./pages/app/FinExpensesPage"), "FinExpensesPage");
const InventoryReportPage = named(() => import("./pages/app/InventoryReportPage"), "InventoryReportPage");
const FinInvoicesPage = named(() => import("./pages/app/FinInvoicesPage"), "FinInvoicesPage");
const FinExportCenter = named(() => import("./pages/app/fin/ExportCenter"), "FinExportCenter");
const PartiesPage = named(() => import("./pages/app/fin/PartiesPage"), "PartiesPage");
const AgreementsPage = named(() => import("./pages/fin/AgreementsPage"), "AgreementsPage");
const PayrollEmployeesPage = named(() => import("./pages/fin/PayrollEmployeesPage"), "PayrollEmployeesPage");
const FinMassPage = named(() => import("./pages/fin/FinMassPage"), "FinMassPage");
const TaxPage = named(() => import("./pages/fin/TaxPage"), "TaxPage");
const InventoryPage = named(() => import("./pages/app/InventoryPage"), "InventoryPage");
const FinRegistryPage = named(() => import("./pages/app/FinRegistryPage"), "FinRegistryPage");
const FinLedgerPage = named(() => import("./pages/fin/FinLedgerPage"), "FinLedgerPage");
const FinSecuritySettingsPage = named(() => import("./pages/fin/FinSecuritySettingsPage"), "FinSecuritySettingsPage");
const FinCalendarPage = named(() => import("./pages/fin/FinCalendarPage"), "FinCalendarPage");
const RevaluationPage = named(() => import("./pages/app/RevaluationPage"), "RevaluationPage");
// SPLIT-003: Business Suite auth pages
const BusinessLoginPage = named(() => import("./pages/business/BusinessLoginPage"), "BusinessLoginPage");
const BusinessDashboardPage = named(() => import("./pages/business/BusinessDashboardPage"), "BusinessDashboardPage");
// SPLIT-102: Business Suite landing page
const BusinessLandingPage = named(() => import("./pages/business/BusinessLandingPage"), "BusinessLandingPage");
// SPLIT-103: Business guard HOC for delegated routes (small wrapper — kept eager)
import { BusinessGuardPage } from "./components/business/BusinessGuardPage";

/** PAR-116: Role-aware wrapper — fetches current user's PAR roles then renders ParAdmin */
function ParAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    getParMe()
      .then((r) => setIsAdmin(r.roles.includes("par_admin")))
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) return null; // Loading
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
        <ModuleSpotlight />
        <Stats />
        <Audience />
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
  if (path.startsWith("/modules/orar")) return <OrarPage />;
  if (path.startsWith("/modules/finante")) return <FinantePage />;
  if (path.startsWith("/modules/crm")) return <CRMPage />;
  if (path.startsWith("/modules/comunicare")) return <ComunicarePage />;
  if (path.startsWith("/modules/mobile")) return <MobilePage />;
  if (path.startsWith("/modules/rapoarte")) return <RapoartePage />;
  if (path.startsWith("/modules/hr")) return <HRPage />;
  if (path.startsWith("/modules/multifilale")) return <MultifilalePage />;
  if (path.startsWith("/modules/integrari")) return <IntegrariPage />;
  if (path.startsWith("/modules/ai")) return <AIPage />;
  if (path.startsWith("/pentru/limbi")) return <LimbiPage />;
  if (path.startsWith("/pentru/programare")) return <ProgramarePage />;
  if (path.startsWith("/pentru/muzica")) return <MuzicaPage />;
  if (path.startsWith("/pentru/examene")) return <ExamenePage />;
  if (path.startsWith("/calculator/roi")) return <ROICalculatorPage />;
  if (path.startsWith("/calculator/migrare")) return <MigrationEstimatorPage />;
  if (path.startsWith("/calculator/pricing")) return <PricingConfiguratorPage />;
  // MOB-101/102/103/104: Mobile PWA routes — must come before /app/* to avoid /app fallback
  if (path.startsWith("/m/schedule")) return <MobileSchedulePage />;
  if (path.startsWith("/m/homework")) return <HomeworkPage />;
  if (path.startsWith("/m/settings/notifications")) return <NotificationsSettingsPage />;
  // MOB-104: Parent portal + chat (must be checked before generic /m/ catch-all)
  if (path.startsWith("/m/parent")) return <ParentDashboardPage />;
  if (path.startsWith("/m/chat")) return <ChatPage />;
  // MOB-105: Gamification XP + leaderboard
  if (path.startsWith("/m/xp")) return <XpPage />;
  if (path.startsWith("/m/leaderboard")) return <LeaderboardPage />;
  if (path.startsWith("/m/")) return <StudentDashboardPage />;
  // MOB-102: Teacher grading
  if (path.startsWith("/app/grading")) return <GradingPage />;
  // SPLIT-102: Business Suite landing page — exact /business (before /business/*)
  if (path === "/business" || path === "/business/") return <BusinessLandingPage />;
  // SPLIT-003: Business Suite routes (checked before /app/* to avoid cross-match)
  if (path.startsWith("/business/login")) return <BusinessLoginPage />;
  if (path.startsWith("/business/dashboard")) return <BusinessDashboardPage />;

  // SPLIT-103: /business/* routes — business session guard + delegate to existing pages.
  // Pages render with their own shells (FinLayout, AppShell); guard ensures business-only access.
  // Phase 2: top-level + common sub-routes. Path-based IDs (detail pages) handled in Phase 3.
  // FinDesk routes under /business/fin/*
  if (path.startsWith("/business/fin/banklink/transactions")) return <BusinessGuardPage><BankLinkTransactionsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payroll/employees")) return <BusinessGuardPage><PayrollEmployeesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/settings/ai-audit")) return <BusinessGuardPage><FinAiAuditPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/settings/security")) return <BusinessGuardPage><FinSecuritySettingsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/inventory/report")) return <BusinessGuardPage><InventoryReportPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink/import")) return <BusinessGuardPage><BankLinkImportPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink/queue")) return <BusinessGuardPage><BankLinkQueuePage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/cash/import")) return <BusinessGuardPage><CashImportPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/revaluation")) return <BusinessGuardPage><RevaluationPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/agreements")) return <BusinessGuardPage><AgreementsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/einvoices")) return <BusinessGuardPage><FinEinvoicesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/inventory")) return <BusinessGuardPage><InventoryPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/registry")) return <BusinessGuardPage><FinRegistryPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/invoices")) return <BusinessGuardPage><FinInvoicesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/expenses")) return <BusinessGuardPage><FinExpensesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/captures")) return <BusinessGuardPage><CapturesListPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/reconcile")) return <BusinessGuardPage><ReconcilePage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payments")) return <BusinessGuardPage><FinPaymentsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/calendar")) return <BusinessGuardPage><FinCalendarPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/banklink")) return <BusinessGuardPage><BankLinkPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/parties")) return <BusinessGuardPage><PartiesPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/payroll")) return <BusinessGuardPage><PayrollFINPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/itpark")) return <BusinessGuardPage><ItparkList /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/assets")) return <BusinessGuardPage><AssetsPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/ledger")) return <BusinessGuardPage><FinLedgerPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/budget")) return <BusinessGuardPage><BudgetPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/export")) return <BusinessGuardPage><FinExportCenter /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/cash")) return <BusinessGuardPage><CashPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/mass")) return <BusinessGuardPage><FinMassPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/tax")) return <BusinessGuardPage><TaxPage /></BusinessGuardPage>;
  if (path.startsWith("/business/fin/")) return <BusinessGuardPage><FinHome /></BusinessGuardPage>;
  // PAR routes under /business/par/*
  if (path.startsWith("/business/par/new")) return <BusinessGuardPage><ParCreateWizard /></BusinessGuardPage>;
  if (path.startsWith("/business/par/inbox")) return <BusinessGuardPage><ParInbox /></BusinessGuardPage>;
  if (path.startsWith("/business/par/finance")) return <BusinessGuardPage><ParFinanceQueue /></BusinessGuardPage>;
  if (path.startsWith("/business/par/admin")) return <BusinessGuardPage><ParAdminPage /></BusinessGuardPage>;
  if (path.startsWith("/business/par/reports")) return <BusinessGuardPage><ParReports /></BusinessGuardPage>;
  if (path.startsWith("/business/par")) return <BusinessGuardPage><ParDashboard /></BusinessGuardPage>;
  // ITPark routes under /business/itpark/*
  if (path.startsWith("/business/itpark/dashboard")) return <BusinessGuardPage><ItparkDashboardPage /></BusinessGuardPage>;
  if (path.startsWith("/business/itpark")) return <BusinessGuardPage><ItparkList /></BusinessGuardPage>;
  if (path.startsWith("/app/login")) return <LoginPage />;
  if (path.startsWith("/app/signup")) return <SignupPage />;
  // GAP-019: /app/students/:id detail page must come before /app/students list
  if (path.match(/^\/app\/students\/[^/]+$/)) {
    const studentId = path.split("/")[3];
    return <StudentDetailPage studentId={studentId} />;
  }
  if (path.startsWith("/app/students")) return <StudentsPage />;
  if (path.startsWith("/app/gamification")) return <GamificationPage />; // GAP-020
  if (path.startsWith("/app/schedule")) return <SchedulePage />;
  if (path.startsWith("/app/teachers")) return <TeachersPage />;
  if (path.startsWith("/app/payments")) return <PaymentsPage />;
  // CRM-120: /app/leads/today dashboard
  if (path.startsWith("/app/leads/today")) return <TodayDashboardPage />;
  // /app/leads/:id must be checked before /app/leads
  if (path.match(/^\/app\/leads\/[^/]+$/)) {
    const id = path.split("/").pop()!;
    return <LeadCardPage leadId={id} />;
  }
  if (path.startsWith("/app/analytics/crm")) return <AnalyticsPage />;
  if (path.startsWith("/app/analytics")) return <AdvancedAnalyticsPage />; // GAP-016
  if (path.startsWith("/app/hr/payroll")) return <PayrollPage />;
  // /app/hr/teachers/:id/stats
  if (path.match(/^\/app\/hr\/teachers\/[^/]+\/stats$/)) {
    const id = path.split("/")[4];
    return <TeacherStatsPage teacherId={id} />;
  }
  // /app/hr/teachers/:id/availability
  if (path.match(/^\/app\/hr\/teachers\/[^/]+\/availability$/)) {
    const id = path.split("/")[4];
    return <AvailabilityPage teacherId={id} />;
  }
  if (path.startsWith("/app/hr/audit")) return <AuditLogPage />;
  if (path.startsWith("/app/settings/api-keys")) return <ApiKeysPage />; // INT-901
  if (path.startsWith("/app/settings/webhooks")) return <WebhooksPage />; // INT-902
  if (path.startsWith("/app/settings/integrations")) return <IntegrationsPage />; // INT-903
  if (path.startsWith("/app/settings/institution")) return <InstitutionPage />; // INST-001
  if (path.startsWith("/app/settings/crm/automations")) return <AutomationsPage />;
  if (path.startsWith("/app/settings/crm/templates")) return <TemplatesPage />;
  if (path.startsWith("/app/cadences")) return <CadencesPage />;
  if (path.startsWith("/app/audit-log")) return <LeadAuditLogPage />;
  if (path.startsWith("/app/contracts")) return <ContractsPage />;
  if (path.startsWith("/app/feedback")) return <FeedbackPage />;
  if (path.startsWith("/app/invoices")) return <InvoicesPage />;
  // CONT-PLATA: payment accounts ("cont de plată") with registry lookup
  if (path.startsWith("/app/conturi-plata/setari")) return <SellerProfilePage />;
  if (path.startsWith("/app/conturi-plata/nou")) return <PaymentAccountEditorPage />;
  {
    const editMatch = path.match(/^\/app\/conturi-plata\/([^/?]+)\/editeaza/);
    if (editMatch) return <PaymentAccountEditorPage accountId={editMatch[1]} />;
    const viewMatch = path.match(/^\/app\/conturi-plata\/([^/?]+)/);
    if (viewMatch) return <PaymentAccountViewPage accountId={viewMatch[1]} />;
  }
  if (path.startsWith("/app/conturi-plata")) return <PaymentAccountsPage />;
  if (path.startsWith("/app/cx")) return <CXPage />;
  if (path.startsWith("/app/diplome")) return <DiplomaPage />;
  // KINDER-001: /app/kinder/students/:id/pickups must be before /app/kinder/checkin
  if (path.match(/^\/app\/kinder\/students\/[^/]+\/pickups$/)) return <KinderPickupsPage />;
  if (path.startsWith("/app/kinder/checkin")) return <KinderCheckinPage />;
  // KINDER-002: daily diary
  if (path.startsWith("/app/kinder/diary")) return <KinderDiaryPage />;
  // KINDER-003: staff-to-child ratio
  if (path.startsWith("/app/kinder/ratio")) return <KinderRatioPage />;
  // KINDER-004: medical — allergies, immunization records, medication log
  if (path.match(/^\/app\/kinder\/students\/[^/]+\/medical$/)) return <KinderMedicalPage />;
  if (path.startsWith("/app/kinder/immunization-report")) return <KinderImmunizationReportPage />;
  // KINDER-005: parent app feed + messaging
  if (path.match(/^\/app\/kinder\/students\/[^/]+\/feed$/)) return <KinderParentFeedPage />;
  // KINDER-006: licensing/compliance reports
  if (path.startsWith("/app/kinder/compliance")) return <KinderCompliancePage />;
  // KINDER-007: incident/accident reports + parent acknowledgment
  if (path.startsWith("/app/kinder/incidents")) return <KinderIncidentsPage />;
  // PAR-105: /app/par/new — create wizard (must come before /app/par list)
  if (path.startsWith("/app/par/new")) return <ParCreateWizard />;
  // PAR-108: /app/par/inbox — approver inbox (before /app/par generic)
  if (path.startsWith("/app/par/inbox")) return <ParInbox />;
  // PAR-112: /app/par/finance — finance queue (before /app/par generic)
  if (path.startsWith("/app/par/finance")) return <ParFinanceQueue />;
  // PAR-116: /app/par/admin — admin panel (par_admin only; before :id catch-all)
  if (path.startsWith("/app/par/admin")) return <ParAdminPage />;
  // PAR-117: /app/par/reports — reports dashboard
  if (path.startsWith("/app/par/reports")) return <ParReports />;
  // PAR-115: /app/par/:id — detail page (before /app/par generic, after named routes)
  if (path.match(/^\/app\/par\/[^/]+$/)) return <ParDetailPage />;
  // PAR-106: /app/par — dashboard + list
  if (path.startsWith("/app/par")) return <ParDashboard />;
  if (path.startsWith("/app/leads")) return <LeadsPage />;
  if (path.startsWith("/app/reports/kpi")) return <KpiDashboardPage />;
  if (path.startsWith("/app/reports/revenue")) return <RevenueChartsPage />;
  if (path.startsWith("/app/reports/retention")) return <StudentRetentionPage />;
  if (path.startsWith("/app/reports/export")) return <ExportPage />;
  if (path.startsWith("/app/fin/banklink/transactions")) return <BankLinkTransactionsPage />;
  if (path.startsWith("/app/fin/payroll/employees")) return <PayrollEmployeesPage />;
  if (path.startsWith("/app/fin/settings/ai-audit")) return <FinAiAuditPage />;
  if (path.startsWith("/app/fin/settings/security")) return <FinSecuritySettingsPage />;
  if (path.startsWith("/app/fin/inventory/report")) return <InventoryReportPage />;
  if (path.startsWith("/app/fin/banklink/import")) return <BankLinkImportPage />;
  if (path.startsWith("/app/fin/banklink/queue")) return <BankLinkQueuePage />;
  if (path.startsWith("/app/finance/insights")) return <FinInsightsPage />;
  if (path.startsWith("/app/fin/cash/import")) return <CashImportPage />;
  if (path.startsWith("/app/fin/revaluation")) return <RevaluationPage />;
  if (path.startsWith("/app/fin/agreements")) return <AgreementsPage />;
  if (path.startsWith("/app/fin/einvoices")) return <FinEinvoicesPage />;
  if (path.startsWith("/app/fin/inventory")) return <InventoryPage />;
  if (path.startsWith("/app/fin/registry")) return <FinRegistryPage />;
  if (path.startsWith("/app/fin/invoices")) return <FinInvoicesPage />;
  if (path.startsWith("/app/fin/expenses")) return <FinExpensesPage />;
  if (path.startsWith("/app/fin/captures")) return <CapturesListPage />;
  if (path.startsWith("/app/fin/reconcile")) return <ReconcilePage />;
  if (path.startsWith("/app/fin/payments")) return <FinPaymentsPage />;
  if (path.startsWith("/app/fin/calendar")) return <FinCalendarPage />;
  if (path.startsWith("/app/fin/banklink")) return <BankLinkPage />;
  if (path.startsWith("/app/fin/parties")) return <PartiesPage />;
  if (path.startsWith("/app/fin/payroll")) return <PayrollFINPage />;
  if (path.startsWith("/app/fin/itpark")) return <ItparkList />;
  if (path.startsWith("/app/fin/assets")) return <AssetsPage />;
  if (path.startsWith("/app/fin/ledger")) return <FinLedgerPage />;
  if (path.startsWith("/app/fin/budget")) return <BudgetPage />;
  if (path.startsWith("/app/fin/export")) return <FinExportCenter />;
  if (path.startsWith("/app/fin/cash")) return <CashPage />;
  if (path.startsWith("/app/fin/mass")) return <FinMassPage />;
  if (path.startsWith("/app/fin/tax")) return <TaxPage />;
  if (path.startsWith("/app/fin/")) return <FinHome />;
  if (path.startsWith("/app")) return <DashboardPage />;
  // PAY-003: /portal/invoice/:id — parent-facing invoice portal (no auth)
  if (path.match(/^\/portal\/invoice\/[^/]+$/)) return <InvoicePortalPage />;
  // /feedback/:token — public no-auth page for students
  if (path.match(/^\/feedback\/[^/]+$/)) {
    const token = path.split("/")[2];
    return <FeedbackPublicPage token={token} />;
  }
  // /verify/:token — DIPLOMA-805: public certificate verification (no auth)
  if (path.match(/^\/verify\/[^/]+$/)) {
    const token = path.split("/")[2];
    return <VerifyCertificatePage token={token} />;
  }
  return <HomePage />;
}

// Wraps the route tree in an ErrorBoundary keyed by the current path, so a render crash on one
// page shows a recoverable error card instead of white-screening the whole SPA, and navigating
// to another route clears it (IMPROVEMENTS #8).
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <span className="sr-only">Se încarcă…</span>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden="true"
      />
    </div>
  );
}

function BoundedRoutes() {
  const { path } = useRouter();
  return (
    <ErrorBoundary resetKey={path}>
      {/* PERF: Suspense boundary for the lazy-loaded route chunks */}
      <Suspense fallback={<RouteFallback />}>
        <Routes />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <HashRouter>
      {/* BRANCH-702: BranchProvider wraps all app routes so useBranch() works from any page */}
      <BranchProvider>
        <BoundedRoutes />
        {import.meta.env.DEV && <BackendStatusBadge />}
      </BranchProvider>
    </HashRouter>
  );
}
