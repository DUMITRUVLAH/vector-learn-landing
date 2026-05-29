import { CheckCircle2, Circle, Database, Layers, ShieldCheck, Upload, GraduationCap, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelinePhase {
  id: string;
  label: string;
  days: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface MigrationTimelineProps {
  phases: TimelinePhase[];
  whiteGlove: boolean;
}

export function MigrationTimeline({ phases, whiteGlove }: MigrationTimelineProps) {
  const totalDays = phases.reduce((s, p) => s + p.days, 0);
  let runningDays = 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold">Timeline migrare</h3>
        <span className="text-xs text-muted-foreground">
          Total estimat: <strong data-testid="timeline-total" className="text-foreground">{totalDays} zile lucrătoare</strong>
        </span>
      </div>

      <ol className="space-y-3" data-testid="timeline-phases">
        {phases.map((phase, i) => {
          const Icon = phase.icon;
          const startDay = runningDays + 1;
          runningDays += phase.days;
          const endDay = runningDays;
          const isCovered = whiteGlove;
          return (
            <li key={phase.id} className="relative">
              {i < phases.length - 1 && (
                <span
                  className="absolute left-[18px] top-10 bottom-[-12px] w-px bg-border"
                  aria-hidden
                />
              )}
              <div className="flex gap-3">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0",
                    isCovered ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCovered ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      {phase.label}
                    </p>
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                      ziua {startDay}{phase.days > 1 ? `–${endDay}` : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{phase.description}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const DEFAULT_PHASES: TimelinePhase[] = [
  { id: "extract", label: "Extract date din sistem sursă", days: 1, icon: Database, description: "Export CSV/Excel/API + verificare integritate. Backup complet înainte de orice." },
  { id: "map", label: "Mapping câmpuri", days: 2, icon: Layers, description: "Alocare câmpuri sursă → câmpuri Vector Learn. Cu tine prima dată, apoi salvat reutilizabil." },
  { id: "validate", label: "Validare + dedupe", days: 1, icon: ShieldCheck, description: "Detectare duplicate (telefon normalizat, email), verificare consistență, raport pentru review." },
  { id: "import", label: "Import + dry-run", days: 1, icon: Upload, description: "Import într-un mediu de test, validare rezultate, fix issues, apoi import production." },
  { id: "training", label: "Training echipă", days: 2, icon: GraduationCap, description: "2 sesiuni live (manager + recepție + profesori). Documentație branduită + video tutoriale." },
  { id: "golive", label: "Go-live + suport intensiv", days: 3, icon: Rocket, description: "Mergi live cu echipă noastră în standby. Suport prioritar 24h primele 72h." },
];
