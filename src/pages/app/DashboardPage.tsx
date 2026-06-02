import {
  Users, Calendar, CreditCard, GraduationCap, LogOut, Loader2, Sun, TrendingUp,
  FileText, Receipt, BookOpen, ClipboardList, Baby, MessageCircle, AlertTriangle, Building2,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import { Link, useRouter } from "@/router/HashRouter";
import { isModuleVisible, institutionLabel, type ModuleAudience } from "@/lib/institution";

interface DashCard {
  icon: typeof Users;
  label: string;
  href: string;
  desc: string;
  pastel: string;
}

interface DashSection {
  title: string;
  audience: ModuleAudience;
  cards: DashCard[];
}

/**
 * INST-001: Dashboard reorganized into module sections. Each section is gated by
 * institution type (gradinita / scoala / mixt) so the workspace only shows the
 * shortcuts that apply to it. "shared" sections always show.
 */
const SECTIONS: DashSection[] = [
  {
    title: "Zi de zi",
    audience: "shared",
    cards: [
      { icon: Sun, label: "Azi", href: "/app/leads/today", pastel: "pastel-peach", desc: "Task-uri, follow-up, leaduri noi" },
      { icon: TrendingUp, label: "Leads", href: "/app/leads", pastel: "pastel-mint", desc: "Pipeline CRM · kanban / listă" },
      { icon: FileText, label: "Contracte", href: "/app/contracts", pastel: "pastel-lavender", desc: "OCR buletin · PDF · număr auto" },
    ],
  },
  {
    title: "Școală",
    audience: "scoala",
    cards: [
      { icon: Users, label: "Elevi", href: "/app/students", pastel: "pastel-mint", desc: "Lista, profile, status" },
      { icon: BookOpen, label: "Grupe", href: "/app/cx", pastel: "pastel-sky", desc: "Grupe / clase pe ediții" },
      { icon: Calendar, label: "Orar", href: "/app/schedule", pastel: "pastel-lavender", desc: "Lecții programate" },
      { icon: ClipboardList, label: "Prezență", href: "/app/school/attendance", pastel: "pastel-peach", desc: "Cataloage și prezență" },
      { icon: GraduationCap, label: "Profesori", href: "/app/teachers", pastel: "pastel-mint", desc: "Echipa academiei" },
    ],
  },
  {
    title: "Grădiniță",
    audience: "gradinita",
    cards: [
      { icon: Baby, label: "Check-in", href: "/app/kinder/checkin", pastel: "pastel-sky", desc: "Sosiri / plecări copii" },
      { icon: FileText, label: "Jurnal copil", href: "/app/kinder/diary", pastel: "pastel-mint", desc: "Somn, masă, activități" },
      { icon: MessageCircle, label: "Feed parental", href: "/app/kinder/students", pastel: "pastel-lavender", desc: "Comunicare cu părinții" },
      { icon: AlertTriangle, label: "Incidente", href: "/app/kinder/incidents", pastel: "pastel-peach", desc: "Raportare incidente" },
    ],
  },
  {
    title: "Finanțe",
    audience: "shared",
    cards: [
      { icon: CreditCard, label: "Plăți", href: "/app/payments", pastel: "pastel-peach", desc: "Facturi, restanțe" },
      { icon: Receipt, label: "Facturi", href: "/app/invoices", pastel: "pastel-sky", desc: "Emitere și evidență" },
    ],
  },
];

export function DashboardPage() {
  const { status, data, logout } = useSession();
  const { navigate } = useRouter();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  if (status === "error" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
        Eroare conectare server. <Link to="/app/login" className="ml-2 underline">Înapoi la login</Link>
      </div>
    );
  }

  const { user, tenant } = data;

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  const sections = SECTIONS.filter((s) => isModuleVisible(s.audience, tenant.institutionType));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline text-xs text-muted-foreground">/</span>
            <span className="text-sm font-semibold">{tenant.name}</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
              {tenant.plan}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user.role}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
              Salut, {user.name.split(" ")[0]} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Conectat ca {user.role} la {tenant.name}
            </p>
          </div>
          {/* INST-001: current institution type + quick link to change it */}
          <Link
            to="/app/settings/institution"
            className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            {institutionLabel(tenant.institutionType)}
          </Link>
        </div>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
                {section.title}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {section.cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      to={card.href}
                      className="rounded-2xl border border-border bg-card p-6 card-hover block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className={`${card.pastel} rounded-xl p-2.5 w-fit mb-4`}>
                        <Icon className="h-5 w-5 text-foreground/80" />
                      </div>
                      <h3 className="text-base font-bold mb-1">{card.label}</h3>
                      <p className="text-xs text-muted-foreground">{card.desc}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
