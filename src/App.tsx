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
  return <HomePage />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes />
    </HashRouter>
  );
}
