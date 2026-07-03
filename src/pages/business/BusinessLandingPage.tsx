/**
 * SPLIT-102: Business Suite Landing Page — /business
 *
 * Pagina de landing dedicată aplicației Business Suite (FinDesk + PAR + ITPark).
 * Separată complet de landing-ul CRM educațional de la `/`.
 * CTA primar "Intră în cont" → /business/login.
 * Vector 365 semantic tokens, light+dark, WCAG AA.
 */
import { ClipboardList, Building2, LogIn, ArrowRight, Landmark } from "lucide-react";
import { Link } from "@/router/HashRouter";
import { FinFlowMark } from "@/components/business/FinFlowLogo";

interface ModuleCard {
  icon: typeof Landmark;
  title: string;
  description: string;
  href: string;
  badge: string;
}

const MODULES: ModuleCard[] = [
  {
    icon: Landmark,
    title: "FinDesk",
    description:
      "Gestiune financiară completă — facturi, cheltuieli, plăți, conturi bancare, rapoarte TVA și e-Factura Moldova.",
    href: "/business/fin/",
    badge: "Finanțe",
  },
  {
    icon: ClipboardList,
    title: "PAR — Cereri de plată",
    description:
      "Flux de aprobare pentru cereri de plată: creare, routing multi-nivel, inbox aprobare, rapoarte de buget.",
    href: "/business/par",
    badge: "Aprobare",
  },
  {
    icon: Building2,
    title: "ITPark — Rezidenți",
    description:
      "Gestionare rezidenți parc IT — contracte MITP, declarații proprii, perioadele de rezidență și raportare anuală.",
    href: "/business/itpark",
    badge: "ITPark",
  },
];

export function BusinessLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav bar minimal */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20 flex items-center px-4 sm:px-8 gap-4">
        <span className="font-display font-bold text-base flex items-center gap-2">
          <FinFlowMark size={28} />
          <span className="hidden sm:inline">FinFlow</span>
        </span>
        <div className="flex-1" />
        <Link
          to="/business/login"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Intră în cont
        </Link>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-8 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
          FinFlow · PAR · ITPark
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight text-foreground mb-4">
          FinFlow —<br />
          <span className="text-primary">Controlul financiar complet</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Trei module integrate: gestiune financiară, aprobări de plăți și administrare rezidenți
          IT — toate într-o singură platformă, cu login dedicat.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/business/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            Intră în cont
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/business/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            Demo dashboard
          </Link>
        </div>
      </section>

      {/* Module cards */}
      <section
        aria-labelledby="modules-heading"
        className="py-16 px-4 sm:px-8 max-w-5xl mx-auto"
      >
        <h2
          id="modules-heading"
          className="text-2xl font-display font-bold text-center mb-10 text-foreground"
        >
          Trei module, o singură sursă de adevăr
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                to={mod.href}
                className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:bg-muted/40 transition-colors"
                aria-label={`Deschide ${mod.title}`}
              >
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center justify-center rounded-lg bg-primary/10 p-3">
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {mod.badge}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1">{mod.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{mod.description}</p>
                </div>
                <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                  Deschide <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA strip */}
      <section className="py-16 px-4 sm:px-8 text-center bg-muted/30 border-t border-border">
        <h2 className="text-xl font-display font-bold text-foreground mb-3">
          Gata de pornit?
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Logați-vă cu contul FinFlow și accesați modulele PAR și ITPark.
        </p>
        <Link
          to="/business/login"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Intră în cont
        </Link>
      </section>

      {/* Footer minimal */}
      <footer className="py-6 px-4 sm:px-8 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">
          FinFlow · PAR · ITPark ·{" "}
          <Link to="/" className="underline hover:text-foreground transition-colors">
            CRM Educațional →
          </Link>
        </p>
      </footer>
    </div>
  );
}
