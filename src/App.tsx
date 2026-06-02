import { HashRouter, useRouter } from "./router/HashRouter";
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
// MOB-101: Mobile PWA pages
import { StudentDashboardPage } from "./pages/app/mobile/StudentDashboardPage";
import { MobileSchedulePage } from "./pages/app/mobile/MobileSchedulePage";
// MOB-102: Homework + grading
import { HomeworkPage } from "./pages/app/mobile/HomeworkPage";
import { GradingPage } from "./pages/app/GradingPage";

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
  // MOB-101/102: Mobile PWA routes — must come before /app/* to avoid /app fallback
  if (path.startsWith("/m/schedule")) return <MobileSchedulePage />;
  if (path.startsWith("/m/homework")) return <HomeworkPage />;
  if (path.startsWith("/m/")) return <StudentDashboardPage />;
  // MOB-102: Teacher grading
  if (path.startsWith("/app/grading")) return <GradingPage />;
  if (path.startsWith("/app/login")) return <LoginPage />;
  if (path.startsWith("/app/signup")) return <SignupPage />;
  if (path.startsWith("/app/students")) return <StudentsPage />;
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
  if (path.startsWith("/app/settings/crm/automations")) return <AutomationsPage />;
  if (path.startsWith("/app/settings/crm/templates")) return <TemplatesPage />;
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
  if (path.startsWith("/app/leads")) return <LeadsPage />;
  if (path.startsWith("/app")) return <DashboardPage />;
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
      <Routes />
      {import.meta.env.DEV && <BackendStatusBadge />}
    </HashRouter>
  );
}
