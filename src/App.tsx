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
import { TeachersPage } from "./pages/app/TeachersPage";
import { PaymentsPage } from "./pages/app/PaymentsPage";
import { LeadsPage } from "./pages/app/LeadsPage";
import { LeadCardPage } from "./pages/app/LeadCardPage";
import { TemplatesPage } from "./pages/app/TemplatesPage";
import { AutomationsPage } from "./pages/app/AutomationsPage";
import { AnalyticsPage } from "./pages/app/AnalyticsPage";
import { CadencesPage } from "./pages/app/CadencesPage";
import { AuditLogPage } from "./pages/app/AuditLogPage";
import { InvoicesPage } from "./pages/app/InvoicesPage";

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
  // AUTH-001: password reset pages (must be before /app catch-all)
  if (path.startsWith("/app/forgot-password")) return <ForgotPasswordPage />;
  if (path.startsWith("/app/reset")) return <ResetPasswordPage />;
  // AUTH-002: accept team invitation (public, no auth required)
  if (path.startsWith("/app/accept-invitation")) return <AcceptInvitationPage />;
  // AUTH-003: user profile + GDPR settings
  if (path.startsWith("/app/settings/profile")) return <ProfilePage />;
  // AUTH-004: security settings (2FA + session management)
  if (path.startsWith("/app/settings/security")) return <SecurityPage />;
  // AUTH-004: 2FA verification step (shown after password login when 2FA is enabled)
  if (path.startsWith("/app/verify-2fa")) return <Verify2FAPage />;
  if (path.startsWith("/app/students")) return <StudentsPage />;
  if (path.startsWith("/app/courses")) return <CoursesPage />; // COURSE-101
  // COURSE-103: /app/groups/:id — group detail with "Elevi înrolați" tab
  if (path.match(/^\/app\/groups\/[^/]+$/)) {
    const id = path.split("/").pop()!;
    return <GroupDetailPage groupId={id} />;
  }
  if (path.startsWith("/app/groups")) return <GroupsPage />; // COURSE-102
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
  if (path.startsWith("/app/settings/crm/automations")) return <AutomationsPage />;
  if (path.startsWith("/app/settings/crm/templates")) return <TemplatesPage />;
  if (path.startsWith("/app/cadences")) return <CadencesPage />;
  if (path.startsWith("/app/audit-log")) return <AuditLogPage />;
  if (path.startsWith("/app/invoices")) return <InvoicesPage />;
  if (path.startsWith("/app/leads")) return <LeadsPage />;
  if (path.startsWith("/app")) return <DashboardPage />;
  // PAY-003: /portal/invoice/:id — parent-facing invoice portal (no auth)
  if (path.match(/^\/portal\/invoice\/[^/]+$/)) return <InvoicePortalPage />;
  // /feedback/:token — public no-auth page for students
  if (path.match(/^\/feedback\/[^/]+$/)) {
    const token = path.split("/")[2];
    return <FeedbackPublicPage token={token} />;
  }
  // FORMS-003: /f/:slug — public conversational form renderer (no auth)
  if (path.match(/^\/f\/[^/]+$/)) {
    const slug = path.split("/")[2];
    return <FormPublicPage slug={slug} />;
  }
  return <HomePage />;
}

export default function App() {
  return (
    <HashRouter>
      {/* BRANCH-702: BranchProvider wraps all app routes so useBranch() works from any page */}
      <BranchProvider>
        <Routes />
        {import.meta.env.DEV && <BackendStatusBadge />}
      </BranchProvider>
    </HashRouter>
  );
}
