import { useState, useMemo } from "react";
import { CheckCircle2, X, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { CalculatorShell } from "@/components/tools/CalculatorShell";
import {
  MigrationTimeline,
  DEFAULT_PHASES,
  type TimelinePhase,
} from "@/components/tools/MigrationTimeline";
import { cn } from "@/lib/utils";

type SourceSystem = "hollihop" | "sycret" | "anyclass" | "excel" | "other";

interface MigrationInputs {
  source: SourceSystem;
  students: number;
  teachers: number;
  historyYears: number;
  whiteGlove: boolean;
}

const SOURCE_META: Record<SourceSystem, { label: string; complexity: number }> = {
  hollihop: { label: "HOLLIHOP", complexity: 1.0 },
  sycret: { label: "Sycret", complexity: 1.1 },
  anyclass: { label: "AnyClass", complexity: 0.9 },
  excel: { label: "Excel / Google Sheets", complexity: 1.3 },
  other: { label: "Alt CRM", complexity: 1.4 },
};

export interface MigrationResult {
  phases: TimelinePhase[];
  totalDays: number;
  totalHours: number;
  costEUR: number;
  selfServiceCostEUR: number;
}

export function calculateMigration(inputs: MigrationInputs): MigrationResult {
  const complexity = SOURCE_META[inputs.source].complexity;
  const scaleMultiplier = Math.max(1, Math.log10(Math.max(10, inputs.students) / 100) + 1);
  const yearsMultiplier = 1 + (Math.max(0, inputs.historyYears - 1) * 0.15);

  const phases = DEFAULT_PHASES.map((p) => ({
    ...p,
    days: Math.max(1, Math.ceil(p.days * complexity * scaleMultiplier * yearsMultiplier * 0.7)),
  }));

  const totalDays = phases.reduce((s, p) => s + p.days, 0);
  const totalHours = totalDays * 6;

  const costEUR = inputs.whiteGlove ? 0 : Math.max(0, totalHours * 80 * 0.4);
  const selfServiceCostEUR = totalHours * 25;

  return { phases, totalDays, totalHours, costEUR, selfServiceCostEUR };
}

const DEFAULTS: MigrationInputs = {
  source: "hollihop",
  students: 250,
  teachers: 12,
  historyYears: 3,
  whiteGlove: true,
};

export function MigrationEstimatorPage() {
  const [inputs, setInputs] = useState<MigrationInputs>(DEFAULTS);
  const result = useMemo(() => calculateMigration(inputs), [inputs]);

  const update = <K extends keyof MigrationInputs>(key: K, value: MigrationInputs[K]) =>
    setInputs((p) => ({ ...p, [key]: value }));

  const fmt = (n: number) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <CalculatorShell
      badge="Estimator migrare"
      title={
        <>
          Cât durează să <span className="text-gradient">migrezi la Vector Learn</span>
        </>
      }
      description="Estimează în 30 de secunde cât timp ia mutarea de la sistemul tău actual. White-glove (echipa noastră face tot) este inclus pe planurile Pro și Enterprise."
    >
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1.3fr] gap-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-base font-bold">Configurează migrarea</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estimarea se actualizează în timp real.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Sistem actual</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SOURCE_META) as SourceSystem[]).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => update("source", src)}
                  data-testid={`source-${src}`}
                  aria-pressed={inputs.source === src}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs font-semibold transition-all text-left",
                    inputs.source === src
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {SOURCE_META[src].label}
                </button>
              ))}
            </div>
          </div>

          <Slider id="m-students" label="Elevi în sistemul actual" value={inputs.students} onChange={(v) => update("students", v)} min={10} max={5000} step={10} />
          <Slider id="m-teachers" label="Profesori" value={inputs.teachers} onChange={(v) => update("teachers", v)} min={1} max={150} />
          <Slider id="m-years" label="Ani istoric de migrat" value={inputs.historyYears} onChange={(v) => update("historyYears", v)} min={1} max={10} suffix=" ani" />

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-bold mb-3">Cine face migrarea?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update("whiteGlove", true)}
                aria-pressed={inputs.whiteGlove}
                data-testid="mode-white-glove"
                className={cn(
                  "rounded-md border px-3 py-3 text-left transition-all",
                  inputs.whiteGlove
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                <p className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  White-glove
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Echipa noastră face tot. Inclus pe Pro+.
                </p>
              </button>
              <button
                type="button"
                onClick={() => update("whiteGlove", false)}
                aria-pressed={!inputs.whiteGlove}
                data-testid="mode-self-service"
                className={cn(
                  "rounded-md border px-3 py-3 text-left transition-all",
                  !inputs.whiteGlove
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted"
                )}
              >
                <p className="text-xs font-bold text-foreground">Self-service</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Folosești ghidul nostru. Ești pe cont propriu.
                </p>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5 p-6 shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {inputs.whiteGlove ? "Costul tău cu white-glove" : "Costul tău self-service"}
            </p>
            <p data-testid="migr-cost" className="text-4xl sm:text-5xl font-display font-bold text-gradient tabular-nums">
              {inputs.whiteGlove ? "Gratuit" : fmt(result.selfServiceCostEUR)}
            </p>
            {inputs.whiteGlove && (
              <p className="text-xs text-muted-foreground mt-1">
                Pe planuri Pro și Enterprise · valoare echivalentă{" "}
                <span className="line-through">{fmt(result.totalHours * 80 * 0.4)}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-primary/20">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Durată estimată
                </p>
                <p data-testid="migr-days" className="text-xl font-display font-bold tabular-nums mt-0.5">
                  {result.totalDays} zile
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ore tehnice
                </p>
                <p className="text-xl font-display font-bold tabular-nums mt-0.5">
                  ~{result.totalHours}h
                </p>
              </div>
            </div>
          </div>

          <MigrationTimeline phases={result.phases} whiteGlove={inputs.whiteGlove} />

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-bold mb-3">Comparare moduri migrare</p>
            <div className="space-y-2">
              {[
                { label: "Migrare gratuită", whiteGlove: true, selfService: false },
                { label: "Mapping câmpuri custom", whiteGlove: true, selfService: false },
                { label: "Verificare manuală dedupe", whiteGlove: true, selfService: false },
                { label: "Training echipă live (2 sesiuni)", whiteGlove: true, selfService: false },
                { label: "Suport intensiv go-live (72h)", whiteGlove: true, selfService: false },
                { label: "Documentație pas-cu-pas + video", whiteGlove: true, selfService: true },
                { label: "Acces la communitatea Slack", whiteGlove: true, selfService: true },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
                  <span className="text-foreground/85">{row.label}</span>
                  <span className="w-20 text-center">
                    {row.whiteGlove ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success inline" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground/50 inline" />
                    )}
                  </span>
                  <span className="w-20 text-center">
                    {row.selfService ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success inline" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground/50 inline" />
                    )}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-[10px] font-semibold text-muted-foreground pt-2 border-t border-border">
                <span></span>
                <span className="w-20 text-center">White-glove</span>
                <span className="w-20 text-center">Self-service</span>
              </div>
            </div>
          </div>

          <a
            href="#/?demo=migrare"
            className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:shadow-lg hover:bg-primary/90 transition-all"
          >
            <ShieldCheck className="h-4 w-4" />
            Programează apel migrare (gratuit, 30 min)
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </CalculatorShell>
  );
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}

function Slider({ id, label, value, onChange, min, max, step = 1, suffix }: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</label>
        <span className="text-sm font-bold tabular-nums text-primary">
          {value.toLocaleString("ro-RO")}
          {suffix && <span className="text-muted-foreground font-medium ml-0.5">{suffix}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}
