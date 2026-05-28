import { Trophy, BookOpen, MessageCircle, Palette, Smartphone, Star, Apple, Bell } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { PhoneMockup } from "@/components/modules/mobile/PhoneMockup";
import { PASTEL_CYCLE } from "@/lib/utils";

const sections = [
  {
    icon: Trophy,
    title: "Gamification care chiar funcționează",
    bullets: [
      "XP per lecție prezentă, temă terminată, quiz reușit",
      "Badge-uri pe milestone-uri (10 lecții, primul A2, streak 30 zile)",
      "Leaderboard pe clasă (opțional, nu pe centru — anti-bullying)",
      "Recompense personalizate de profesor (insigne custom)",
    ],
    description: "Streak-urile lor de prezență sunt punct de mândrie acasă. Engagement crescut cu media +47% după lansare.",
  },
  {
    icon: BookOpen,
    title: "Teme și quiz-uri interactive",
    bullets: [
      "Multiple choice cu notare instant și explicații",
      "Audio listening cu redare la viteză variabilă (0.75x — 1.5x)",
      "Drag-and-match, fill-in-the-blank, completare propoziții",
      "Upload poze cu tema scrisă de mână (OCR + revizuire profesor)",
    ],
    description: "Profesorul vede instant rezultatele. Elevul primește feedback înainte să închidă aplicația.",
  },
  {
    icon: MessageCircle,
    title: "Chat 1:1 cu profesorul",
    bullets: [
      "Mesaje text, voice notes, atașamente (max 10 MB)",
      "Read receipts și typing indicator (configurabil)",
      "Mod 'liniștit' pentru profesor în afara orelor de program",
      "Părintele poate participa la conversație (cont separat sau cu copilul)",
    ],
    description: "Întrebarea de seara târziu primește răspuns dimineața, nu se pierde într-un WhatsApp aglomerat.",
  },
  {
    icon: Palette,
    title: "White-label complet",
    bullets: [
      "Numele și logo-ul tău în App Store și Play Store",
      "Culorile brandului în toată aplicația",
      "Splash screen, icon, push notifications — toate brand-uite",
      "Cont developer gestionat de noi (sau al tău, dacă preferi)",
    ],
    description: 'Părinții descarcă „Lingua School", nu „Vector Learn". Plan Pro și Enterprise.',
  },
];

const benefits = [
  { icon: Bell, label: "Notificări instant", desc: "Lecție mutată, temă nouă, plată — direct pe lock screen" },
  { icon: Star, label: "Rating 4.8/5", desc: "Mediana centrelor active în App Store + Play Store" },
  { icon: Smartphone, label: "Funcționează offline", desc: "Orar, teme, materiale — sincronizate când revii online" },
  { icon: Apple, label: "iOS 15+ și Android 9+", desc: "Acoperire 96% din dispozitivele active" },
];

const faqs = [
  {
    q: "Cum publicăm aplicația în App Store și Play Store?",
    a: 'Două variante: (1) White-label sub contul Vector Learn — aplicația apare ca „Lingua School powered by Vector Learn", e gata în 24h, fără cont developer al tău. (2) White-label complet sub contul tău de developer — publicăm în numele tău, durează 2-3 săptămâni (Apple review). Ambele includ branding total (icon, splash, culori, nume).',
  },
  {
    q: "Cât costă publicarea în store-uri?",
    a: "Pe planul Growth e inclusă publicarea sub contul nostru. Pe Pro și Enterprise, dacă vrei cont propriu, costurile sunt: Apple Developer 99 USD/an + Google Play 25 USD one-time. Vector Learn nu adaugă taxă peste astea. Te ajutăm cu setup-ul tehnic și cu submission-ul.",
  },
  {
    q: "Funcționează aplicația când elevul nu are internet?",
    a: "Da. Orarul, temele text, materialele PDF, video-urile preîncărcate funcționează offline. Quiz-urile interactive se sincronizează când revine online. Doar lecțiile live video au nevoie de conexiune. Folosim Workbox pentru caching strategic și un model offline-first.",
  },
  {
    q: "Părinții și elevii folosesc același cont sau separat?",
    a: "Recomandat separat. Părintele vede plățile, orarul, progresul copilului, primește notificările administrative. Elevul vede gamification, temele, chat-ul cu profesorul. Un părinte poate avea legate mai mulți copii (frați la același centru). Setup la onboarding sau oricând din panou.",
  },
];

export function MobilePage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Aplicație mobilă"
        title={
          <>
            Engagement care îi face pe elevi <span className="text-gradient">să revină zilnic</span>
          </>
        }
        description="Aplicație mobilă iOS și Android cu gamification real, teme interactive, chat cu profesorul și plăți integrate. Branded cu numele tău, gata în 24h. Engagement crescut cu media +47% după lansare."
        ctaPrimary={{ label: "Vezi demo mobil", href: "#/?demo=mobile" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
              Aplicația elevului — navighează între ecrane
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Săgețile sau swipe pe telefon. 4 ecrane, ambele OS.
            </p>
          </div>
          <PhoneMockup />
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <article key={b.label} className="rounded-2xl border border-border bg-card p-5">
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <p className="text-sm font-bold">{b.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{b.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              4 capabilități cheie
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Tot ce-i trebuie unui elev (și părintelui) în buzunar
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <article key={section.title} className="rounded-2xl border border-border bg-card p-6 card-hover">
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} rounded-xl p-2.5 flex-shrink-0`}>
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold mb-1.5">{section.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 pl-12">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />
    </ModulePageShell>
  );
}
