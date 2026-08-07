/**
 * HR365-002 — KpiTile: the dashboard's headline metric.
 *
 * White card, small pastel icon chip, big number, muted label. No shadow — a
 * 1px border and (when it navigates) a hover lift only.
 *
 * Renders a `<button>` only when it is actually interactive; otherwise an
 * `<article>`, so screen readers don't announce a dead control.
 */
import type { ReactNode } from "react";
import { PastelIcon } from "./PastelIcon";
import type { ChipTone } from "./tones";
import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: ChipTone;
  /** Optional second line under the label (delta, period, hint). */
  hint?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

const SHELL =
  "block w-full rounded-2xl border border-border/60 bg-card p-5 text-left";

export function KpiTile({
  label,
  value,
  icon,
  tone = "indigo",
  hint,
  onClick,
  loading = false,
  className,
}: KpiTileProps) {
  const body = (
    <>
      <PastelIcon tone={tone} size={40} className="mb-4">
        {icon}
      </PastelIcon>
      {loading ? (
        <>
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-4 w-20 animate-pulse rounded-md bg-muted" />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{label}</p>
          {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
        </>
      )}
    </>
  );

  if (!onClick) {
    return (
      <article
        className={cn(SHELL, className)}
        aria-label={loading ? `${label} — se încarcă` : `${label}`}
        aria-busy={loading || undefined}
      >
        {body}
      </article>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — deschide`}
      className={cn(
        SHELL,
        "transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {body}
    </button>
  );
}
