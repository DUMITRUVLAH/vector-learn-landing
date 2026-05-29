import { useState, useMemo } from "react";
import { Mail, TrendingUp, ArrowRight } from "lucide-react";
import { CalculatorShell } from "@/components/tools/CalculatorShell";
import { ROIBreakdown, ROI_ICONS, type ROIBreakdownItem } from "@/components/tools/ROIBreakdown";
import { cn } from "@/lib/utils";

interface ROIInputs {
  students: number;
  teachers: number;
  avgMonthlyPrice: number;
  adminHoursPerWeek: number;
  noShowRate: number;
  overdueRate: number;
  churnRate: number;
}

export interface ROIResult {
  monthlyRevenue: number;
  timeSavings: number;
  noShowSavings: number;
  paymentSavings: number;
  churnSavings: number;
  marketingSavings: number;
  totalMonthly: number;
  totalAnnual: number;
  hoursRecovered: number;
  paybackMonths: number;
  vectorLearnCost: number;
}

const HOURLY_COST_EUR = 12;
const ADMIN_REDUCTION_PCT = 0.7;
const NO_SHOW_REDUCTION_PCT = 0.6;
const OVERDUE_REDUCTION_PCT = 0.38;
const CHURN_REDUCTION_PCT = 0.25;
const MARKETING_EFFICIENCY_PCT = 0.18;
const VECTOR_LEARN_MONTHLY_BASE = 69;

export function calculateROI(inputs: ROIInputs): ROIResult {
  const s = Math.max(0, inputs.students);
  const t = Math.max(0, inputs.teachers);
  const p = Math.max(0, inputs.avgMonthlyPrice);
  const monthlyRevenue = s * p;

  const adminHoursSaved = inputs.adminHoursPerWeek * ADMIN_REDUCTION_PCT * 4;
  const timeSavings = adminHoursSaved * HOURLY_COST_EUR;

  const noShowLoss = monthlyRevenue * (inputs.noShowRate / 100);
  const noShowSavings = noShowLoss * NO_SHOW_REDUCTION_PCT;

  const overdueLoss = monthlyRevenue * (inputs.overdueRate / 100) * 0.4;
  const paymentSavings = overdueLoss * OVERDUE_REDUCTION_PCT;

  const churnLoss = monthlyRevenue * (inputs.churnRate / 100);
  const churnSavings = churnLoss * CHURN_REDUCTION_PCT;

  const marketingSavings = monthlyRevenue * 0.04 * MARKETING_EFFICIENCY_PCT;

  const totalMonthly = timeSavings + noShowSavings + paymentSavings + churnSavings + marketingSavings;
  const totalAnnual = totalMonthly * 12;

  const teacherTier = t > 30 ? 149 : t > 10 ? 69 : 29;
  const vectorLearnCost = teacherTier;
  const paybackMonths = totalMonthly > 0 ? vectorLearnCost / totalMonthly : 999;

  return {
    monthlyRevenue,
    timeSavings,
    noShowSavings,
    paymentSavings,
    churnSavings,
    marketingSavings,
    totalMonthly,
    totalAnnual,
    hoursRecovered: adminHoursSaved,
    paybackMonths,
    vectorLearnCost,
  };
}

const DEFAULTS: ROIInputs = {
  students: 200,
  teachers: 12,
  avgMonthlyPrice: 280,
  adminHoursPerWeek: 20,
  noShowRate: 8,
  overdueRate: 15,
  churnRate: 6,
};

interface SliderRowProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}

function SliderRow({ id, label, hint, value, onChange, min, max, step = 1, suffix }: SliderRowProps) {
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
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ROICalculatorPage() {
  const [inputs, setInputs] = useState<ROIInputs>(DEFAULTS);
  const [currency, setCurrency] = useState<"EUR" | "RON">("EUR");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const ron = currency === "RON" ? 4.97 : 1;
  const fmt = (n: number) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n * ron);

  const result = useMemo(() => calculateROI(inputs), [inputs]);

  const update = <K extends keyof ROIInputs>(key: K, value: ROIInputs[K]) =>
    setInputs((p) => ({ ...p, [key]: value }));

  const breakdown: ROIBreakdownItem[] = [
    {
      label: "Timp admin recuperat",
      amount: result.timeSavings * ron,
      icon: ROI_ICONS.time,
      pastel: "pastel-mint",
      explainer: `${result.hoursRecovered.toFixed(0)} ore/lună automatizate × ${HOURLY_COST_EUR} ${currency === "EUR" ? "€" : "RON × 4.97"}/oră`,
    },
    {
      label: "Reducere no-show",
      amount: result.noShowSavings * ron,
      icon: ROI_ICONS.noShow,
      pastel: "pastel-peach",
      explainer: "Reminder WhatsApp + politică anulare clară",
    },
    {
      label: "Plăți la timp",
      amount: result.paymentSavings * ron,
      icon: ROI_ICONS.payments,
      pastel: "pastel-sky",
      explainer: "Reminder restanțe + suspendare acces după 21 zile",
    },
    {
      label: "Retenție îmbunătățită",
      amount: result.churnSavings * ron,
      icon: ROI_ICONS.churn,
      pastel: "pastel-lavender",
      explainer: "Predicție churn cu motive + plan acțiune mentor",
    },
    {
      label: "Marketing eficient",
      amount: result.marketingSavings * ron,
      icon: ROI_ICONS.marketing,
      pastel: "pastel-rose",
      explainer: "Atribuire UTM până la elev plătitor, bugete pe sursele bune",
    },
  ];

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setEmailSent(true);
  };

  return (
    <CalculatorShell
      badge="Calculator ROI"
      title={
        <>
          Cât economisești cu <span className="text-gradient">Vector Learn</span>
        </>
      }
      description="Configurează parametrii centrului tău. Calculul se face în timp real, fără email sau înregistrare. Trimite-l pe email dacă vrei raportul detaliat în PDF."
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-end mb-4">
          <div role="tablist" aria-label="Monedă" className="inline-flex rounded-full border border-border bg-card p-1">
            {(["EUR", "RON"] as const).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={currency === c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
                  currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-md space-y-5">
            <div>
              <h2 className="text-base font-bold">Configurează centrul tău</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Trage sliderele. Cifrele se actualizează instant.
              </p>
            </div>

            <SliderRow id="r-students" label="Elevi activi" hint="Câți elevi plătesc lunar" value={inputs.students} onChange={(v) => update("students", v)} min={10} max={2000} step={10} />
            <SliderRow id="r-teachers" label="Profesori" hint="Care influențează tier-ul Vector Learn" value={inputs.teachers} onChange={(v) => update("teachers", v)} min={1} max={150} />
            <SliderRow id="r-price" label="Preț mediu lunar / elev" hint="Tarif mediu per elev pe lună" value={inputs.avgMonthlyPrice} onChange={(v) => update("avgMonthlyPrice", v)} min={50} max={800} step={10} suffix=" €" />
            <SliderRow id="r-admin" label="Ore admin / săptămână" hint="Cât timp ai petrece pe Excel, WhatsApp, telefoane" value={inputs.adminHoursPerWeek} onChange={(v) => update("adminHoursPerWeek", v)} min={5} max={60} />
            <SliderRow id="r-noshow" label="Rata no-show" hint="Procent lecții la care elevii lipsesc fără anunț" value={inputs.noShowRate} onChange={(v) => update("noShowRate", v)} min={0} max={30} suffix=" %" />
            <SliderRow id="r-overdue" label="Rata restanțe plată" hint="Procent facturi plătite cu întârziere > 7 zile" value={inputs.overdueRate} onChange={(v) => update("overdueRate", v)} min={0} max={40} suffix=" %" />
            <SliderRow id="r-churn" label="Churn lunar" hint="Procent elevi care pleacă fiecare lună" value={inputs.churnRate} onChange={(v) => update("churnRate", v)} min={0} max={20} suffix=" %" />
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5 p-6 shadow-md">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Economii totale lunare
              </p>
              <p data-testid="roi-monthly" className="text-4xl sm:text-5xl font-display font-bold text-gradient tabular-nums">
                {fmt(result.totalMonthly)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                ≈ <span className="font-semibold text-foreground">{fmt(result.totalAnnual)}</span> economisiți anual
              </p>

              <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-primary/20">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ore recuperate</p>
                  <p data-testid="roi-hours" className="text-lg font-display font-bold tabular-nums mt-0.5">
                    {result.hoursRecovered.toFixed(0)}h/lună
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Plan Vector Learn</p>
                  <p className="text-lg font-display font-bold tabular-nums mt-0.5">
                    {fmt(result.vectorLearnCost)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payback</p>
                  <p data-testid="roi-payback" className="text-lg font-display font-bold tabular-nums mt-0.5">
                    {result.paybackMonths < 1
                      ? "< 1 lună"
                      : `${result.paybackMonths.toFixed(1)} luni`}
                  </p>
                </div>
              </div>

              <div className="mt-5 inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-3 py-1 text-xs font-semibold">
                <TrendingUp className="h-3 w-3" />
                ROI 12 luni: {result.vectorLearnCost > 0 ? (((result.totalAnnual - result.vectorLearnCost * 12) / (result.vectorLearnCost * 12)) * 100).toFixed(0) : 0}%
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-3">Breakdown pe surse de economisire</h3>
              <ROIBreakdown items={breakdown} currency={currency} />
            </div>

            <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-5">
              {emailSent ? (
                <p className="text-sm text-success font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Raport PDF trimis pe email!
                </p>
              ) : (
                <>
                  <p className="text-sm font-bold mb-1">Trimite-mi raportul PDF pe email</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Cu toate cifrele tale + un plan personalizat pentru implementare. Niciun spam.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@centrul-tau.ro"
                      aria-label="Email pentru raport"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Trimite raport
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </form>

            <a
              href="#/?section=pricing"
              className="block text-center rounded-md border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Vezi prețuri detaliate →
            </a>
          </div>
        </div>
      </div>
    </CalculatorShell>
  );
}
