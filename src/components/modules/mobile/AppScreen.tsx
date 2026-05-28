import { Calendar, BookOpen, CreditCard, Trophy, Flame, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScreenId = "dashboard" | "schedule" | "homework" | "payments";

interface AppScreenProps {
  screen: ScreenId;
}

export function AppScreen({ screen }: AppScreenProps) {
  return (
    <div className="h-full w-full overflow-hidden bg-background" data-testid={`screen-${screen}`}>
      {screen === "dashboard" && <DashboardScreen />}
      {screen === "schedule" && <ScheduleScreen />}
      {screen === "homework" && <HomeworkScreen />}
      {screen === "payments" && <PaymentsScreen />}
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="flex flex-col gap-3 p-4 text-foreground">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold leading-tight">Salut, Maria 👋</p>
          <p className="text-[8px] text-muted-foreground">Astăzi: 2 lecții, 1 temă</p>
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-primary to-accent p-3 text-primary-foreground">
        <p className="text-[8px] text-primary-foreground/80">Următoarea lecție</p>
        <p className="text-xs font-bold mt-0.5">Engleză B2</p>
        <p className="text-[8px] text-primary-foreground/80 mt-0.5">10:00 · Sala 4 · Ana M.</p>
        <button className="mt-2 w-full rounded bg-primary-foreground/20 text-[9px] font-semibold py-1.5 text-primary-foreground">
          Intră în lecție online →
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="pastel-lemon rounded-lg p-2 animate-pulse-soft">
          <Flame className="h-3 w-3 text-foreground/70" />
          <p className="text-[7px] text-foreground/60 mt-0.5">Streak</p>
          <p className="text-sm font-bold">12 zile</p>
        </div>
        <div className="pastel-mint rounded-lg p-2 animate-pulse-soft" style={{ animationDelay: "1.5s" }}>
          <Trophy className="h-3 w-3 text-foreground/70" />
          <p className="text-[7px] text-foreground/60 mt-0.5">XP total</p>
          <p className="text-sm font-bold">2.480</p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-2">
        <p className="text-[9px] font-semibold mb-1.5">De făcut azi</p>
        <div className="space-y-1">
          {["Citește Unit 5", "Quiz vocabulary", "Audio practice 15 min"].map((t, i) => (
            <div key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className={cn("h-3 w-3", i === 0 ? "text-success" : "text-muted-foreground/40")} />
              <span className={cn("text-[8px]", i === 0 && "line-through text-muted-foreground")}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleScreen() {
  return (
    <div className="flex flex-col gap-2 p-4 text-foreground">
      <h2 className="text-xs font-bold">Săptămâna ta</h2>
      <p className="text-[8px] text-muted-foreground -mt-1">26 mai — 1 iunie</p>

      <div className="space-y-2 mt-1">
        {[
          { day: "Luni", date: "26", lessons: [{ time: "10:00", course: "Engleză B2", room: "Sala 4", color: "bg-primary" }] },
          { day: "Marți", date: "27", lessons: [{ time: "14:00", course: "Engleză B2", room: "Sala 4", color: "bg-primary" }, { time: "16:30", course: "Conversation", room: "Online", color: "bg-success" }] },
          { day: "Miercuri", date: "28", lessons: [] },
          { day: "Joi", date: "29", lessons: [{ time: "10:00", course: "Engleză B2", room: "Sala 4", color: "bg-primary" }] },
          { day: "Vineri", date: "30", lessons: [{ time: "15:00", course: "Quiz week", room: "Sala 4", color: "bg-warning" }] },
        ].map((day) => (
          <div key={day.day} className="flex gap-2">
            <div className="w-8 flex-shrink-0">
              <p className="text-[7px] text-muted-foreground uppercase">{day.day.slice(0, 3)}</p>
              <p className="text-sm font-bold leading-none">{day.date}</p>
            </div>
            <div className="flex-1 space-y-1">
              {day.lessons.length === 0 && <p className="text-[8px] text-muted-foreground italic py-1">Liber</p>}
              {day.lessons.map((l) => (
                <div key={l.time} className="flex items-center gap-1.5">
                  <div className={`h-6 w-0.5 rounded ${l.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-semibold truncate">{l.course}</p>
                    <p className="text-[7px] text-muted-foreground">{l.time} · {l.room}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeworkScreen() {
  return (
    <div className="flex flex-col gap-3 p-4 text-foreground">
      <div>
        <h2 className="text-xs font-bold">Temele tale</h2>
        <p className="text-[8px] text-muted-foreground">3 active · 1 scadent azi</p>
      </div>

      {[
        { title: "Past Perfect exercises", subject: "Engleză B2", due: "Astăzi 18:00", progress: 60, urgent: true },
        { title: "Audio listening — Unit 5", subject: "Engleză B2", due: "Mâine", progress: 0, urgent: false },
        { title: "Vocabulary quiz", subject: "Engleză B2", due: "30 mai", progress: 30, urgent: false },
      ].map((hw) => (
        <div
          key={hw.title}
          className={cn(
            "rounded-lg border p-2.5",
            hw.urgent ? "border-warning/40 bg-warning/5" : "border-border bg-card"
          )}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="text-[9px] font-bold truncate">{hw.title}</p>
              <p className="text-[7px] text-muted-foreground">{hw.subject}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <Clock className={cn("h-2.5 w-2.5 inline", hw.urgent ? "text-warning" : "text-muted-foreground")} />
              <p className={cn("text-[7px] font-semibold", hw.urgent ? "text-warning" : "text-muted-foreground")}>{hw.due}</p>
            </div>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all", hw.urgent ? "bg-warning" : "bg-primary")}
              style={{ width: `${hw.progress}%` }}
              aria-label={`Progres ${hw.progress}%`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentsScreen() {
  return (
    <div className="flex flex-col gap-3 p-4 text-foreground">
      <div>
        <h2 className="text-xs font-bold">Plățile tale</h2>
        <p className="text-[8px] text-muted-foreground">Toate sunt la zi</p>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-success/20 to-success/5 border border-success/30 p-3">
        <CheckCircle2 className="h-3 w-3 text-success" />
        <p className="text-[9px] font-bold mt-1">Abonament activ</p>
        <p className="text-[8px] text-muted-foreground">Următoarea plată: 28 iunie · 280 €</p>
      </div>

      <div>
        <p className="text-[8px] font-semibold text-muted-foreground uppercase mb-1.5">Istoric</p>
        <div className="space-y-1.5">
          {[
            { date: "28 mai", desc: "Abonament Engleză B2", amount: 280, paid: true },
            { date: "28 apr", desc: "Abonament Engleză B2", amount: 280, paid: true },
            { date: "28 mar", desc: "Abonament Engleză B2", amount: 280, paid: true },
          ].map((p) => (
            <div key={p.date} className="flex items-center gap-2 rounded-md border border-border p-1.5">
              <CreditCard className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-semibold truncate">{p.desc}</p>
                <p className="text-[7px] text-muted-foreground">{p.date}</p>
              </div>
              <p className="text-[9px] font-bold tabular-nums">{p.amount} €</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const SCREEN_LABEL: Record<ScreenId, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  dashboard: { label: "Acasă", icon: Trophy },
  schedule: { label: "Orar", icon: Calendar },
  homework: { label: "Teme", icon: BookOpen },
  payments: { label: "Plăți", icon: CreditCard },
};
