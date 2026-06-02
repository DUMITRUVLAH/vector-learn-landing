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
import { CXPage } from "./pages/app/CXPage";
import { DiplomaPage } from "./pages/app/DiplomaPage";
import { FormsPage } from "./pages/app/FormsPage";
import { FormBuilderPage } from "./pages/app/FormBuilderPage";
import { FormPublicPage } from "./pages/public/FormPublicPage";
import { StripeSettingsPage } from "./pages/app/StripeSettingsPage"; // PAY-004
import { PaymentPlansPage } from "./pages/app/PaymentPlansPage"; // PAY-006
import { AccountingPage } from "./pages/app/AccountingPage"; // PAY-008

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
  if (path.startsWith("/app/login")) return <LoginPage />;
  if (path.startsWith("/app/signup")) return <SignupPage />;
  // STU-201: /app/students/:id — student detail page (before /app/students list)
  if (path.match(/^\/app\/students\/[^/]+$/)) {
    const id = path.split("/").pop()!;
    return <StudentDetailPage studentId={id} />;
  }
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
  if (path.startsWith("/app/settings/integrations/stripe")) return <StripeSettingsPage />; // PAY-004
  if (path.startsWith("/app/payment-plans")) return <PaymentPlansPage />; // PAY-006
  if (path.startsWith("/app/accounting")) return <AccountingPage />; // PAY-008
  if (path.startsWith("/app/cadences")) return <CadencesPage />;
  if (path.startsWith("/app/audit-log")) return <LeadAuditLogPage />;
  if (path.startsWith("/app/contracts")) return <ContractsPage />;
  if (path.startsWith("/app/feedback")) return <FeedbackPage />;
  if (path.startsWith("/app/invoices")) return <InvoicesPage />;
  if (path.startsWith("/app/cx")) return <CXPage />;
  if (path.startsWith("/app/diplome")) return <DiplomaPage />;
  // FORMS-002: /app/forms/:id/edit must be checked before /app/forms
  if (path.match(/^\/app\/forms\/[^/]+\/edit$/)) {
    const id = path.split("/")[3];
    return <FormBuilderPage formId={id} />;
  }
  if (path.startsWith("/app/forms")) return <FormsPage />;
  if (path.startsWith("/app/groups")) return <GroupsPage />;
  if (path.startsWith("/app/promo-codes")) return <PromoCodesPage />;
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
      {/* BRANCH-702: BranchProvider gives all pages access to the active branch selection */}
      <BranchProvider>
        <Routes />
        {import.meta.env.DEV && <BackendStatusBadge />}
      </BranchProvider>
    </HashRouter>
  );
}
