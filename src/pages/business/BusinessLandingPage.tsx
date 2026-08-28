/**
 * FinFlow — pagina publică de prezentare (`/business`).
 *
 * Design: împrumutat din landing-ul HR365 by Vector (repo `vector-b2b`, `src/pages/Index.tsx`) —
 * navbar `glass`, hero cu titlu subliniat, bara de statistici, blocul cu slide-uri care se
 * schimbă singure, showcase-uri alternate stânga/dreapta, prețuri cu calculator, formular de
 * contact, CTA final. Conținutul e însă al FinFlow: achiziții și aprobări interne de finanțe.
 *
 * Diferența față de HR365: acolo showcase-urile sunt capturi de ecran (`.png` în `src/assets`).
 * Aici nu avem capturi publicabile — datele reale ale clienților sunt beneficiari, IDNP-uri și
 * IBAN-uri —, așa că fiecare vizual e reconstruit în markup din tokenii semantici. Se randează
 * corect în light + dark, nu cântărește nimic în bundle și nu poate scăpa un IBAN pe internet.
 *
 * Preț (directivă owner): 20 $/lună per utilizator-manager (aprobator / finanțe / administrator),
 * 5 $/lună per restul echipei (solicitanți). Constantele sunt jos, în `PRICING`.
 *
 * Reguli respectate: tokeni semantici (fără hex în .tsx), light + dark, WCAG AA (ținte ≥ 44px,
 * `aria-label` pe butoanele fără text), zero `any`.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Landmark,
  Lock,
  LogIn,
  Mail,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { Link } from "@/router/HashRouter";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ds";

/** Adresa pe care ajung cererile de demo. Un singur loc de schimbat. */
const CONTACT_EMAIL = "contact@finflow.best";

/** Prețuri lunare, în USD, fără TVA. */
const PRICING = { manager: 20, member: 5 } as const;

export function BusinessLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <Hero />
      <StatsBar />
      <FeatureCarousel />
      <Benefits />
      <Showcases />
      <RolesSection />
      <SecurityStrip />
      <ModulesStrip />
      <PricingSection />
      <ContactSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Navbar ─────────────────────────── */

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "#flux", label: "Fluxul" },
  { href: "#functionalitati", label: "Funcționalități" },
  { href: "#roluri", label: "Roluri" },
  { href: "#preturi", label: "Prețuri" },
  { href: "#contact", label: "Contact" },
];

function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
        <span className="font-display text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
          <FinFlowMark size={28} />
          FinFlow <span className="hidden sm:inline text-muted-foreground font-medium">by Vector</span>
        </span>
        <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" href="/business/login" className="hidden sm:inline-flex">
            <LogIn className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Autentificare
          </Button>
          <Button size="sm" href="/business/signup">
            Începe gratuit <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
  return (
    <section className="pt-24 sm:pt-32 pb-8 sm:pb-14 px-4 sm:px-6 relative">
      <div className="absolute top-20 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute top-32 -right-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
            Achiziții și aprobări interne · MDL / EUR / USD · e-Factura SFS
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] mb-5 tracking-tight">
            Nicio plată fără aprobare.{" "}
            <span className="text-gradient relative lg:whitespace-nowrap">
              Nicio aprobare fără urmă
              {/* Sublinierea desenată e ancorată la o linie de text; sub 1024 px titlul se rupe pe
                  două rânduri, așa că o ascundem în loc s-o lăsăm să traverseze ruptura. */}
              <svg
                className="hidden lg:block absolute -bottom-1 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                aria-hidden="true"
              >
                <path d="M2 8C50 2 200 2 298 8" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
              </svg>
            </span>
            .
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8">
            FinFlow ia formularul de cerere de plată de pe hârtie, aprobările de pe WhatsApp și
            dosarul din Excel și le pune într-un singur traseu: cine cere, cine semnează, cine
            plătește. La capăt rămân PDF-ul oficial și un audit pe care îl poți da donatorului sau
            auditorului fără să cauți nimic.
          </p>
          <div className="flex gap-3 justify-center flex-col sm:flex-row">
            <Button size="lg" href="/business/signup" className="h-12 px-8 text-base rounded-xl">
              Începe gratuit <ArrowRight className="h-5 w-5 ml-2" aria-hidden="true" />
            </Button>
            <a
              href="#flux"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl border border-border bg-card text-base font-medium hover:bg-muted transition-colors touch-target"
            >
              Vezi fluxul complet
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Fără card bancar · configurare în aceeași zi · datele rămân ale organizației tale
          </p>
        </div>

        <HeroMock />
      </div>
    </section>
  );
}

/** Reconstrucția în markup a ecranului de cerere — fără capturi cu date reale. */
function HeroMock() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* Coloana stângă — contoare de stare */}
        <div className="col-span-3 hidden lg:block space-y-3">
          <Card tone="dashboard" className="p-3 shadow-lg">
            <p className="text-xs font-semibold mb-2">Cererile mele</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Ciorne", value: "2", cls: "bg-muted text-muted-foreground" },
                { label: "La aprobat", value: "5", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
                { label: "La finanțe", value: "3", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
                { label: "Achitate", value: "41", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg p-2.5 text-center ${s.cls}`}>
                  <p className="text-base font-bold leading-none">{s.value}</p>
                  <p className="text-[10px] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card tone="dashboard" className="p-3 shadow-lg">
            <p className="text-xs font-semibold mb-1">Curs BNM · azi</p>
            <div className="space-y-1.5 text-[11px]">
              {[
                { code: "EUR", rate: "19,84", delta: "+0,06" },
                { code: "USD", rate: "17,12", delta: "−0,03" },
              ].map((r) => (
                <div key={r.code} className="flex items-center justify-between">
                  <span className="font-medium">{r.code}</span>
                  <span className="tabular-nums">{r.rate}</span>
                  <span className="text-muted-foreground tabular-nums">{r.delta}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Cardul central — o cerere de plată */}
        <div className="col-span-12 lg:col-span-6">
          <Card tone="dashboard" className="overflow-hidden shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-bold">PAR-2026-0042</p>
                <p className="text-[11px] text-muted-foreground">Digital Safeguard · ATIC</p>
              </div>
              <Badge variant="warning">La aprobare</Badge>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {[
                  { k: "Beneficiar", v: "Daria R." },
                  { k: "IBAN", v: "MD48 …8121", ok: true },
                  { k: "Cod bugetar", v: "6.2.1 · Servicii" },
                  { k: "Plata estimată", v: "24 iun. 2026" },
                ].map((f) => (
                  <div key={f.k}>
                    <p className="text-muted-foreground">{f.k}</p>
                    <p className="font-medium flex items-center gap-1">
                      {f.v}
                      {f.ok ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : null}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
                  <span>Servicii de consiliere psihologică · 1 sesiune</span>
                  <span className="tabular-nums">7 000,00</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-bold">
                  <span>Total estimat</span>
                  <span className="tabular-nums">MDL 7 000,00</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Lanț de aprobare · matricea DOA
                </p>
                {[
                  { step: "1", name: "Ana Chiriță", role: "Director proiecte", state: "approved" as const },
                  { step: "2", name: "Irina Oriol", role: "Director executiv", state: "pending" as const },
                ].map((a) => (
                  <div key={a.step} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        a.state === "approved"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {a.state === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : a.step}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate">{a.name}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{a.role}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {a.state === "approved" ? "semnat · 10 iun." : "așteaptă"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-[11px] font-medium">Conținut sigilat la trimitere</span>
              <span className="ml-auto text-[10px] text-muted-foreground">PDF oficial · 16 secțiuni</span>
            </div>
          </Card>
        </div>

        {/* Coloana dreaptă — execuția bugetului */}
        <div className="col-span-3 hidden lg:block space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Fiecare cerere își trage banii dintr-un cod bugetar. Execuția se vede în timp real, nu
            la închiderea lunii.
          </p>
          <Card tone="dashboard" className="p-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold">Execuție buget</p>
              <Badge variant="outline">Iunie</Badge>
            </div>
            <p className="text-2xl font-bold text-primary mb-1">
              68<span className="text-sm font-normal text-muted-foreground">%</span>
            </p>
            <p className="text-[10px] text-muted-foreground mb-2">alocat · angajat · plătit</p>
            <div className="space-y-1.5">
              {[
                { label: "Alocat", pct: 100, cls: "bg-primary/25" },
                { label: "Angajat", pct: 68, cls: "bg-primary/60" },
                { label: "Plătit", pct: 41, cls: "bg-primary" },
              ].map((b) => (
                <div key={b.label}>
                  <p className="text-[9px] text-muted-foreground mb-0.5">{b.label}</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Bara de statistici ─────────────────────────── */

function StatsBar() {
  const stats = [
    { icon: FileText, value: "16 secțiuni", label: "formularul oficial, redat 1:1 în PDF" },
    { icon: Users, value: "4 roluri", label: "solicitant · aprobator · finanțe · admin" },
    { icon: Wand2, value: "AI", label: "cererea se completează din contract" },
    { icon: ShieldCheck, value: "100%", label: "fiecare decizie, scrisă în audit" },
  ];

  return (
    <section className="border-y border-border bg-card/60 py-8 sm:py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
        {stats.map((s) => (
          <div key={s.value} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <s.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg sm:text-xl font-bold">{s.value}</span>
              <span className="block text-[11px] sm:text-xs text-muted-foreground">{s.label}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Blocul cu slide-uri ─────────────────────────── */

interface CarouselSlide {
  name: string;
  title: string;
  desc: string;
  visual: ReactNode;
}

function FeatureCarousel() {
  const [active, setActive] = useState(0);

  const slides: CarouselSlide[] = [
    {
      name: "AI din document",
      title: "Încarci contractul — cererea se completează singură",
      desc: "AI-ul citește contractul, factura sau actul de predare-primire și scoate beneficiarul, codul fiscal, IBAN-ul, suma și scopul. Nu confundă niciodată propria organizație cu prestatorul, iar când documentul are două companii, întreabă.",
      visual: (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
            <FileText className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium truncate flex-1">Contract CS-DigiSec-2026-06-08.pdf</span>
            <Badge variant="success">citit</Badge>
          </div>
          {[
            { k: "Beneficiar", v: "Daria Roitman" },
            { k: "IDNP", v: "2008001007903" },
            { k: "IBAN", v: "MD48ML000002259A19498121" },
            { k: "Sumă", v: "7 000,00 MDL" },
          ].map((f) => (
            <div key={f.k} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{f.k}</span>
              <span className="text-[11px] font-semibold tabular-nums truncate ml-3">{f.v}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Câmpurile rămân editabile — AI-ul propune, omul confirmă.
          </p>
        </div>
      ),
    },
    {
      name: "Matricea DOA",
      title: "Pragurile decid cine semnează, nu memoria nimănui",
      desc: "Configurezi o dată delegarea de autoritate — bandă de sumă, departament, tip de cheltuială — iar la trimitere lanțul de aprobare se construiește singur. Secvențial sau în paralel, cu delegare pe concediu și fără auto-aprobare.",
      visual: (
        <div className="space-y-2">
          {[
            { band: "≤ 10 000 MDL", chain: "Supervizor", steps: 1 },
            { band: "10 000 – 100 000", chain: "Supervizor → Director executiv", steps: 2 },
            { band: "> 100 000 MDL", chain: "Supervizor → Finanțe → Director", steps: 3 },
          ].map((r) => (
            <div key={r.band} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold tabular-nums">{r.band}</span>
                <Badge variant="outline">{r.steps} {r.steps === 1 ? "semnătură" : "semnături"}</Badge>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: r.steps }).map((_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-primary/70" />
                ))}
                {Array.from({ length: 3 - r.steps }).map((_, i) => (
                  <span key={`e${i}`} className="h-1.5 flex-1 rounded-full bg-muted" />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{r.chain}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      name: "Coada finanțelor",
      title: "Plata nu poate depăși ce s-a aprobat",
      desc: "Finanțele preiau cererea aprobată, completează secțiunea de plată și înregistrează suma reală. Dacă trece cu peste 10% peste estimare, cererea se întoarce automat la aprobare — regula tipărită pe formular, aplicată de sistem.",
      visual: (
        <div className="space-y-2.5">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground">Aprobat</span>
              <span className="font-semibold tabular-nums">7 000,00 MDL</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Plătit efectiv</span>
              <span className="font-semibold tabular-nums">8 050,00 MDL</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-0.5">
              Depășire 15% — se cere reaprobare
            </p>
            <p className="text-[10px] text-muted-foreground">
              Cererea a revenit la directorul executiv. Plata rămâne blocată până la decizie.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">
              Dovada plății și ordinul de plată rămân atașate cererii.
            </span>
          </div>
        </div>
      ),
    },
    {
      name: "e-Factura prestatorului",
      title: "Plata nu închide dosarul — factura da",
      desc: "După plată, FinFlow interoghează SIA „e-Factura” ca și cumpărător și potrivește factura cu cererea după codul fiscal, fereastra de timp și sumă. Dacă lipsește, trimite un reminder solicitantului. Dacă SFS nu răspunde, spune „indisponibil”, nu „lipsă”.",
      visual: (
        <div className="space-y-2">
          {[
            { name: "SRL Alfa Consult", sum: "24 000 MDL", state: "primită", tone: "success" as const },
            { name: "SRL Tehnograf", sum: "8 400 MDL", state: "lipsește", tone: "warning" as const },
            { name: "Daria Roitman", sum: "7 000 MDL", state: "persoană fizică", tone: "secondary" as const },
          ].map((r) => (
            <div key={r.name} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold truncate">{r.name}</span>
                <span className="block text-[10px] text-muted-foreground tabular-nums">{r.sum}</span>
              </span>
              <Badge variant={r.tone}>{r.state}</Badge>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              Un reminder pe zi, maximum — și fiecare e scris în audit.
            </p>
          </div>
        </div>
      ),
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setActive((p) => (p + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[active];

  return (
    <section className="py-10 sm:py-14 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" aria-hidden="true" />

        <div className="p-6 sm:p-8 pb-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="default">CE FACE, CONCRET</Badge>
            <span className="text-xs font-medium text-muted-foreground">
              Patru lucruri pe care astăzi le faci de mână
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">
            Munca dintre „am nevoie de bani” și „s-a plătit”
          </h2>
        </div>

        <div className="p-6 sm:p-8 pt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Arată ${s.name}`}
                  aria-current={i === active}
                  className={`h-6 rounded-full transition-all ${
                    i === active ? "w-8 bg-primary" : "w-3 bg-muted-foreground/25 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
            <Badge variant="outline">{slide.name}</Badge>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:min-h-[300px]">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base sm:text-lg mb-2">{slide.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">{slide.desc}</p>
            </div>
            <div className="w-full lg:w-[380px] shrink-0">
              <div className="rounded-xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm">
                {slide.visual}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 pb-6 sm:pb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-primary/10">
            <p className="flex-1 text-xs text-muted-foreground">
              <strong className="text-foreground">Fără card bancar.</strong> Îți deschizi workspace-ul,
              îți urci codurile bugetare din Excel și trimiți prima cerere azi.
            </p>
            <Button href="/business/signup" className="rounded-xl shrink-0">
              Deschide workspace <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Beneficii ─────────────────────────── */

function Benefits() {
  const benefits = [
    {
      icon: ShieldCheck,
      number: "100%",
      title: "Nu mai cauți cine a aprobat",
      desc: "Fiecare decizie are nume, funcție, oră și comentariu. Formularul oficial se generează din ele — nu se mai completează de mână și nu se mai pierde între birouri.",
      tone: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      icon: Clock,
      number: "2 min",
      title: "O cerere, nu o după-amiază",
      desc: "AI-ul completează din contract, registrul de beneficiari ține IBAN-urile validate, iar liniile deja plătite o dată se aleg dintr-o listă în loc să fie retastate.",
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: BarChart3,
      number: "3 cifre",
      title: "Alocat, angajat, plătit — pe loc",
      desc: "Orice cod bugetar, proiect sau plătitor răspunde la aceeași întrebare: cât aveam, cât am promis, cât a ieșit din cont. Fără consolidat de Excel-uri la final de lună.",
      tone: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
    },
  ];

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="outline">De ce FinFlow</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold mt-4 mb-3">
            Controlul nu trebuie să coste o zi de muncă pe săptămână
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Organizațiile finanțate din granturi nu pierd bani pentru că lipsesc regulile, ci pentru
            că regulile trăiesc pe hârtie, în capul cuiva și în trei fișiere Excel.
          </p>
        </div>
        <div className="grid gap-5 lg:gap-6 grid-cols-1 lg:grid-cols-3">
          {benefits.map((b) => (
            <Card key={b.title} tone="dashboard" hover className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${b.bg}`}>
                  <b.icon className={`h-6 w-6 ${b.tone}`} aria-hidden="true" />
                </span>
                <span className={`text-3xl font-bold opacity-40 ${b.tone}`}>{b.number}</span>
              </div>
              <h3 className="font-bold text-lg mb-3">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Showcase-uri ─────────────────────────── */

interface ShowcaseProps {
  id?: string;
  badge: string;
  title: string;
  subtitle: string;
  bullets: string[];
  visual: ReactNode;
  reverse: boolean;
}

function Showcase({ id, badge, title, subtitle, bullets, visual, reverse }: ShowcaseProps) {
  return (
    <div id={id} className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center scroll-mt-24">
      <div className={reverse ? "order-2" : "order-2 lg:order-1"}>
        <Badge variant="outline">{badge}</Badge>
        <h3 className="text-2xl sm:text-3xl font-bold mt-4 mb-4 leading-tight">{title}</h3>
        <p className="text-muted-foreground mb-6 text-sm sm:text-base leading-relaxed">{subtitle}</p>
        <ul className="space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
              <span className="text-sm">{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "order-1" : "order-1 lg:order-2"}>
        <Card tone="dashboard" className="p-4 sm:p-6 shadow-xl">{visual}</Card>
      </div>
    </div>
  );
}

const FLOW_STAGES: { label: string; who: string; done: boolean }[] = [
  { label: "Cerere", who: "Solicitant", done: true },
  { label: "Trimisă & sigilată", who: "Sistem", done: true },
  { label: "Aprobare DOA", who: "Aprobatori", done: true },
  { label: "Finanțe", who: "Contabilitate", done: true },
  { label: "Plată", who: "Contabilitate", done: false },
  { label: "e-Factura", who: "Prestator", done: false },
];

function Showcases() {
  return (
    <section id="functionalitati" className="py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="outline">Funcționalități</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold mt-4 mb-3">Tot traseul banului, într-un loc</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            De la cererea scrisă până la factura primită de la prestator. Fără module cumpărate
            separat și fără integrări de făcut.
          </p>
        </div>

        <div className="space-y-20 lg:space-y-28">
          <Showcase
            id="flux"
            badge="Fluxul complet"
            title="Nu mai întrebi pe nimeni unde s-a oprit cererea"
            subtitle="Fiecare cerere are un traseu vizibil și un istoric pe care nu-l poate rescrie nimeni. Solicitantul își vede propriile cereri, aprobatorul le vede pe cele care îi revin, finanțele pe cele aprobate."
            bullets={[
              "Ciorne explicite — formularul deschis nu creează gunoi în listă",
              "Retragere și redeschidere: greșeala se corectează, nu se anulează dosarul",
              "Notificări în aplicație și pe email la fiecare pas — inclusiv „îți revine ție”",
              "Foldere pe proiect, cu contoare de plătite și de aprobat",
            ]}
            reverse={false}
            visual={
              <div className="space-y-2">
                {FLOW_STAGES.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        s.done
                          ? "bg-primary text-primary-foreground"
                          : "border border-dashed border-border text-muted-foreground"
                      }`}
                    >
                      {s.done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2">
                      <span className="block text-xs font-semibold">{s.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{s.who}</span>
                    </span>
                  </div>
                ))}
              </div>
            }
          />

          <Showcase
            badge="Multi-entitate"
            title="Mai multe entități juridice, un singur set de reguli"
            subtitle="Plătitorul este entitatea juridică; sub el stau proiectele, codurile bugetare și oamenii. Un cod al unui proiect nu poate ajunge pe alt proiect nici dacă cineva forțează apelul API."
            bullets={[
              "Plătitor → proiect → cod bugetar, cu acces dat explicit pe fiecare nivel",
              "Codurile bugetare se caută, se adaugă din formular și se aleg singure când sunt unice",
              "Evenimente per proiect, vizibile echipei — nu doar celui care le-a creat",
              "Import din Excel al plătitorilor, proiectelor și codurilor, cu rândurile respinse raportate",
            ]}
            reverse
            visual={
              <div className="space-y-2.5">
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="text-xs font-bold">A.O. „Exemplu”</span>
                    <Badge variant="outline">plătitor</Badge>
                  </div>
                  <div className="mt-2 ml-5 space-y-2 border-l border-border pl-3">
                    {[
                      { p: "Digital Safeguard", codes: ["6.2.1 Servicii", "6.4 Deplasări"] },
                      { p: "Grant instituțional", codes: ["1.1 Salarii"] },
                    ].map((pr) => (
                      <div key={pr.p}>
                        <p className="text-[11px] font-semibold flex items-center gap-1.5">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {pr.p}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {pr.codes.map((c) => (
                            <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-[10px] text-muted-foreground">
                    config-import.xlsx · 128 rânduri acceptate, 3 respinse cu motiv
                  </span>
                </div>
              </div>
            }
          />

          <Showcase
            badge="Rapoarte & audit"
            title="Raportul pe care ți-l cere donatorul, nu cel pe care îl produce softul"
            subtitle="Cheltuiala pe cod bugetar, proiect, plătitor, beneficiar și eveniment, cu alocat–angajat–plătit pe fiecare rând. Plus vechimea cererilor și timpul mediu de la trimitere la aprobare."
            bullets={[
              "Perioade prestabilite sau personalizate, aceleași în export ca pe ecran",
              "Export CSV / XLSX și PDF, filtrat exact ca lista din față",
              "Audit filtrabil pe plătitor, proiect, persoană, perioadă și tip de eveniment",
              "Jurnal care se adaugă, nu se editează — inclusiv cine a citit datele bancare",
            ]}
            reverse={false}
            visual={
              <div className="space-y-3">
                {[
                  { code: "6.2.1 · Servicii", alloc: 100, eng: 74, paid: 52 },
                  { code: "6.4 · Deplasări", alloc: 100, eng: 46, paid: 46 },
                  { code: "1.1 · Salarii", alloc: 100, eng: 92, paid: 88 },
                ].map((r) => (
                  <div key={r.code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium">{r.code}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {r.paid}% plătit
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                      <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${r.eng}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${r.paid}%` }} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" /> plătit</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/30" aria-hidden="true" /> angajat</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted" aria-hidden="true" /> disponibil</span>
                </div>
              </div>
            }
          />

          <Showcase
            badge="Beneficiari & documente"
            title="IBAN-ul se scrie o dată și se verifică de fiecare dată"
            subtitle="Registrul de beneficiari ține datele bancare și juridice într-un singur loc, validate. Documentele se deschid în browser, nu se descarcă, iar AI-ul compară ce scrie în ele cu ce s-a cerut."
            bullets={[
              "IBAN validat cu cifra de control (mod-97) și stocat canonic, fără spații",
              "IDNP / IDNO verificat ca format înainte de plată",
              "Control de concordanță: sumele din document față de sumele din cerere",
              "Datele bancare sunt vizibile doar solicitantului, aprobatorilor rutați, finanțelor și adminului",
            ]}
            reverse
            visual={
              <div className="space-y-2.5">
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold">SRL Alfa Consult</span>
                    <Badge variant="success">IBAN valid</Badge>
                  </div>
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    <p>IDNO 1234567890123</p>
                    <p className="tabular-nums">MD24AG000225100013104168</p>
                    <p>BC „Moldindconbank” S.A.</p>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    Document verificat · concordanță
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Sumă, beneficiar și rechizite identice cu cererea.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                    Atenție · IBAN diferit în anexă
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Cererea trimisă nu se modifică singură — decide omul.
                  </p>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Roluri ─────────────────────────── */

function RolesSection() {
  const roles = [
    {
      icon: ClipboardList,
      name: "Solicitant",
      price: "5 $/lună",
      bullets: ["Creează și trimite cereri", "Își vede doar cererile proprii", "Atașează documente, urmărește statutul"],
    },
    {
      icon: ShieldCheck,
      name: "Aprobator",
      price: "20 $/lună",
      bullets: ["Inbox cu ce îi revine", "Aprobă, respinge, cere modificări", "Deleagă pe perioada concediului"],
    },
    {
      icon: Banknote,
      name: "Finanțe",
      price: "20 $/lună",
      bullets: ["Coada cererilor aprobate", "Înregistrează plata și dovada", "Urmărește e-Factura prestatorului"],
    },
    {
      icon: Landmark,
      name: "Administrator",
      price: "20 $/lună",
      bullets: ["Matricea DOA și pragurile", "Plătitori, proiecte, coduri, beneficiari", "Audit, invitații, import Excel"],
    },
  ];

  return (
    <section id="roluri" className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30 border-y border-border scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="outline">Roluri</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold mt-4 mb-3">Fiecare vede exact ce trebuie</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Segregarea atribuțiilor nu e o setare opțională: nimeni nu-și aprobă propria cerere și
            nimeni nu vede cererile la care nu are treabă — nici măcar prin API.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {roles.map((r) => (
            <Card key={r.name} tone="dashboard" hover className="p-5 flex flex-col">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 mb-4">
                <r.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h3 className="font-bold text-base">{r.name}</h3>
              <p className="text-xs text-primary font-semibold mb-3">{r.price}</p>
              <ul className="space-y-1.5 mt-auto">
                {r.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary/70 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Securitate ─────────────────────────── */

function SecurityStrip() {
  const items = [
    { icon: Lock, title: "Izolare pe organizație", desc: "Fiecare interogare e legată de organizația ta. Nu există „aproape izolat”." },
    { icon: FileText, title: "Conținut sigilat la trimitere", desc: "Sumele și liniile devin imutabile; PDF-ul dovedește exact ce s-a aprobat." },
    { icon: ShieldCheck, title: "Audit care nu se editează", desc: "Creare, trimitere, aprobare, plată, citirea datelor bancare — totul, cu autor și oră." },
    { icon: BadgeCheck, title: "Date personale minimizate", desc: "Numele, IDNP-ul și IBAN-ul beneficiarului le văd doar rolurile care au nevoie de ele." },
    { icon: Users, title: "2FA și istoric de logări", desc: "Autentificare în doi pași și lista sesiunilor, pentru conturile care mișcă bani." },
    { icon: ArrowLeftRight, title: "Curs oficial BNM", desc: "Cererile în EUR sau USD folosesc cursul oficial al zilei, nu unul introdus manual." },
  ];

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="outline">Control & conformitate</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold mt-4 mb-3">Făcut pentru bani care se raportează</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Modulul s-a născut din formularul de cerere de plată al unei organizații finanțate din
            granturi. De aceea urma scrisă nu e o funcție în plus — e produsul.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((i) => (
            <div key={i.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 mb-3">
                <i.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-sm mb-1.5">{i.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Restul platformei ─────────────────────────── */

function ModulesStrip() {
  const modules = [
    {
      icon: Landmark,
      title: "FinDesk",
      desc: "Facturi, cheltuieli, încasări, registru, TVA, mijloace fixe, e-Factura și import de extras bancar.",
      href: "/business/fin/",
    },
    {
      icon: Building2,
      title: "ITPark — Rezidenți",
      desc: "Contracte MITP, declarații proprii, perioade de rezidență și raportarea anuală.",
      href: "/business/itpark",
    },
    {
      icon: Wand2,
      title: "Documente în masă",
      desc: "Un șablon plus un Excel — și ies sute de documente personalizate, gata de semnat.",
      href: "/business/docmerge",
    },
  ];

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 bg-muted/30 border-y border-border">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <Badge variant="outline">Aceeași platformă</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold mt-4 mb-3">Când aprobările nu sunt tot ce ai de făcut</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Aprobările sunt inima FinFlow. Restul platformei pornește din același cont, cu aceiași
            oameni și aceleași drepturi.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {modules.map((m) => (
            <Link
              key={m.href}
              to={m.href}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition-colors"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <m.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold text-base mb-1">{m.title}</span>
                <span className="block text-sm text-muted-foreground leading-relaxed">{m.desc}</span>
              </span>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                Deschide <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Prețuri ─────────────────────────── */

function PricingSection() {
  return (
    <section id="preturi" className="py-16 sm:py-24 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 sm:mb-14">
          <Badge variant="outline">Prețuri</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold mt-4 mb-3">Plătești pentru cine decide, nu pentru cine cere</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Restul echipei trebuie să poată cere bani fără ca asta să te coste. Doar oamenii care
            aprobă, plătesc și administrează intră la tariful de manager.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {/* Membru echipă */}
          <Card tone="dashboard" className="p-6 sm:p-8 flex flex-col">
            <h3 className="text-2xl font-bold mb-2">Membru echipă</h3>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold tracking-tight">${PRICING.member}</span>
              <span className="text-sm text-muted-foreground">/ utilizator / lună</span>
            </p>
            <p className="text-sm text-muted-foreground mt-3 mb-6 leading-relaxed">
              Solicitanții — oricine din organizație are nevoie să ceară o plată sau o achiziție.
            </p>
            <ul className="space-y-2.5 mb-8 flex-1">
              {[
                "Cereri nelimitate, cu ciorne proprii",
                "Completare din contract cu AI",
                "Atașamente și previzualizare în browser",
                "Statut în timp real + notificări",
                "Registru de beneficiari (căutare și reutilizare)",
                "PDF-ul oficial al cererii",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" href="/business/signup" className="w-full rounded-xl">
              Începe gratuit
            </Button>
          </Card>

          {/* Manager */}
          <Card tone="dashboard" className="p-6 sm:p-8 flex flex-col border-primary/40 ring-2 ring-primary/10 shadow-lg relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="default">CEL MAI ALES</Badge>
            </span>
            <h3 className="text-2xl font-bold mb-2 text-primary">Manager</h3>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold tracking-tight">${PRICING.manager}</span>
              <span className="text-sm text-muted-foreground">/ utilizator / lună</span>
            </p>
            <p className="text-sm text-muted-foreground mt-3 mb-6 leading-relaxed">
              Aprobatori, finanțe și administratori — cine semnează, cine plătește, cine ține regulile.
            </p>
            <ul className="space-y-2.5 mb-8 flex-1">
              <li className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Tot din Membru echipă, plus:
              </li>
              {[
                "Inbox de aprobare cu filtre și delegări",
                "Matricea DOA — praguri, niveluri, paralel",
                "Coadă finanțe + regula depășirii de 10%",
                "e-Factura prestatorului, cu remindere",
                "Rapoarte alocat–angajat–plătit + export",
                "Audit filtrabil și export PDF / XLSX",
                "Foldere pe proiect, import Excel al configurației",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button href="/business/signup" className="w-full rounded-xl">
              Începe gratuit <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </Card>

          {/* Organizație */}
          <Card tone="dashboard" className="p-6 sm:p-8 flex flex-col bg-muted/20">
            <h3 className="text-2xl font-bold mb-2">Organizație</h3>
            <p className="text-3xl font-extrabold tracking-tight">La cerere</p>
            <p className="text-sm text-muted-foreground mt-3 mb-6 leading-relaxed">
              Pentru rețele de organizații, mai multe entități juridice și cerințe de conformitate
              proprii.
            </p>
            <ul className="space-y-2.5 mb-8 flex-1">
              <li className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Tot din Manager, plus:
              </li>
              {[
                "SSO și integrare cu directorul companiei",
                "SLA și suport prioritar",
                "Migrarea istoricului din Excel / sistemul actual",
                "Integrare cu programul de contabilitate",
                "Instruirea echipei și configurarea matricei DOA",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted transition-colors touch-target"
            >
              Cere o ofertă
            </a>
          </Card>
        </div>

        <PriceCalculator />

        <div className="mt-8 rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 p-5 text-center">
          <p className="flex items-center justify-center gap-2 font-bold text-sm sm:text-base mb-1">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Primești workspace-ul configurat împreună cu noi
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Îți urcăm plătitorii, proiectele și codurile bugetare din Excel și îți setăm pragurile de
            aprobare. Prețurile sunt în USD, fără TVA.
          </p>
        </div>
      </div>
    </section>
  );
}

function PriceCalculator() {
  const [managers, setManagers] = useState(3);
  const [members, setMembers] = useState(15);

  const monthly = managers * PRICING.manager + members * PRICING.member;

  return (
    <Card tone="dashboard" className="p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg mb-1">Cât te costă, concret</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Managerii sunt aprobatorii, finanțele și administratorii. Membrii echipei sunt
            solicitanții.
          </p>

          <div className="space-y-5">
            <CalculatorRow
              id="calc-managers"
              label="Manageri (aprobare, finanțe, admin)"
              hint={`$${PRICING.manager} / lună fiecare`}
              value={managers}
              min={1}
              max={50}
              onChange={setManagers}
            />
            <CalculatorRow
              id="calc-members"
              label="Membri ai echipei (solicitanți)"
              hint={`$${PRICING.member} / lună fiecare`}
              value={members}
              min={0}
              max={500}
              onChange={setMembers}
            />
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0 rounded-2xl border border-border bg-muted/40 p-5 flex flex-col">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">
            Total lunar
          </p>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums" aria-live="polite">
            ${monthly.toLocaleString("ro-MD")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ${(monthly * 12).toLocaleString("ro-MD")} pe an, fără TVA
          </p>
          <dl className="mt-4 space-y-1.5 text-xs border-t border-border pt-4">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{managers} × manager</dt>
              <dd className="tabular-nums font-medium">${(managers * PRICING.manager).toLocaleString("ro-MD")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{members} × membru</dt>
              <dd className="tabular-nums font-medium">${(members * PRICING.member).toLocaleString("ro-MD")}</dd>
            </div>
          </dl>
          <Button href="/business/signup" className="w-full rounded-xl mt-5">
            Începe gratuit
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface CalculatorRowProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function CalculatorRow({ id, label, hint, value, min, max, onChange }: CalculatorRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          aria-label={`${label} — număr exact`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-20 text-center"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── Contact ─────────────────────────── */

interface ContactForm {
  name: string;
  email: string;
  org: string;
  people: string;
  message: string;
}

function ContactSection() {
  const [form, setForm] = useState<ContactForm>({ name: "", email: "", org: "", people: "", message: "" });
  const [sent, setSent] = useState(false);

  const update = (key: keyof ContactForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * Nu inventăm un endpoint public de lead-uri: cererea pleacă din clientul de mail al
   * utilizatorului, cu tot ce a completat deja. Nimic nu se pierde și nimic nu promite un
   * backend care nu există.
   */
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = [
      `Nume: ${form.name}`,
      `Email: ${form.email}`,
      `Organizație: ${form.org}`,
      `Oameni implicați în aprobări: ${form.people || "—"}`,
      "",
      form.message || "—",
    ].join("\n");
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `Demo FinFlow — ${form.org || form.name}`,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
  };

  return (
    <section id="contact" className="py-16 sm:py-24 px-4 sm:px-6 bg-muted/30 border-y border-border scroll-mt-20">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div>
          <Badge variant="outline">Contact</Badge>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-4 mb-4">
            Îți arătăm fluxul pe cererile tale
          </h2>
          <p className="text-muted-foreground mb-8 text-sm sm:text-base leading-relaxed">
            Vino cu un formular de cerere de plată pe care îl folosești azi și cu pragurile voastre
            de aprobare. În ~20 de minute vezi aceeași cerere trecând prin FinFlow, cu PDF-ul la capăt.
          </p>
          <ul className="space-y-4">
            {[
              { icon: Clock, text: "Răspundem în maximum 24 de ore" },
              { icon: FileSpreadsheet, text: "Îți importăm codurile bugetare din Excelul tău" },
              { icon: Lock, text: "Nu cerem date reale de beneficiari pentru demo" },
              { icon: Users, text: "Configurăm matricea DOA împreună, pe rolurile voastre" },
            ].map((i) => (
              <li key={i.text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <i.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <span className="text-sm">{i.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-muted-foreground">
            Sau direct pe email:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary font-medium hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <Card tone="dashboard" className="p-6 sm:p-8 shadow-lg">
          {sent ? (
            <div className="text-center py-8">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold mb-2">Gata de trimis</h3>
              <p className="text-sm text-muted-foreground">
                Ți-am deschis mesajul în aplicația de email, completat. Dacă nu s-a deschis, scrie-ne
                la{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact-name" required>
                    Nume
                  </Label>
                  <Input
                    id="contact-name"
                    required
                    placeholder="Ion Popescu"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email" required>
                    Email
                  </Label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    placeholder="ion@organizatie.md"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact-org" required>
                    Organizație
                  </Label>
                  <Input
                    id="contact-org"
                    required
                    placeholder="A.O. Exemplu"
                    value={form.org}
                    onChange={(e) => update("org", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-people">Câți oameni aprobă</Label>
                  <Input
                    id="contact-people"
                    inputMode="numeric"
                    placeholder="ex. 4"
                    value={form.people}
                    onChange={(e) => update("people", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="contact-message">Mesaj</Label>
                <Textarea
                  id="contact-message"
                  rows={3}
                  placeholder="Cum arată azi fluxul vostru de aprobare?"
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-xl">
                Trimite cererea <Send className="h-4 w-4 ml-2" aria-hidden="true" />
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Datele merg direct pe emailul nostru și le folosim doar ca să te contactăm.
              </p>
            </form>
          )}
        </Card>
      </div>
    </section>
  );
}

/* ─────────────────────────── CTA final + footer ─────────────────────────── */

function FinalCta() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto text-center rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 p-8 sm:p-12">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Prima cerere, azi</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm sm:text-base">
          Îți deschizi workspace-ul, inviți aprobatorii și trimiți o cerere reală prin fluxul
          complet. Fără card bancar și fără instalare.
        </p>
        <div className="flex gap-3 justify-center flex-col sm:flex-row">
          <Button size="lg" href="/business/signup" className="h-12 px-8 rounded-xl">
            Începe gratuit <ArrowRight className="h-5 w-5 ml-2" aria-hidden="true" />
          </Button>
          <a
            href="#contact"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted transition-colors touch-target"
          >
            Solicită demo
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="flex items-center gap-2 font-display font-bold">
          <FinFlowMark size={24} />
          FinFlow <span className="text-muted-foreground font-medium">by Vector</span>
        </span>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vector. Achiziții și aprobări interne de finanțe.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/business/login" className="hover:text-foreground transition-colors">
            Autentificare
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
            Contact
          </a>
          <Link to="/" className="hover:text-foreground transition-colors">
            CRM educațional →
          </Link>
        </div>
      </div>
    </footer>
  );
}
