import { Calendar, CreditCard, Smartphone, TrendingUp, Check } from "lucide-react";

const spotlights = [
  {
    badge: "Orar interactiv",
    title: "Programarea care se ocupă singură de logistică",
    description: "Mută o lecție cu drag & drop și sistemul recalculează automat plățile, notifică elevii pe WhatsApp și actualizează salariul profesorului.",
    points: [
      "5 vizualizări: zi, săptămână, lună, profesor, sală",
      "Detectare automată conflicte de orar",
      "Recuperări individuale și de grup",
      "Confirmări automate cu 24h înainte",
      "Lecții online cu link Zoom/Meet generat automat",
    ],
    icon: Calendar,
    cta: "Vezi cum funcționează orarul",
    visual: "schedule",
  },
  {
    badge: "Finanțe",
    title: "De la încasare la rapoarte, fără export-import",
    description: "Abonamente recurente, plăți cu cardul direct din aplicația mobilă, generare facturi cu un click. Plus integrare cu 1C și casele de marcat fiscale.",
    points: [
      "Abonamente cu reduceri și pachete familiale",
      "Plăți Stripe, PayU, Netopia, QR și SEPA",
      "Facturi & chitanțe în PDF, cu serii custom",
      "Salarii profesori calculate automat per lecție",
      "Rapoarte: P&L, cashflow, restanțe, profitabilitate",
    ],
    icon: CreditCard,
    cta: "Calculează ROI-ul financiar",
    visual: "finance",
  },
  {
    badge: "CRM & vânzări",
    title: "Transformă fiecare lead în client plătitor",
    description: "Captează leaduri din formulare web, Facebook, Instagram sau apeluri telefonice. Automatizează follow-up-ul și măsoară conversia pe sursă.",
    points: [
      "Pipeline kanban cu drag & drop între stadii",
      "Triggere: dacă lead nu răspunde 3 zile → SMS auto",
      "Atribuire UTM și ROAS per campanie publicitară",
      "Trial lessons cu rezervare online self-service",
      "Apeluri Asterisk/Mango cu înregistrare și transcriere",
    ],
    icon: TrendingUp,
    cta: "Vezi cum crește conversia",
    visual: "crm",
  },
  {
    badge: "Online learning & app mobilă",
    title: "Engagement care îi face pe elevi să revină",
    description: "Aplicația mobilă cu gamification, teme online, teste interactive și chat direct cu profesorul. iOS, Android și PWA — totul branded cu numele tău.",
    points: [
      "Gamification: XP, badge-uri, leaderboard pe clasă",
      "Teme cu deadline, notare automată și feedback",
      "Lecții video, materiale PDF, quiz-uri interactive",
      "Chat 1:1 elev-profesor și grup-clasa",
      "White-label: numele și logo-ul tău în App Store",
    ],
    icon: Smartphone,
    cta: "Cere acces la demo mobil",
    visual: "mobile",
  },
];

export function ModuleSpotlight() {
  return (
    <section id="modules" className="py-24 sm:py-32 bg-muted/30 border-y border-border/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-20">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Module în detaliu
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Patru module, un singur scop:{" "}
            <span className="text-gradient">să-ți reduci munca administrativă cu 70%</span>
          </h2>
        </div>

        <div className="space-y-24">
          {spotlights.map((spot, i) => {
            const Icon = spot.icon;
            const reverse = i % 2 === 1;
            return (
              <div
                key={spot.title}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${
                  reverse ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-xs font-semibold text-foreground mb-4">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {spot.badge}
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-4">
                    {spot.title}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed mb-6">
                    {spot.description}
                  </p>
                  <ul className="space-y-3 mb-8">
                    {spot.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-foreground/85">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                          <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#demo"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    {spot.cta} →
                  </a>
                </div>

                <SpotlightVisual variant={spot.visual} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SpotlightVisual({ variant }: { variant: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-lg overflow-hidden aspect-[5/4] lg:aspect-[4/3]">
      <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-muted/50" />

      {variant === "schedule" && <ScheduleVisual />}
      {variant === "finance" && <FinanceVisual />}
      {variant === "crm" && <CRMVisual />}
      {variant === "mobile" && <MobileVisual />}
    </div>
  );
}

function ScheduleVisual() {
  const days = ["Lun", "Mar", "Mie", "Joi", "Vin"];
  const events = [
    { day: 0, slot: 1, label: "Engleză B2", color: "bg-primary text-white", height: 2 },
    { day: 1, slot: 0, label: "Pian", color: "pastel-rose", height: 1 },
    { day: 1, slot: 2, label: "Programare", color: "pastel-sky", height: 1 },
    { day: 2, slot: 1, label: "Spaniolă A1", color: "pastel-mint", height: 2 },
    { day: 3, slot: 0, label: "Robotică", color: "pastel-peach", height: 2 },
    { day: 4, slot: 2, label: "Engleză B2", color: "bg-primary text-white", height: 1 },
  ];

  return (
    <div className="relative h-full w-full p-5">
      <div className="text-xs font-semibold mb-3 text-foreground/80">Săptămâna 22 — Mai 2026</div>
      <div className="grid grid-cols-5 gap-1.5 h-[calc(100%-2rem)]">
        {days.map((day, dayIdx) => (
          <div key={day} className="flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold text-center text-muted-foreground">{day}</div>
            {[0, 1, 2, 3].map((slot) => {
              const event = events.find((e) => e.day === dayIdx && e.slot === slot);
              return (
                <div
                  key={slot}
                  className={`flex-1 rounded-md border border-border/50 ${
                    event ? event.color : "bg-muted/30"
                  } ${event && event.height === 2 ? "row-span-2" : ""}`}
                  style={{ minHeight: "20px" }}
                >
                  {event && (
                    <p className={`text-[9px] font-medium p-1.5 truncate ${event.color.includes("white") ? "text-white" : "text-foreground/80"}`}>
                      {event.label}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinanceVisual() {
  return (
    <div className="relative h-full w-full p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] text-muted-foreground">Venituri lună</p>
          <p className="text-2xl font-display font-bold">€24.380</p>
          <p className="text-[10px] text-success font-medium">+18% față de luna trecută</p>
        </div>
        <div className="text-[10px] text-muted-foreground">Mai 2026</div>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-1.5 items-end mb-3">
        {[40, 55, 35, 70, 45, 80, 65].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-primary to-[hsl(250,76%,52%)]"
              style={{ height: `${h}%` }}
            />
            <span className="text-[8px] text-muted-foreground">L{i + 1}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {[
          { label: "Abonamente", value: "€18.420", pct: "75%" },
          { label: "Lecții individuale", value: "€4.260", pct: "17%" },
          { label: "Materiale", value: "€1.700", pct: "8%" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-[10px] flex-1">{row.label}</span>
            <span className="text-[10px] font-semibold">{row.value}</span>
            <span className="text-[9px] text-muted-foreground w-8 text-right">{row.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CRMVisual() {
  const columns = [
    { title: "Lead nou", count: 12, color: "pastel-sky" },
    { title: "Trial", count: 7, color: "pastel-lavender" },
    { title: "Plătit", count: 23, color: "pastel-mint" },
  ];
  const leads = [
    { col: 0, name: "Maria P.", source: "FB Ads" },
    { col: 0, name: "Andrei I.", source: "Site" },
    { col: 1, name: "Elena V.", source: "Recomandare" },
    { col: 1, name: "Mihai S.", source: "Google" },
    { col: 2, name: "Ana D.", source: "Site" },
    { col: 2, name: "Radu C.", source: "Trial" },
  ];

  return (
    <div className="relative h-full w-full p-5">
      <p className="text-xs font-semibold mb-3">Pipeline vânzări</p>
      <div className="grid grid-cols-3 gap-2 h-[calc(100%-2rem)]">
        {columns.map((col, i) => (
          <div key={col.title} className="rounded-lg bg-muted/40 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold">{col.title}</span>
              <span className={`text-[9px] font-bold rounded-full ${col.color} px-1.5 py-0.5`}>
                {col.count}
              </span>
            </div>
            {leads
              .filter((l) => l.col === i)
              .map((lead) => (
                <div key={lead.name} className="bg-card rounded-md p-2 border border-border/50">
                  <p className="text-[10px] font-semibold">{lead.name}</p>
                  <p className="text-[9px] text-muted-foreground">{lead.source}</p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileVisual() {
  return (
    <div className="relative h-full w-full flex items-center justify-center p-5">
      <div className="relative">
        <div className="relative w-44 h-80 rounded-[2rem] bg-foreground p-2 shadow-xl">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-4 w-16 rounded-full bg-foreground z-10" />
          <div className="h-full w-full rounded-[1.5rem] bg-background overflow-hidden p-3">
            <div className="text-[8px] text-muted-foreground text-center pt-3 mb-2">9:41</div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-[hsl(250,76%,52%)]" />
              <div>
                <p className="text-[9px] font-bold">Salut, Maria 👋</p>
                <p className="text-[7px] text-muted-foreground">3 lecții azi</p>
              </div>
            </div>
            <div className="rounded-md bg-gradient-to-br from-primary to-[hsl(250,76%,52%)] p-2 mb-2">
              <p className="text-[7px] text-white/80">Următoarea lecție</p>
              <p className="text-[9px] font-bold text-white">Engleză B2</p>
              <p className="text-[7px] text-white/80">10:00 • Sala 4</p>
            </div>
            <div className="space-y-1.5">
              {["Temă: Past Perfect", "Quiz: Vocabulary unit 5", "Material: PDF lectura"].map((t) => (
                <div key={t} className="flex items-center gap-1.5 rounded-md bg-muted/50 p-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="text-[7px]">{t}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-md pastel-lemon p-1.5 flex items-center gap-1.5">
              <span className="text-[9px]">⭐</span>
              <div>
                <p className="text-[7px] font-bold">+50 XP câștigați</p>
                <p className="text-[6px] text-foreground/60">Nivel 7 — Streak 12 zile</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
