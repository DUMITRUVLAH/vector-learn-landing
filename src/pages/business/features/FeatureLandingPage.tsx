/**
 * Shell-ul unei pagini de feature — `/business/features/<slug>`.
 *
 * Structura (după paginile de produs ApprovalMax, cerută de owner):
 *   navbar → erou cu vizual → „utilizat de" → 4 beneficii → N blocuri alternate cu vizual
 *   → module conexe → întrebări frecvente → CTA final → footer
 *
 * Tot conținutul vine din `features.tsx`. Fișierul ăsta nu conține text de produs —
 * doar cadrul. Aceleași reguli ca pe landing: tokeni semantici (fără hex în .tsx),
 * light + dark, ținte ≥ 44px, `aria-label` unde nu e text, zero `any`.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, LogIn, Sparkles } from "lucide-react";
import { Link } from "@/router/HashRouter";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import { Badge, Button, Card } from "@/components/ds";
import { TRUSTED_BY } from "@/data/trustedBy";
import type { FeatureDef } from "./types";

const CONTACT_EMAIL = "contact@finflow.best";

export function FeatureLandingPage({ feature }: { feature: FeatureDef }) {
  // Rutele sunt pe hash, deci titlul/descrierea nu vin din HTML-ul servit — le punem din JS,
  // ca share-ul într-un chat sau un bookmark să arate a pagină de produs, nu a aplicație.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = feature.seoTitle;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", feature.seoDescription);
    window.scrollTo(0, 0);
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) meta?.setAttribute("content", prevDesc);
    };
  }, [feature]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Navbar />
      <Hero feature={feature} />
      <TrustedBy />
      <Benefits feature={feature} />
      <Blocks feature={feature} />
      <Related feature={feature} />
      <Faq feature={feature} />
      <FinalCta feature={feature} />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Navbar ─────────────────────────── */

function Navbar() {
  return (
    <nav className="glass fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link to="/business" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight sm:text-xl">
          <FinFlowMark size={28} />
          FinFlow <span className="hidden font-medium text-muted-foreground sm:inline">by Vector</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
          <Link to="/business" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Înapoi la produs
          </Link>
          <a href="#intrebari" className="transition-colors hover:text-foreground">
            Întrebări frecvente
          </a>
          <Link to="/business#preturi" className="transition-colors hover:text-foreground">
            Prețuri
          </Link>
        </div>
        <Button size="sm" href="/business/login">
          <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Autentificare
        </Button>
      </div>
    </nav>
  );
}

/* ─────────────────────────── Erou ─────────────────────────── */

function Hero({ feature }: { feature: FeatureDef }) {
  // Titlul se compune din partea neutră + partea accentuată; `h1Accent` e sufixul lui `h1`.
  const plain = feature.h1.endsWith(feature.h1Accent)
    ? feature.h1.slice(0, feature.h1.length - feature.h1Accent.length)
    : feature.h1;

  return (
    <section className="relative px-4 pb-8 pt-24 sm:px-6 sm:pb-14 sm:pt-32">
      <div className="pointer-events-none absolute -left-40 top-20 h-80 w-80 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 top-32 h-64 w-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <Badge variant="outline">{feature.eyebrow}</Badge>
          <h1 className="mb-5 mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            {plain}
            <span className="text-gradient">{feature.h1Accent}</span>
          </h1>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{feature.heroSub}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" href="/business/login" className="h-12 rounded-xl px-8 text-base">
              Intră în cont <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Button>
            <Link
              to="/business#contact"
              className="touch-target inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-8 text-base font-medium no-underline transition-colors hover:bg-muted"
            >
              Solicită demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Nu ai cont? Îl creezi din aceeași pagină · fără card bancar</p>
        </div>
        <Card tone="dashboard" className="p-4 shadow-xl sm:p-6">
          {feature.heroVisual}
        </Card>
      </div>
    </section>
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

/* ─────────────────────────── Cele 4 promisiuni ─────────────────────────── */

function Benefits({ feature }: { feature: FeatureDef }) {
  return (
    <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {feature.benefits.map((b) => (
          <div key={b.title} className="rounded-2xl border border-border bg-card p-5">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <b.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <h3 className="mb-1.5 text-sm font-semibold leading-snug">{b.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{b.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Blocuri alternate ─────────────────────────── */

function Blocks({ feature }: { feature: FeatureDef }) {
  return (
    <section className="px-4 pt-16 sm:px-6 sm:pt-20">
      <h2 className="mx-auto mb-4 max-w-2xl text-center text-2xl font-bold sm:text-4xl">{feature.blocksTitle}</h2>
      <div>
        {feature.blocks.map((b, i) => (
          <div
            key={b.id}
            id={b.id}
            className={`scroll-mt-20 px-0 py-12 sm:py-16 ${i % 2 === 1 ? "" : ""}`}
          >
            <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className={i % 2 === 1 ? "order-2" : "order-2 lg:order-1"}>
                <Badge variant="outline">{b.badge}</Badge>
                <h3 className="mb-3 mt-4 text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">{b.title}</h3>
                <p className="mb-6 text-sm text-muted-foreground sm:text-base">{b.body}</p>
                <ul className="space-y-3">
                  {b.bullets.map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="text-sm">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 1 ? "order-1" : "order-1 lg:order-2"}>
                <Card tone="dashboard" className="p-4 shadow-xl sm:p-6">
                  {b.visual}
                </Card>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Pagini conexe ─────────────────────────── */

function Related({ feature }: { feature: FeatureDef }) {
  if (feature.related.length === 0) return null;
  return (
    <section className="border-y border-border bg-muted/30 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-8 text-center text-xl font-bold sm:text-2xl">Merge mai departe cu</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {feature.related.map((r) => (
            <Link
              key={r.href}
              to={r.href}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 no-underline transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <r.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="mb-1 block text-sm font-semibold">{r.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{r.desc}</span>
              </span>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-primary transition-all group-hover:gap-2">
                Vezi <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Întrebări frecvente ─────────────────────────── */

function Faq({ feature }: { feature: FeatureDef }) {
  return (
    <section id="intrebari" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-4xl">Întrebări frecvente</h2>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {feature.faq.map((f, i) => (
            <FaqRow key={f.q} item={f} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({ item, defaultOpen }: { item: { q: string; a: string }; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="touch-target flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
      >
        <span className="text-sm font-semibold">{item.q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</p>}
    </div>
  );
}

/* ─────────────────────────── CTA final + footer ─────────────────────────── */

function FinalCta({ feature }: { feature: FeatureDef }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 p-8 text-center sm:p-12">
        <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Fără card bancar
        </p>
        <h2 className="mb-3 text-2xl font-bold sm:text-3xl">{feature.ctaTitle}</h2>
        <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground sm:text-base">{feature.ctaSub}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" href="/business/login" className="h-12 rounded-xl px-8">
            Intră în cont <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
          </Button>
          <Link
            to="/business#contact"
            className="touch-target inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-8 text-sm font-medium no-underline transition-colors hover:bg-muted"
          >
            Solicită demo
          </Link>
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
          <Link to="/business" className="transition-colors hover:text-foreground">
            Produs
          </Link>
          <Link to="/business/login" className="transition-colors hover:text-foreground">
            Autentificare
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
