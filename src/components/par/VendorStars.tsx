/**
 * PAR-VENDOR360 — stelele de evaluare, în două ipostaze: de citit și de apăsat.
 *
 * Accesibilitate (CLAUDE.md §3.3): varianta interactivă e un `radiogroup` real — se ajunge la ea
 * cu Tab, se alege cu săgeți sau cu cifrele 1–5, iar fiecare stea are etichetă („3 stele din 5").
 * Un rând de iconițe pe care doar mausul le poate atinge ar lăsa evaluarea inaccesibilă exact
 * pentru oamenii care completează formulare de la tastatură toată ziua.
 */
import { useRef } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-7 w-7" } as const;

export function StarRating({
  value,
  count,
  size = "sm",
  className,
}: {
  /** Media, 0–5. `null` = nimeni n-a evaluat încă. */
  value: number | null;
  /** Câte evaluări stau în spatele mediei. */
  count?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (value == null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Neevaluat</span>;
  }
  const rounded = Math.round(value);
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`${value.toFixed(1)} din 5${count != null ? `, ${count} evaluări` : ""}`}
    >
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              SIZES[size],
              n <= rounded ? "fill-warning text-warning" : "text-muted-foreground/40"
            )}
          />
        ))}
      </span>
      <span className="text-xs font-medium tabular-nums text-foreground">{value.toFixed(1)}</span>
      {count != null && <span className="text-xs text-muted-foreground">({count})</span>}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
  label,
  size = "lg",
  allowClear = false,
}: {
  value: number | null;
  onChange: (stars: number | null) => void;
  label: string;
  size?: keyof typeof SIZES;
  /** Pentru criteriile opționale: reapăsarea aceleiași stele o golește. */
  allowClear?: boolean;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const next = Math.min(5, Math.max(1, (value ?? 0) + delta));
    onChange(next);
    // Mută focusul pe steaua nou aleasă, altfel cititorul de ecran anunță în continuare vechea valoare.
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-star="${next}"]`)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); move(-1); }
        else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); onChange(Number(e.key)); }
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            data-star={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? "stea" : "stele"} din 5`}
            // Un singur element din grup e în ordinea de tabulare — restul se ating cu săgețile.
            tabIndex={value === n || (value == null && n === 1) ? 0 : -1}
            onClick={() => onChange(allowClear && value === n ? null : n)}
            className="touch-target rounded-md p-1 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            <Star
              className={cn(SIZES[size], active ? "fill-warning text-warning" : "text-muted-foreground/40")}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
