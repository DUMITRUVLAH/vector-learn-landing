import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PLInputs {
  students: number;
  avgPrice: number;
  teachers: number;
  commission: number;
}

export interface PLResult {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export function calculatePL(inputs: PLInputs): PLResult {
  const revenue = Math.max(0, inputs.students * inputs.avgPrice);
  const cost = Math.max(0, revenue * (inputs.commission / 100)) + inputs.teachers * 1500;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cost, profit, margin };
}

const DEFAULTS: PLInputs = {
  students: 200,
  avgPrice: 280,
  teachers: 12,
  commission: 45,
};

function formatEUR(value: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

interface SliderFieldProps {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  id: string;
}

function SliderField({ label, hint, value, onChange, min, max, step = 1, suffix, id }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
        </label>
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
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

export function PLCalculator() {
  const [inputs, setInputs] = useState<PLInputs>(DEFAULTS);
  const result = useMemo(() => calculatePL(inputs), [inputs]);

  const update = <K extends keyof PLInputs>(key: K, value: PLInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const isProfit = result.profit > 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <h3 className="text-base font-bold mb-1">Configurează scenariul tău</h3>
            <p className="text-xs text-muted-foreground">
              Modifică sliderele și vezi profitul lunar în timp real.
            </p>
          </div>

          <SliderField
            id="pl-students"
            label="Elevi activi"
            hint="Câți elevi plătesc lunar în centrul tău"
            value={inputs.students}
            onChange={(v) => update("students", v)}
            min={10}
            max={1000}
            step={10}
          />
          <SliderField
            id="pl-price"
            label="Preț mediu lunar / elev"
            hint="Tarif mediu per elev pe lună"
            value={inputs.avgPrice}
            onChange={(v) => update("avgPrice", v)}
            min={50}
            max={800}
            step={10}
            suffix=" €"
          />
          <SliderField
            id="pl-teachers"
            label="Profesori"
            hint="Cost fix per profesor: 1.500 €/lună (salariu de bază)"
            value={inputs.teachers}
            onChange={(v) => update("teachers", v)}
            min={1}
            max={80}
          />
          <SliderField
            id="pl-commission"
            label="Comision profesori"
            hint="Procent din venit care merge la profesori"
            value={inputs.commission}
            onChange={(v) => update("commission", v)}
            min={20}
            max={70}
            suffix=" %"
          />
        </div>

        <div className="p-6 sm:p-8 bg-gradient-to-br from-card via-card to-muted/40">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Profit estimat lunar
              </p>
              <div className="flex items-baseline gap-2">
                <p
                  data-testid="pl-profit"
                  className={cn(
                    "text-4xl sm:text-5xl font-display font-bold tabular-nums",
                    isProfit ? "text-gradient" : "text-destructive"
                  )}
                >
                  {formatEUR(result.profit)}
                </p>
                {isProfit ? (
                  <TrendingUp className="h-5 w-5 text-success" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isProfit ? "Centru profitabil la acest scenariu" : "Pe pierdere — ajustează variabilele"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="pastel-mint rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
                  Venit lunar
                </p>
                <p data-testid="pl-revenue" className="text-xl font-display font-bold tabular-nums mt-1">
                  {formatEUR(result.revenue)}
                </p>
              </div>
              <div className="pastel-peach rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
                  Cost total
                </p>
                <p data-testid="pl-cost" className="text-xl font-display font-bold tabular-nums mt-1">
                  {formatEUR(result.cost)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">Marjă profit</span>
                <span data-testid="pl-margin" className="text-sm font-bold tabular-nums">
                  {result.margin.toFixed(1)}%
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.max(0, Math.min(100, result.margin))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Marjă de profit"
              >
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    result.margin >= 30 ? "bg-success" : result.margin >= 15 ? "bg-warning" : "bg-destructive"
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, result.margin))}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Benchmark sănătos pentru centre educaționale: <strong className="text-foreground">25–35%</strong>.
              </p>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <p className="text-xs font-semibold text-primary mb-1">💡 Cu Vector Learn</p>
              <p className="text-xs text-foreground/85 leading-relaxed">
                Reducem timpul de facturare cu ~6h/săptămână (≈ 1 angajat part-time eliminat),
                iar plățile întârziate scad cu media 38% prin reminder-uri automate.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
