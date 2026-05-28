import { useState, useMemo } from "react";
import { Wallet, Award, TrendingUp } from "lucide-react";

interface CommissionInputs {
  lessonsPerMonth: number;
  pricePerLesson: number;
  commissionRate: number;
  attendanceBonus: number;
}

export interface CommissionResult {
  grossRevenue: number;
  commissionBase: number;
  bonusAmount: number;
  totalPay: number;
}

export function calculateCommission(inputs: CommissionInputs): CommissionResult {
  const grossRevenue = Math.max(0, inputs.lessonsPerMonth) * Math.max(0, inputs.pricePerLesson);
  const commissionBase = grossRevenue * (inputs.commissionRate / 100);
  const bonusAmount = inputs.attendanceBonus;
  const totalPay = commissionBase + bonusAmount;
  return { grossRevenue, commissionBase, bonusAmount, totalPay };
}

const DEFAULTS: CommissionInputs = {
  lessonsPerMonth: 80,
  pricePerLesson: 35,
  commissionRate: 45,
  attendanceBonus: 200,
};

function formatEur(v: number): string {
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

interface SliderProps {
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

function Slider({ label, hint, value, onChange, min, max, step = 1, suffix, id }: SliderProps) {
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
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function CommissionCalculator() {
  const [inputs, setInputs] = useState<CommissionInputs>(DEFAULTS);
  const r = useMemo(() => calculateCommission(inputs), [inputs]);
  const update = <K extends keyof CommissionInputs>(key: K, value: CommissionInputs[K]) =>
    setInputs((p) => ({ ...p, [key]: value }));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-bold">Calculator salariu profesor</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Vezi exact câștigul lunar pe baza formulei tale.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-5 sm:p-6 space-y-5">
          <Slider id="c-lessons" label="Lecții pe lună" hint="Câte lecții susține profesorul" value={inputs.lessonsPerMonth} onChange={(v) => update("lessonsPerMonth", v)} min={10} max={200} />
          <Slider id="c-price" label="Preț per lecție" hint="Tarif încasat per lecție de către centru" value={inputs.pricePerLesson} onChange={(v) => update("pricePerLesson", v)} min={10} max={150} suffix=" €" />
          <Slider id="c-rate" label="Comision profesor" hint="Procent din încasare care merge la profesor" value={inputs.commissionRate} onChange={(v) => update("commissionRate", v)} min={20} max={70} suffix=" %" />
          <Slider id="c-bonus" label="Bonus prezență 100%" hint="Bonus fix dacă rata de prezență la lecțiile lui = 100%" value={inputs.attendanceBonus} onChange={(v) => update("attendanceBonus", v)} min={0} max={500} step={50} suffix=" €" />
        </div>

        <div className="p-5 sm:p-6 bg-gradient-to-br from-card via-card to-muted/40 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Salariu lunar profesor
            </p>
            <p data-testid="comm-total" className="text-4xl sm:text-5xl font-display font-bold text-gradient tabular-nums">
              {formatEur(r.totalPay)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ≈ {formatEur(r.totalPay * 12)} venit anual
            </p>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg pastel-sky p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 text-foreground/70" />
                <span className="text-xs font-medium">Venit centru</span>
              </div>
              <span data-testid="comm-gross" className="text-sm font-bold tabular-nums">{formatEur(r.grossRevenue)}</span>
            </div>
            <div className="rounded-lg pastel-mint p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-foreground/70" />
                <span className="text-xs font-medium">Comision ({inputs.commissionRate}%)</span>
              </div>
              <span data-testid="comm-base" className="text-sm font-bold tabular-nums">{formatEur(r.commissionBase)}</span>
            </div>
            <div className="rounded-lg pastel-lemon p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-3.5 w-3.5 text-foreground/70" />
                <span className="text-xs font-medium">Bonus prezență</span>
              </div>
              <span data-testid="comm-bonus" className="text-sm font-bold tabular-nums">{formatEur(r.bonusAmount)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 Profesorul vede acest calcul în timp real în aplicația lui. Transparența reduce frecarea
            și cererile de clarificare cu media −70%.
          </p>
        </div>
      </div>
    </div>
  );
}
