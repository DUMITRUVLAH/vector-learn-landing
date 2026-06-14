/**
 * BUDGET-003: Progress ring SVG pentru execuția globală a bugetului.
 *
 * Design:
 * - SVG circular pur, fără librărie externă.
 * - Tokeni semantici Vector 365; zero hex hardcodat.
 * - Accesibil: role="progressbar", aria-valuenow/min/max.
 * - Dark mode funcționează prin CSS currentColor + Tailwind semantic tokens.
 */

import { cn } from "@/lib/utils";

/** Returnează clasa Tailwind semantic pentru culoarea ring-ului. */
function ringColorClass(pct: number): string {
  if (pct >= 100) return "text-destructive";
  if (pct >= 80) return "text-warning";
  return "text-success";
}

/** Returnează label accesibil pentru status. */
function statusLabel(pct: number): string {
  if (pct >= 100) return "depășit";
  if (pct >= 80) return "atenție";
  return "în limită";
}

interface BudgetProgressRingProps {
  /** Procentaj 0–100+ */
  pct: number;
  /** Dimensiune SVG în pixeli (default: 80) */
  size?: number;
  /** Lățime stroke (default: 8) */
  strokeWidth?: number;
  /** Label suplimentar sub procentaj */
  label?: string;
  className?: string;
}

export function BudgetProgressRing({
  pct,
  size = 80,
  strokeWidth = 8,
  label = "Execuție",
  className,
}: BudgetProgressRingProps): JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Clamp la 100% pentru vizualizare (nu trunchia sub 0)
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  const colorClass = ringColorClass(pct);
  const center = size / 2;

  return (
    <div
      className={cn("flex flex-col items-center gap-1", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${pct}% (${statusLabel(pct)})`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="rotate-[-90deg]"
      >
        {/* Track (fundal) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        {/* Ring progres */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn("transition-all duration-700", colorClass)}
        />
      </svg>

      {/* Valoare numerică în centru (poziționat cu div-uri, nu SVG foreignObject) */}
      <div className="text-center -mt-[calc(50%+0.5rem)] pointer-events-none select-none" style={{ marginTop: `-${size * 0.6}px` }}>
        <span className={cn("text-sm font-bold tabular-nums", colorClass)}>
          {pct}%
        </span>
      </div>

      {label && (
        <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
      )}
    </div>
  );
}
