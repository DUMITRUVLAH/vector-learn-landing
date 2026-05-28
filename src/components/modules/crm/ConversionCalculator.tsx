import { useState, useMemo } from "react";
import { Users, UserCheck, TrendingUp } from "lucide-react";

interface ConversionInputs {
  leadsPerMonth: number;
  leadToTrialRate: number;
  trialToPaidRate: number;
  avgMonthlyValue: number;
}

export interface ConversionResult {
  trials: number;
  newPaying: number;
  newMRR: number;
  costPerLead: number;
  cac: number;
}

export function calculateConversion(inputs: ConversionInputs, adSpend = 0): ConversionResult {
  const trials = (inputs.leadsPerMonth * inputs.leadToTrialRate) / 100;
  const newPaying = (trials * inputs.trialToPaidRate) / 100;
  const newMRR = newPaying * inputs.avgMonthlyValue;
  const costPerLead = inputs.leadsPerMonth > 0 ? adSpend / inputs.leadsPerMonth : 0;
  const cac = newPaying > 0 ? adSpend / newPaying : 0;
  return { trials, newPaying, newMRR, costPerLead, cac };
}

const DEFAULTS: ConversionInputs = {
  leadsPerMonth: 80,
  leadToTrialRate: 60,
  trialToPaidRate: 45,
  avgMonthlyValue: 280,
};

interface SliderRowProps {
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

function SliderRow({ label, hint, value, onChange, min, max, step = 1, suffix, id }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
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

export function ConversionCalculator() {
  const [inputs, setInputs] = useState<ConversionInputs>(DEFAULTS);
  const result = useMemo(() => calculateConversion(inputs), [inputs]);

  const update = <K extends keyof ConversionInputs>(key: K, value: ConversionInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-6 sm:p-7 space-y-5">
          <div>
            <h3 className="text-base font-bold mb-1">Calculator conversie leaduri</h3>
            <p className="text-xs text-muted-foreground">
              Estimează câți elevi noi aduci lunar la setup-ul tău actual.
            </p>
          </div>

          <SliderRow
            id="conv-leads"
            label="Leaduri pe lună"
            hint="Câte cereri de informații primești lunar (formulare, telefon, Facebook)"
            value={inputs.leadsPerMonth}
            onChange={(v) => update("leadsPerMonth", v)}
            min={10}
            max={500}
            step={10}
          />
          <SliderRow
            id="conv-trial"
            label="Conversie lead → trial"
            hint="Procent din leaduri care vin la ora de probă"
            value={inputs.leadToTrialRate}
            onChange={(v) => update("leadToTrialRate", v)}
            min={10}
            max={90}
            suffix=" %"
          />
          <SliderRow
            id="conv-paid"
            label="Conversie trial → plătitor"
            hint="Procent din trial-uri care semnează abonament"
            value={inputs.trialToPaidRate}
            onChange={(v) => update("trialToPaidRate", v)}
            min={10}
            max={90}
            suffix=" %"
          />
          <SliderRow
            id="conv-value"
            label="Valoare medie lunară / elev"
            hint="Tarif mediu lunar per elev nou"
            value={inputs.avgMonthlyValue}
            onChange={(v) => update("avgMonthlyValue", v)}
            min={100}
            max={800}
            step={10}
            suffix=" €"
          />
        </div>

        <div className="p-6 sm:p-7 bg-gradient-to-br from-card via-card to-muted/40 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              MRR adăugat / lună
            </p>
            <p data-testid="conv-mrr" className="text-4xl sm:text-5xl font-display font-bold text-gradient tabular-nums">
              {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(result.newMRR)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ≈ {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(result.newMRR * 12)} venit anual recurent
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="pastel-sky rounded-xl p-4">
              <Users className="h-4 w-4 text-foreground/70 mb-1.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
                Trial-uri lună
              </p>
              <p data-testid="conv-trials" className="text-xl font-display font-bold tabular-nums mt-1">
                {Math.round(result.trials)}
              </p>
            </div>
            <div className="pastel-mint rounded-xl p-4">
              <UserCheck className="h-4 w-4 text-foreground/70 mb-1.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
                Elevi noi
              </p>
              <p data-testid="conv-paying" className="text-xl font-display font-bold tabular-nums mt-1">
                {Math.round(result.newPaying)}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary mb-1">
                  💡 Cu automatizările Vector Learn
                </p>
                <p className="text-xs text-foreground/85 leading-relaxed">
                  Centre comparabile au crescut conversia lead → trial cu media{" "}
                  <strong className="text-foreground">+38%</strong> și trial → plătit cu{" "}
                  <strong className="text-foreground">+22%</strong> prin reminder-uri WhatsApp
                  și follow-up automat (date interne, eșantion 47 centre, 2025).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
