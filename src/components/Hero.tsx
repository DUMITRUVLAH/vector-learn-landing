import { ArrowRight, Calendar, CreditCard, Users, Sparkles, BookOpen, MessageSquare, Play } from "lucide-react";

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-pattern radial-mask opacity-60" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[500px] w-[500px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-10 h-72 w-72 bg-[hsl(250,76%,52%)]/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Nou: Modul AI Assistant pentru profesori și administratori
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05]">
            CRM-ul complet pentru{" "}
            <span className="text-gradient">centre educaționale</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Orar interactiv, finanțe, vânzări, comunicare cu părinții și online learning,
            totul într-o singură platformă. Construit pentru școli de limbi, programare,
            muzică, dans, sport și pregătire examene.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#demo"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:shadow-lg hover:bg-primary/90 transition-all touch-target"
            >
              Cere demo gratuit
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#video"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-all touch-target"
            >
              <Play className="h-4 w-4" />
              Vezi platforma în 2 min
            </a>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              14 zile trial gratuit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Fără card de credit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Setup în 24h
            </span>
          </div>
        </div>

        <div className="mt-16 lg:mt-20 relative">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <div className="relative max-w-6xl mx-auto">
      <div className="absolute -inset-x-20 -inset-y-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent blur-3xl -z-10" />

      <div className="relative rounded-2xl border border-border bg-card shadow-xl overflow-hidden glow">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-1 text-xs text-muted-foreground">
              app.vectorlearn.io / dashboard
            </span>
          </div>
        </div>

        <div className="grid grid-cols-12 min-h-[420px]">
          <aside className="col-span-2 border-r border-border bg-muted/20 p-4 hidden md:block">
            <div className="space-y-1">
              {[
                { icon: Calendar, label: "Orar", active: true },
                { icon: Users, label: "Elevi" },
                { icon: BookOpen, label: "Cursuri" },
                { icon: CreditCard, label: "Plăți" },
                { icon: MessageSquare, label: "Mesaje" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs ${
                    item.active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              ))}
            </div>
          </aside>

          <main className="col-span-12 md:col-span-10 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold">Tablou de bord</h3>
                <p className="text-xs text-muted-foreground">Luni, 28 mai 2026</p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs rounded-md bg-secondary px-2.5 py-1.5 font-medium">
                  Săptămâna
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Elevi activi", value: "342", change: "+12", pastel: "pastel-mint" },
                { label: "Lecții azi", value: "47", change: "+5", pastel: "pastel-lavender" },
                { label: "Venituri lună", value: "€18.4k", change: "+23%", pastel: "pastel-peach" },
                { label: "Rată prezență", value: "94%", change: "+2%", pastel: "pastel-sky" },
              ].map((stat) => (
                <div key={stat.label} className={`${stat.pastel} rounded-lg p-3`}>
                  <p className="text-[10px] text-foreground/60 font-medium uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-lg font-bold mt-1">{stat.value}</p>
                  <p className="text-[10px] text-foreground/60 mt-0.5">{stat.change} vs. săpt. trecută</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-lg border border-border p-4">
                <p className="text-xs font-semibold mb-3">Programul de azi</p>
                <div className="space-y-2">
                  {[
                    { time: "09:00", course: "Engleză B2 — Grupa 4", room: "Sala 1", color: "bg-primary" },
                    { time: "10:30", course: "Pian — Lecție individuală", room: "Sala 3", color: "bg-[hsl(340,80%,55%)]" },
                    { time: "14:00", course: "Programare Python", room: "Online", color: "bg-[hsl(158,64%,40%)]" },
                    { time: "16:00", course: "Robotică — Începători", room: "Sala 2", color: "bg-[hsl(38,92%,50%)]" },
                  ].map((item) => (
                    <div key={item.time} className="flex items-center gap-3 rounded-md hover:bg-muted/50 px-2 py-1.5">
                      <div className={`h-8 w-1 rounded-full ${item.color}`} />
                      <div className="flex-1">
                        <p className="text-xs font-medium">{item.course}</p>
                        <p className="text-[10px] text-muted-foreground">{item.time} • {item.room}</p>
                      </div>
                      <span className="text-[10px] text-success font-medium">Confirmat</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold mb-3">Leaduri noi</p>
                <div className="space-y-2.5">
                  {[
                    { name: "Maria Popescu", interest: "Curs spaniolă", status: "Trial" },
                    { name: "Andrei Ionescu", interest: "Programare web", status: "Contact" },
                    { name: "Elena V.", interest: "Pian copii", status: "Trial" },
                  ].map((lead) => (
                    <div key={lead.name} className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-[hsl(250,76%,52%)] flex items-center justify-center text-[10px] font-semibold text-white">
                        {lead.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{lead.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{lead.interest}</p>
                      </div>
                      <span className="text-[9px] font-semibold rounded-full bg-primary/10 text-primary px-2 py-0.5">
                        {lead.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <div className="hidden lg:block absolute -top-4 -right-12 rounded-lg border border-border bg-card shadow-lg p-3 animate-float">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md pastel-mint flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-foreground/70" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Plată primită</p>
            <p className="text-xs font-bold">+€240 Maria P.</p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block absolute -bottom-6 -left-8 rounded-lg border border-border bg-card shadow-lg p-3 animate-float" style={{ animationDelay: "1.5s" }}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md pastel-lavender flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-foreground/70" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">WhatsApp trimis</p>
            <p className="text-xs font-bold">42 părinți notificați</p>
          </div>
        </div>
      </div>
    </div>
  );
}
