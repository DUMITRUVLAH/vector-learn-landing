/**
 * FinFlow — pagina publică de prezentare (`/business`).
 *
 * Design: limbajul vizual al landing-ului HR365 by Vector (repo `vector-b2b`, `src/pages/Index.tsx`)
 * — navbar `glass`, hero cu titlu subliniat, bară de statistici, secțiuni alternate cu vizual,
 * prețuri cu calculator, contact. Conținutul e al FinFlow: achiziții și aprobări interne.
 *
 * Două reguli de conținut, ambele cerute de owner:
 *
 * 1. **Toate datele afișate sunt inventate.** Prima versiune folosea numele reale din formularul
 *    clientului (persoane, proiect, IDNP, IBAN). O pagină publică nu are voie să publice date
 *    reale de beneficiari — nici măcar ca „exemplu". Numele de aici nu există, IBAN-ul are cifra
 *    de control `00` (imposibilă), codurile fiscale sunt secvențe evident sintetice. Dacă adaugi
 *    un exemplu nou, ține-te de convenția asta.
 * 2. **Vizual peste text.** Fiecare capacitate are secțiunea ei, cu o reconstrucție a ecranului în
 *    markup — nu capturi (ar publica date reale) și nu paragrafe lungi.
 *
 * Preț: 20 $/lună per utilizator-manager (aprobator / finanțe / administrator), 5 $/lună per
 * restul echipei (solicitanți). Constantele în `PRICING`.
 *
 * Reguli tehnice: tokeni semantici (fără hex în .tsx), light + dark, WCAG AA (ținte ≥ 44px,
 * `aria-label` unde nu e text), zero `any`, animația se oprește la `prefers-reduced-motion`.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  BadgeCheck,
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
  MessageSquare,
  Search,
  TrendingUp,
  Receipt,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { Link } from "@/router/HashRouter";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Badge, Button, Card, Input, LanguageSwitcher, Label, Textarea } from "@/components/ds";
import { useT, type TranslationKey } from "@/lib/i18n";
import { TRUSTED_BY } from "@/data/trustedBy";

/** Adresa pe care ajung cererile de demo. Un singur loc de schimbat. */
const CONTACT_EMAIL = "contact@finflow.best";

/** Prețuri lunare, în USD, fără TVA. */
const PRICING = { manager: 20, member: 5 } as const;

/** Date de vitrină — inventate integral (vezi nota din capul fișierului). */
const DEMO = {
  project: "Acces Digital",
  requestNo: "PAR-2026-0042",
  payee: "Andrei Ciobanu",
  ibanShort: "MD00 …4271",
  iban: "MD00EXMP0000000000004271",
  vendor: "SRL „Tehnorevizie”",
  idno: "1000000000001",
  approver1: { name: "Victor Bălan", role: "Director de programe" },
  approver2: { name: "Natalia Ursu", role: "Director executiv" },
} as const;

export function BusinessLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <Hero />
      <TrustedBy />
      <PainSection />
      <BeforeAfter />
      <FlowSection />
      <StatsBar />
      <AiSection />
      <DoaSection />
      <FinanceSection />
      <EfacturaSection />
      <MoreCapabilities />
      <SecuritySection />
      <ModulesStrip />
      <PricingSection />
      <ContactSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Navbar ─────────────────────────── */

/** Ancorele rămân în română: sunt adrese, nu text — schimbarea lor ar rupe linkurile trimise. */
const NAV_LINKS: { href: string; labelKey: TranslationKey }[] = [
  { href: "#ai", labelKey: "landing.nav.ai" },
  { href: "#aprobari", labelKey: "landing.nav.approvals" },
  { href: "#flux", labelKey: "landing.nav.flow" },
  { href: "#securitate", labelKey: "landing.nav.security" },
  { href: "#preturi", labelKey: "landing.nav.pricing" },
  // Ghidurile NU sunt o rută a aplicației: sunt pagini pre-randate, servite static de pe /blog
  // (vezi scripts/build-blog.ts). De aceea e un `<a>` simplu, nu un `Link` de router — un
  // `Link` ar încerca o navigare pe hash și ar rămâne în SPA, pe o rută inexistentă.
  { href: "/blog", labelKey: "landing.nav.guides" },
];

function Navbar() {
  const { t } = useT();
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
              {t(l.labelKey)}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher variant="segmented" showIcon={false} />
          <Button size="sm" href="/business/login">
            <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("landing.nav.login")}
          </Button>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
  const { t } = useT();
  return (
    <section className="pt-24 sm:pt-32 pb-8 sm:pb-14 px-4 sm:px-6 relative">
      <div className="absolute top-20 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute top-32 -right-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] mb-5 tracking-tight">
            {t("landing.hero.titleLead")}{" "}
            <span className="text-gradient relative lg:whitespace-nowrap">
              {t("landing.hero.titleAccent")}
              {/* Sublinierea e ancorată la o linie de text; sub 1024 px titlul se rupe pe două
                  rânduri, așa că o ascundem în loc s-o lăsăm să traverseze ruptura. */}
              <svg className="hidden lg:block absolute -bottom-1 left-0 w-full" viewBox="0 0 300 12" fill="none" aria-hidden="true">
                <path d="M2 8C50 2 200 2 298 8" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
              </svg>
            </span>
            .
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto mb-8">
            {t("landing.hero.subtitle")}
          </p>
          <div className="flex gap-3 justify-center flex-col sm:flex-row">
            <Button size="lg" href="/business/login" className="h-12 rounded-xl px-8 text-base">
              {t("landing.hero.ctaPrimary")} <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Button>
            <a
              href="#flux"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl border border-border bg-card text-base font-medium hover:bg-muted transition-colors touch-target"
            >
              {t("landing.hero.ctaSecondary")}
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("landing.hero.note")}
          </p>
        </div>

        <HeroMock />
      </div>
    </section>
  );
}

function HeroMock() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <div className="grid grid-cols-12 gap-4 items-center">
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

        <div className="col-span-12 lg:col-span-6">
          <Card tone="dashboard" className="overflow-hidden shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-bold">{DEMO.requestNo}</p>
                <p className="text-[11px] text-muted-foreground">{DEMO.project} · exemplu</p>
              </div>
              <Badge variant="warning">La aprobare</Badge>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {[
                  { k: "Beneficiar", v: DEMO.payee },
                  { k: "IBAN", v: DEMO.ibanShort, ok: true },
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
                <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                  <span>Servicii de instruire · 1 sesiune</span>
                  <span className="tabular-nums">7 000,00</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-bold">
                  <span>Total estimat</span>
                  <span className="tabular-nums">MDL 7 000,00</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Lanț de aprobare · matricea DOA
                </p>
                {[
                  { ...DEMO.approver1, state: "approved" as const, step: "1" },
                  { ...DEMO.approver2, state: "pending" as const, step: "2" },
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
                      <span className="block truncate text-xs font-semibold">{a.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{a.role}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
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

        <div className="col-span-3 hidden lg:block space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Execuția bugetului se vede în timp real, nu la închiderea lunii.
          </p>
          <Card tone="dashboard" className="p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">Execuție buget</p>
              <Badge variant="outline">Iunie</Badge>
            </div>
            <p className="mb-1 text-2xl font-bold text-primary">
              68<span className="text-sm font-normal text-muted-foreground">%</span>
            </p>
            <p className="mb-2 text-[10px] text-muted-foreground">alocat · angajat · plătit</p>
            <div className="space-y-1.5">
              {[
                { label: "Alocat", pct: 100, cls: "bg-primary/25" },
                { label: "Angajat", pct: 68, cls: "bg-primary/60" },
                { label: "Plătit", pct: 41, cls: "bg-primary" },
              ].map((b) => (
                <div key={b.label}>
                  <p className="mb-0.5 text-[9px] text-muted-foreground">{b.label}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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

/* ─────────────────────────── Utilizat de ─────────────────────────── */

function TrustedBy() {
  return (
    <section aria-labelledby="utilizat-de" className="px-4 pb-14 pt-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 id="utilizat-de" className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Utilizat de
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {TRUSTED_BY.map((l) => (
            <span
              key={l.name}
              className="flex items-center justify-center rounded-xl border border-border/60 bg-white px-4 py-3 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <img src={l.src} alt={l.name} loading="lazy" className={`${l.size} w-auto max-w-[140px] object-contain`} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Durerile ─────────────────────────── */

const PAINS: { icon: typeof Search; text: string }[] = [
  { icon: Search, text: "„Unde e cererea mea?” — nimeni nu știe la cine stă." },
  { icon: MessageSquare, text: "Aprobarea vine pe WhatsApp, seara, ca poză." },
  { icon: FileText, text: "Cineva retastează IBAN-ul dintr-un PDF. A treia oară." },
  { icon: TrendingUp, text: "S-a plătit mai mult decât s-a aprobat. Afli la raport." },
  { icon: FolderOpen, text: "Donatorul cere dosarul. Îl aduni trei zile." },
  { icon: AlertTriangle, text: "Prestatorul n-a dat factura și nu urmărește nimeni." },
];

function PainSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-4xl">Sună cunoscut?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.text} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <p.icon className="h-4 w-4 text-destructive" aria-hidden="true" />
              </span>
              <p className="text-sm leading-snug">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Contrastul, pe rânduri scurte — mai convingător decât o listă de funcționalități. */
const CONTRAST: { icon: typeof FileText; before: string; after: string }[] = [
  { icon: FileText, before: "Formular pe hârtie, semnat și scanat", after: "PDF oficial, semnat în aplicație" },
  { icon: ShieldCheck, before: "Cine semnează? Depinde cine își amintește", after: "Pragurile decid singure lanțul" },
  { icon: ScanLine, before: "Rechizitele, retastate din documente", after: "AI-ul le scoate din contract" },
  { icon: TrendingUp, before: "Depășirea de buget se vede la raport", after: "Peste 10% → reaprobare, pe loc" },
  { icon: FolderOpen, before: "Dosarul pentru audit se adună manual", after: "Audit filtrabil, în două clicuri" },
];

function BeforeAfter() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-3 text-center text-2xl font-bold sm:text-4xl">Ce se schimbă, concret</h2>
        <p className="mx-auto mb-10 max-w-lg text-center text-sm text-muted-foreground sm:text-base">
          Aceleași reguli pe care le ai deja pe hârtie — doar că le ține sistemul.
        </p>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[3rem_1fr_1fr] border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider sm:grid-cols-[4rem_1fr_1fr]">
            <div aria-hidden="true" />
            <div className="px-4 py-2.5 text-muted-foreground">Azi</div>
            <div className="border-l border-border px-4 py-2.5 text-primary">Cu FinFlow</div>
          </div>
          {CONTRAST.map((row) => (
            <div
              key={row.after}
              className="grid grid-cols-[3rem_1fr_1fr] items-stretch border-b border-border last:border-0 sm:grid-cols-[4rem_1fr_1fr]"
            >
              <div className="flex items-center justify-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <row.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </span>
              </div>
              <div className="flex items-center px-4 py-3 text-sm text-muted-foreground line-through decoration-destructive/40">
                {row.before}
              </div>
              <div className="flex items-center gap-2 border-l border-border bg-primary/[0.03] px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{row.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Bara de statistici ─────────────────────────── */

function StatsBar() {
  const stats = [
    { icon: Wand2, value: "0 copy-paste", label: "AI-ul citește documentul" },
    { icon: ShieldCheck, value: "100%", label: "fiecare decizie, în audit" },
    { icon: FileText, value: "16 secțiuni", label: "formularul oficial, în PDF" },
    { icon: Lock, value: "Europa", label: "unde stau datele" },
  ];

  return (
    <section className="border-y border-border bg-card/60 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
        {stats.map((s) => (
          <div key={s.value} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <s.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-bold sm:text-xl">{s.value}</span>
              <span className="block text-[11px] text-muted-foreground sm:text-xs">{s.label}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Cadrul unei secțiuni ─────────────────────────── */

interface FeatureSectionProps {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
  muted?: boolean;
  /** Trimitere către pagina de feature dedicată, când există una. */
  link?: { label: string; href: string };
}

function FeatureSection({ id, badge, title, subtitle, bullets, visual, reverse, muted, link }: FeatureSectionProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 ${muted ? "border-y border-border bg-muted/30" : ""}`}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div className={reverse ? "order-2" : "order-2 lg:order-1"}>
          <Badge variant="outline">{badge}</Badge>
          <h2 className="mt-4 mb-3 text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">{title}</h2>
          <p className="mb-6 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          <ul className="space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm">{b}</span>
              </li>
            ))}
          </ul>
          {link && (
            <Link
              to={link.href}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary no-underline transition-all hover:gap-2.5"
            >
              {link.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className={reverse ? "order-1" : "order-1 lg:order-2"}>
          <Card tone="dashboard" className="p-4 shadow-xl sm:p-6">
            {visual}
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── AI ─────────────────────────── */

function AiSection() {
  return (
    <FeatureSection
      id="ai"
      badge="AI"
      title="Nu mai copiezi nimic dintr-un PDF"
      subtitle="Urci contractul sau factura. AI-ul completează cererea și îți spune unde documentul nu se potrivește cu ea."
      bullets={[
        "Extrage beneficiar, cod fiscal, IBAN, sumă și scop — din orice tip de act",
        "Nu confundă organizația ta cu prestatorul; când sunt două companii, întreabă",
        "Compară documentul cu cererea și marchează neconcordanțele",
      ]}
      visual={
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
            <ScanLine className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1 truncate text-xs font-medium">contract-servicii-2026.pdf</span>
            <Badge variant="success">citit</Badge>
          </div>
          {[
            { k: "Beneficiar", v: DEMO.vendor },
            { k: "Cod fiscal", v: DEMO.idno },
            { k: "IBAN", v: DEMO.iban },
            { k: "Sumă", v: "24 000,00 MDL" },
          ].map((f) => (
            <div key={f.k} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{f.k}</span>
              <span className="truncate text-[11px] font-semibold tabular-nums">{f.v}</span>
            </div>
          ))}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Anexa are alt IBAN</p>
            <p className="text-[10px] text-muted-foreground">AI-ul semnalează, omul decide.</p>
          </div>
        </div>
      }
    />
  );
}

/* ─────────────────────────── DOA ─────────────────────────── */

function DoaSection() {
  return (
    <FeatureSection
      id="aprobari"
      badge="Aprobări"
      title="Pragurile decid cine semnează"
      subtitle="Configurezi o dată pragurile. La trimitere, lanțul de aprobare se construiește singur."
      bullets={[
        "Secvențial sau în paralel, pe bandă de sumă, departament sau tip de cheltuială",
        "Delegare pe perioada concediului, fără să dai parola nimănui",
        "Nimeni nu-și aprobă propria cerere",
      ]}
      reverse
      muted
      link={{ label: "Vezi cum se construiește lanțul", href: "/business/features/aprobari-multi-nivel" }}
      visual={
        <div className="space-y-2">
          {[
            { band: "≤ 10 000 MDL", chain: "Supervizor", steps: 1 },
            { band: "10 000 – 100 000", chain: "Supervizor → Director executiv", steps: 2 },
            { band: "> 100 000 MDL", chain: "Supervizor → Finanțe → Director", steps: 3 },
          ].map((r) => (
            <div key={r.band} className="rounded-xl border border-border px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold tabular-nums">{r.band}</span>
                <Badge variant="outline">
                  {r.steps} {r.steps === 1 ? "semnătură" : "semnături"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: r.steps }).map((_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-primary/70" />
                ))}
                {Array.from({ length: 3 - r.steps }).map((_, i) => (
                  <span key={`e${i}`} className="h-1.5 flex-1 rounded-full bg-muted" />
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">{r.chain}</p>
            </div>
          ))}
        </div>
      }
    />
  );
}

/* ─────────────────────────── Finanțe ─────────────────────────── */

function FinanceSection() {
  return (
    <FeatureSection
      id="finante"
      badge="Finanțe"
      title="Plata nu poate depăși ce s-a aprobat"
      subtitle="Finanțele înregistrează suma reală. Peste 10% diferență, cererea se întoarce la aprobare — automat."
      bullets={[
        "Coadă proprie cu cererile aprobate, cu preluare și repartizare",
        "Dovada plății și ordinul rămân atașate cererii",
        "Cursul oficial BNM pentru cererile în EUR sau USD",
      ]}
      visual={
        <div className="space-y-2.5">
          <div className="rounded-xl border border-border p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Aprobat</span>
              <span className="font-semibold tabular-nums">7 000,00 MDL</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Plătit efectiv</span>
              <span className="font-semibold tabular-nums">8 050,00 MDL</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
              Depășire 15% — se cere reaprobare
            </p>
            <p className="text-[10px] text-muted-foreground">Plata rămâne blocată până la decizie.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">Ordin de plată · dovadă atașată · 24 iun. 2026</span>
          </div>
        </div>
      }
    />
  );
}

/* ─────────────────────────── e-Factura ─────────────────────────── */

function EfacturaSection() {
  return (
    <FeatureSection
      id="efactura"
      badge="e-Factura"
      title="Plata nu închide dosarul. Factura, da."
      subtitle="FinFlow caută factura în SIA „e-Factura” și o leagă de cerere. Dacă lipsește, trimite un reminder."
      bullets={[
        "Potrivire după cod fiscal, fereastră de timp și sumă",
        "Persoanele fizice nu sunt niciodată bătute la cap",
        "Când SFS nu răspunde, scrie „indisponibil”, nu „lipsă”",
      ]}
      reverse
      muted
      visual={
        <div className="space-y-2">
          {[
            { name: DEMO.vendor, sum: "24 000 MDL", state: "primită", tone: "success" as const },
            { name: "SRL „Digitalis”", sum: "8 400 MDL", state: "lipsește", tone: "warning" as const },
            { name: DEMO.payee, sum: "7 000 MDL", state: "persoană fizică", tone: "secondary" as const },
          ].map((r) => (
            <div key={r.name} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">{r.name}</span>
                <span className="block text-[10px] tabular-nums text-muted-foreground">{r.sum}</span>
              </span>
              <Badge variant={r.tone}>{r.state}</Badge>
            </div>
          ))}
          <p className="px-1 text-[10px] text-muted-foreground">Maximum un reminder pe zi, fiecare scris în audit.</p>
        </div>
      }
    />
  );
}

/* ─────────────────────────── Fluxul (animat) ─────────────────────────── */

interface FlowStage {
  label: string;
  who: string;
  detail: string;
  /** Ce rămâne scris după pasul ăsta — dovada pe care o arăți donatorului sau auditorului. */
  proof: string;
}

const FLOW_STAGES: FlowStage[] = [
  {
    label: "Cerere",
    who: "Solicitant",
    detail: "Se completează din document cu AI: beneficiar, sumă, cod bugetar.",
    proof: "Contractul și oferta rămân atașate cererii",
  },
  {
    label: "Trimisă",
    who: "Sistem",
    detail: "Conținutul se sigilează — sumele și liniile nu se mai pot schimba.",
    proof: "Amprenta conținutului + ora trimiterii",
  },
  {
    label: "Aprobare",
    who: "Aprobatori",
    detail: "Matricea de praguri construiește lanțul după sumă.",
    proof: "Fiecare semnătură: nume, funcție, oră, comentariu",
  },
  {
    label: "Finanțe",
    who: "Contabilitate",
    detail: "Cererea aprobată intră în coada de plăți, cu preluare și repartizare.",
    proof: "Cine a preluat cererea și cui i-a fost repartizată",
  },
  {
    label: "Plată",
    who: "Contabilitate",
    detail: "Sumă reală, dată, referință. Peste 10% diferență → reaprobare.",
    proof: "Ordinul de plată și dovada, atașate la dosar",
  },
  {
    label: "e-Factura",
    who: "Prestator",
    detail: "Factura din SFS se leagă singură de cerere.",
    proof: "Factura fiscală — sau reminderul trimis, dacă lipsește",
  },
];

function FlowSection() {
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    timer.current = window.setInterval(() => setActive((a) => (a + 1) % FLOW_STAGES.length), 2600);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, []);

  /** Click-ul oprește rotația: dacă cineva explorează, nu-i mutăm conținutul sub degete. */
  const pick = (i: number) => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    setActive(i);
  };

  const progress = (active / (FLOW_STAGES.length - 1)) * 100;

  return (
    <section id="flux" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <Badge variant="outline">Fluxul</Badge>
          <h2 className="mt-4 mb-3 text-2xl font-bold sm:text-4xl">
            Traseul unei cereri de plată, documentat
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground sm:text-base">
            Șase pași. La fiecare rămâne o dovadă pe care o poți arăta.
          </p>
        </div>

        <div className="relative mb-8">
          {/* Linia de progres — doar pe ecranele unde pașii stau pe un rând. */}
          <div className="absolute left-0 right-0 top-5 hidden h-0.5 bg-border sm:block" aria-hidden="true">
            <div
              className="h-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="relative grid grid-cols-3 gap-4 sm:grid-cols-6 sm:gap-2">
            {FLOW_STAGES.map((s, i) => {
              const done = i < active;
              const now = i === active;
              return (
                <li key={s.label} className="flex flex-col items-center text-center">
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-current={now}
                    aria-label={`Pasul ${i + 1}: ${s.label}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-500 motion-reduce:transition-none ${
                      now
                        ? "scale-110 border-primary bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20"
                        : done
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : i + 1}
                  </button>
                  <span className={`mt-2 text-xs font-semibold transition-colors ${now ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{s.who}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <Card key={active} tone="dashboard" className="mx-auto max-w-2xl animate-in fade-in p-5 text-center shadow-lg duration-500 motion-reduce:animate-none">
          <p className="text-sm sm:text-base">
            <strong className="font-semibold">{FLOW_STAGES[active].label}</strong>{" "}
            <span className="text-muted-foreground">— {FLOW_STAGES[active].detail}</span>
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {FLOW_STAGES[active].proof}
          </p>
        </Card>
      </div>
    </section>
  );
}

/* ─────────────────────────── Restul capabilităților ─────────────────────────── */

function MoreCapabilities() {
  const items = [
    {
      icon: Building2,
      title: "Mai multe entități juridice",
      desc: "Plătitor → proiect → cod bugetar, cu acces separat pe fiecare nivel.",
    },
    {
      icon: BarChart3,
      title: "Alocat, angajat, plătit",
      desc: "Pe cod, proiect sau beneficiar, cu export CSV, XLSX și PDF.",
    },
    {
      icon: Users,
      title: "Registru de beneficiari",
      desc: "IBAN validat cu cifra de control, reutilizat în loc de retastat.",
    },
    {
      icon: FolderOpen,
      title: "Foldere pe proiect",
      desc: "Contoare de plătite și de aprobat, pe fiecare proiect.",
    },
    {
      icon: FileSpreadsheet,
      title: "Import din Excel",
      desc: "Plătitori, proiecte și coduri bugetare, cu rândurile respinse raportate.",
    },
    {
      icon: ArrowLeftRight,
      title: "Curs valutar BNM",
      desc: "Cursul oficial al zilei, folosit direct în cereri.",
    },
  ];

  return (
    <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <Badge variant="outline">Și, pe scurt</Badge>
          <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Ce mai ține un dosar în ordine</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <i.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h3 className="mb-1.5 text-sm font-semibold">{i.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Securitate & GDPR ─────────────────────────── */

function SecuritySection() {
  const items = [
    { icon: Lock, title: "Date găzduite în Europa", desc: "Baza de date rulează în regiunea europeană a furnizorului cloud." },
    { icon: ShieldCheck, title: "GDPR by default", desc: "Export și ștergere la cerere; citirea datelor bancare e jurnalizată." },
    { icon: BadgeCheck, title: "Acces minim necesar", desc: "Rechizitele bancare le vede doar cine are treabă cu cererea." },
    { icon: FileText, title: "Conținut sigilat", desc: "După trimitere, sumele nu se mai schimbă." },
    { icon: Users, title: "2FA și sesiuni", desc: "Autentificare în doi pași și istoric de logări." },
    { icon: ClipboardList, title: "Audit care nu se editează", desc: "Jurnal append-only, filtrabil și exportabil." },
  ];

  return (
    <section id="securitate" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <Badge variant="outline">Securitate & GDPR</Badge>
          <h2 className="mt-4 mb-3 text-2xl font-bold sm:text-4xl">Făcut pentru bani care se raportează</h2>

        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <i.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h3 className="mb-1.5 text-sm font-semibold">{i.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{i.desc}</p>
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
    { icon: Landmark, title: "FinDesk", desc: "Facturi, cheltuieli, registru, TVA, mijloace fixe, extras bancar.", href: "/business/fin/" },
    { icon: Building2, title: "ITPark", desc: "Contracte MITP, declarații și raportarea rezidenților.", href: "/business/itpark" },
    { icon: Wand2, title: "Documente în masă", desc: "Un șablon plus un Excel — sute de documente gata de semnat.", href: "/business/docmerge" },
  ];

  return (
    <section className="border-y border-border bg-muted/30 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-8 text-center text-xl font-bold sm:text-2xl">Aceeași platformă, când ai nevoie de mai mult</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.href}
              to={m.href}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <m.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="mb-1 block text-sm font-semibold">{m.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{m.desc}</span>
              </span>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-primary transition-all group-hover:gap-2">
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
    <section id="preturi" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center sm:mb-14">
          <Badge variant="outline">Prețuri</Badge>
          <h2 className="mt-4 mb-3 text-2xl font-bold sm:text-4xl">Plătești pentru cine decide</h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground sm:text-base">
            Manageri sunt doar aprobatorii, finanțele și administratorii.
          </p>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Card tone="dashboard" className="flex flex-col p-6 sm:p-8">
            <h3 className="mb-2 text-2xl font-bold">Membru echipă</h3>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold tracking-tight">${PRICING.member}</span>
              <span className="text-sm text-muted-foreground">/ utilizator / lună</span>
            </p>
            <p className="mb-6 mt-3 text-sm text-muted-foreground">Solicitanții — cine are nevoie să ceară o plată.</p>
            <ul className="mb-8 flex-1 space-y-2.5">
              {[
                "Cereri nelimitate și ciorne proprii",
                "Completare din document cu AI",
                "Atașamente, statut și notificări",
                "PDF-ul oficial al cererii",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" href="/business/login" className="w-full rounded-xl">
              Intră în cont
            </Button>
          </Card>

          <Card tone="dashboard" className="relative flex flex-col border-primary/40 p-6 shadow-lg ring-2 ring-primary/10 sm:p-8">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="default">CEL MAI ALES</Badge>
            </span>
            <h3 className="mb-2 text-2xl font-bold text-primary">Manager</h3>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold tracking-tight">${PRICING.manager}</span>
              <span className="text-sm text-muted-foreground">/ utilizator / lună</span>
            </p>
            <p className="mb-6 mt-3 text-sm text-muted-foreground">Aprobatori, finanțe și administratori.</p>
            <ul className="mb-8 flex-1 space-y-2.5">
              <li className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tot ce e mai sus, plus:</li>
              {[
                "Inbox de aprobare, delegări, matricea DOA",
                "Coadă finanțe + regula depășirii de 10%",
                "e-Factura prestatorului, cu remindere",
                "Rapoarte, audit filtrabil și exporturi",
                "Import Excel al configurației",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button href="/business/login" className="w-full rounded-xl">
              Intră în cont <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </Card>

          <Card tone="dashboard" className="flex flex-col bg-muted/20 p-6 sm:p-8">
            <h3 className="mb-2 text-2xl font-bold">Organizație</h3>
            <p className="text-3xl font-extrabold tracking-tight">La cerere</p>
            <p className="mb-6 mt-3 text-sm text-muted-foreground">Rețele de organizații și cerințe proprii de conformitate.</p>
            <ul className="mb-8 flex-1 space-y-2.5">
              {[
                "SSO și integrare cu directorul companiei",
                "SLA și suport prioritar",
                "Migrarea istoricului din Excel",
                "Integrare cu programul de contabilitate",
                "Configurarea matricei DOA împreună",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              className="touch-target inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cere o ofertă
            </a>
          </Card>
        </div>

        <PriceCalculator />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prețurile sunt în USD, fără TVA. Îți configurăm workspace-ul împreună — plătitori, proiecte
          și coduri bugetare din Excelul tău.
        </p>
      </div>
    </section>
  );
}

function PriceCalculator() {
  const [managers, setManagers] = useState(1);
  const [members, setMembers] = useState(3);

  const monthly = managers * PRICING.manager + members * PRICING.member;

  return (
    <Card tone="dashboard" className="p-6 sm:p-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-lg font-bold">Cât te costă, concret</h3>
          <p className="mb-6 text-sm text-muted-foreground">Managerii aprobă și plătesc; membrii echipei cer.</p>
          <div className="space-y-5">
            <CalculatorRow
              id="calc-managers"
              label="Manageri"
              hint={`$${PRICING.manager} / lună`}
              value={managers}
              min={1}
              max={10}
              onChange={setManagers}
            />
            <CalculatorRow
              id="calc-members"
              label="Membri ai echipei"
              hint={`$${PRICING.member} / lună`}
              value={members}
              min={0}
              max={30}
              onChange={setMembers}
            />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col rounded-2xl border border-border bg-muted/40 p-5 lg:w-72">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total lunar</p>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums" aria-live="polite">
            ${monthly.toLocaleString("ro-MD")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">${(monthly * 12).toLocaleString("ro-MD")} pe an, fără TVA</p>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{managers} × manager</dt>
              <dd className="font-medium tabular-nums">${(managers * PRICING.manager).toLocaleString("ro-MD")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{members} × membru</dt>
              <dd className="font-medium tabular-nums">${(members * PRICING.member).toLocaleString("ro-MD")}</dd>
            </div>
          </dl>
          <Button href="/business/login" className="mt-5 w-full rounded-xl">
            Intră în cont
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
      <div className="mb-2 flex items-baseline justify-between">
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
          className="h-6 flex-1 accent-primary"
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
  message: string;
}

function ContactSection() {
  const [form, setForm] = useState<ContactForm>({ name: "", email: "", org: "", message: "" });
  const [sent, setSent] = useState(false);

  const update = (key: keyof ContactForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * Nu inventăm un endpoint public de lead-uri: cererea pleacă din clientul de mail al
   * utilizatorului, cu tot ce a completat deja.
   */
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = [`Nume: ${form.name}`, `Email: ${form.email}`, `Organizație: ${form.org}`, "", form.message || "—"].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `Demo FinFlow — ${form.org || form.name}`,
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <section id="contact" className="scroll-mt-20 border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-5xl items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <Badge variant="outline">Contact</Badge>
          <h2 className="mt-4 mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">Îți arătăm fluxul pe cererile tale</h2>
          <p className="mb-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Vino cu formularul pe care îl folosești azi. În ~20 de minute îl vezi trecând prin FinFlow.
          </p>
          <ul className="space-y-4">
            {[
              { icon: Clock, text: "Răspundem în maximum 24 de ore" },
              { icon: FileSpreadsheet, text: "Îți importăm codurile bugetare din Excel" },
              { icon: Lock, text: "Nu cerem date reale de beneficiari pentru demo" },
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
            Sau direct:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <Card tone="dashboard" className="p-6 shadow-lg sm:p-8">
          {sent ? (
            <div className="py-8 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </span>
              <h3 className="mb-2 text-lg font-bold">Gata de trimis</h3>
              <p className="text-sm text-muted-foreground">
                Ți-am deschis mesajul completat în aplicația de email. Dacă nu s-a deschis, scrie-ne la{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
                Trimite cererea <Send className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
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
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 p-8 text-center sm:p-12">
        <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Fără card bancar
        </p>
        <h2 className="mb-3 text-2xl font-bold sm:text-3xl">Prima cerere, azi</h2>
        <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground sm:text-base">
          Te autentifici sau îți creezi workspace-ul din aceeași pagină, inviți aprobatorii și
          trimiți o cerere reală.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" href="/business/login" className="h-12 rounded-xl px-8">
            Intră în cont <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
          </Button>
          <a
            href="#contact"
            className="touch-target inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-8 text-sm font-medium transition-colors hover:bg-muted"
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
    <footer className="border-t border-border px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <span className="flex items-center gap-2 font-display font-bold">
          <FinFlowMark size={24} />
          FinFlow <span className="font-medium text-muted-foreground">by Vector</span>
        </span>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vector. Achiziții și aprobări interne de finanțe.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/business/login" className="transition-colors hover:text-foreground">
            Autentificare
          </Link>
          <a href="/blog" className="transition-colors hover:text-foreground">
            Ghiduri
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-foreground">
            Contact
          </a>
          <Link to="/" className="transition-colors hover:text-foreground">
            CRM educațional →
          </Link>
        </div>
      </div>
    </footer>
  );
}
