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
import { OrarPage } from "./pages/modules/OrarPage";
import { FinantePage } from "./pages/modules/FinantePage";
import { CRMPage } from "./pages/modules/CRMPage";
import { ComunicarePage } from "./pages/modules/ComunicarePage";
import { MobilePage } from "./pages/modules/MobilePage";
import { RapoartePage } from "./pages/modules/RapoartePage";
import { HRPage } from "./pages/modules/HRPage";
import { MultifilalePage } from "./pages/modules/MultifilalePage";
import { IntegrariPage } from "./pages/modules/IntegrariPage";
import { AIPage } from "./pages/modules/AIPage";
import { LimbiPage } from "./pages/audiences/LimbiPage";
import { ProgramarePage } from "./pages/audiences/ProgramarePage";
import { MuzicaPage } from "./pages/audiences/MuzicaPage";
import { ExamenePage } from "./pages/audiences/ExamenePage";
import { ROICalculatorPage } from "./pages/tools/ROICalculatorPage";
import { MigrationEstimatorPage } from "./pages/tools/MigrationEstimatorPage";
import { PricingConfiguratorPage } from "./pages/tools/PricingConfiguratorPage";
import { BackendStatusBadge } from "./components/BackendStatusBadge";
import { LoginPage } from "./pages/app/LoginPage";
import { SignupPage } from "./pages/app/SignupPage";
import { DashboardPage } from "./pages/app/DashboardPage";
import { StudentsPage } from "./pages/app/StudentsPage";
import { StudentDetailPage } from "./pages/app/StudentDetailPage"; // STU-201
import { SchedulePage } from "./pages/app/SchedulePage";
import { CheckInPage } from "./pages/app/CheckInPage"; // GAP-018
import { TeachersPage } from "./pages/app/TeachersPage";
import { PaymentsPage } from "./pages/app/PaymentsPage";
import { LeadsPage } from "./pages/app/LeadsPage";
import { LeadCardPage } from "./pages/app/LeadCardPage";
import { TemplatesPage } from "./pages/app/TemplatesPage";
import { AutomationsPage } from "./pages/app/AutomationsPage";
import { AnalyticsPage } from "./pages/app/AnalyticsPage";
import { AdvancedAnalyticsPage } from "./pages/app/AdvancedAnalyticsPage"; // GAP-016
import { PayrollPage } from "./pages/app/PayrollPage";
import { TeacherStatsPage } from "./pages/app/TeacherStatsPage";
import { AvailabilityPage } from "./pages/app/AvailabilityPage";
import { AuditLogPage } from "./pages/app/AuditLogPage";
import { TodayDashboardPage } from "./pages/app/TodayDashboardPage";
import { CadencesPage } from "./pages/app/CadencesPage";
import { LeadAuditLogPage } from "./pages/app/LeadAuditLogPage";
import { ContractsPage } from "./pages/app/ContractsPage";
import { FeedbackPage } from "./pages/app/FeedbackPage";
import { FeedbackPublicPage } from "./pages/app/FeedbackPublicPage";
import { InvoicesPage } from "./pages/app/InvoicesPage";
import { PaymentAccountsPage } from "./pages/app/PaymentAccountsPage"; // CONT-PLATA
import { PaymentAccountEditorPage } from "./pages/app/PaymentAccountEditorPage"; // CONT-PLATA
import { PaymentAccountViewPage } from "./pages/app/PaymentAccountViewPage"; // CONT-PLATA
import { SellerProfilePage } from "./pages/app/SellerProfilePage"; // CONT-PLATA
import { CXPage } from "./pages/app/CXPage";
import { DiplomaPage } from "./pages/app/DiplomaPage";
import { KinderCheckinPage } from "./pages/app/KinderCheckinPage";
import { KinderPickupsPage } from "./pages/app/KinderPickupsPage";
import { KinderDiaryPage } from "./pages/app/KinderDiaryPage";
import { KinderRatioPage } from "./pages/app/KinderRatioPage";
import { KinderMedicalPage } from "./pages/app/KinderMedicalPage";
import { KinderImmunizationReportPage } from "./pages/app/KinderImmunizationReportPage";
import { KinderParentFeedPage } from "./pages/app/KinderParentFeedPage";
import { KinderCompliancePage } from "./pages/app/KinderCompliancePage";
import KinderIncidentsPage from "./pages/app/KinderIncidentsPage";
import { MobileSchedulePage } from "./pages/app/mobile/MobileSchedulePage";
import { HomeworkPage } from "./pages/app/mobile/HomeworkPage";
import { NotificationsSettingsPage } from "./pages/app/mobile/NotificationsSettingsPage";
import { ParentDashboardPage } from "./pages/app/mobile/ParentDashboardPage";
import { ChatPage } from "./pages/app/mobile/ChatPage";
import { XpPage } from "./pages/app/mobile/XpPage";
import { LeaderboardPage } from "./pages/app/mobile/LeaderboardPage";
import { StudentDashboardPage } from "./pages/app/mobile/StudentDashboardPage";
import { GradingPage } from "./pages/app/GradingPage";
import { GamificationPage } from "./pages/app/GamificationPage";
import { ApiKeysPage } from "./pages/app/settings/ApiKeysPage";
import { WebhooksPage } from "./pages/app/settings/WebhooksPage";
import { IntegrationsPage } from "./pages/app/settings/IntegrationsPage";
import { InstitutionPage } from "./pages/app/settings/InstitutionPage";
import { KpiDashboardPage } from "./pages/app/KpiDashboardPage";
import { RevenueChartsPage } from "./pages/app/RevenueChartsPage";
import { StudentRetentionPage } from "./pages/app/StudentRetentionPage";
import { ExportPage } from "./pages/app/ExportPage";
import { InvoicePortalPage } from "./pages/portal/InvoicePortalPage";
import { VerifyCertificatePage } from "./pages/public/VerifyCertificatePage";
import { ErrorBoundary } from "./components/ErrorBoundary";
// PAR-105: Create wizard
import { ParCreateWizard } from "./pages/par/ParCreateWizard";
// PAR-106: Dashboard + list
import { ParDashboard } from "./pages/par/ParDashboard";
// PAR-108: Approver inbox
import ParInbox from "./pages/par/ParInbox";
// PAR-112: Finance queue
import ParFinanceQueue from "./pages/par/ParFinanceQueue";
// PAR-115: PAR detail page with PDF download
import ParDetailPage from "./pages/par/ParDetail";
// PAR-116: Admin panel
import ParAdmin from "./pages/par/ParAdmin";
// PAR-117: Reports
import { ParReports } from "./pages/par/ParReports";
// CASH-002: FinDesk cash — import + overview
import CashPage from "./pages/fin/CashPage";
import CashImportPage from "./pages/fin/CashImportPage";
import FinPaymentsPage from "./pages/fin/PaymentsPage";
import { useState, useEffect } from "react";
import { getParMe } from "./lib/api/par";

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
  // CASH-002: /app/fin/cash/import — import page (before generic cash)
  if (path.startsWith("/app/fin/cash/import")) return <CashImportPage />;
  // CASH-002: /app/fin/cash — overview tranzacții
  if (path.startsWith("/app/fin/cash")) return <CashPage />;
  // CASH-004: /app/fin/payments — registru plăți + alocare + coada nepotrivite
  if (path.startsWith("/app/fin/payments")) return <FinPaymentsPage />;
  if (path.startsWith("/app/leads")) return <LeadsPage />;
  if (path.startsWith("/app/reports/kpi")) return <KpiDashboardPage />;
  if (path.startsWith("/app/reports/revenue")) return <RevenueChartsPage />;
  if (path.startsWith("/app/reports/retention")) return <StudentRetentionPage />;
  if (path.startsWith("/app/reports/export")) return <ExportPage />;
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
      {/* BRANCH-702: BranchProvider wraps all app routes so useBranch() works from any page */}
      <BranchProvider>
        <BoundedRoutes />
        {import.meta.env.DEV && <BackendStatusBadge />}
      </BranchProvider>
    </HashRouter>
  );
}
