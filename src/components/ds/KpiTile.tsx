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
import { Link } from "@/router/HashRouter";
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
  /** Makes the whole tile a router link. Takes precedence over `onClick`. */
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
  "data-testid"?: string;
}

const SHELL =
  "block w-full rounded-xl border border-border/60 bg-card p-3.5 text-left sm:p-4";

export function KpiTile({
  label,
  value,
  icon,
  tone = "indigo",
  hint,
  href,
  onClick,
  loading = false,
  className,
  "data-testid": testId,
}: KpiTileProps) {
  // Compact by design: icon beside the number, not stacked above it. The old
  // stacked layout (40px chip + mb-4 + text-3xl + p-5) made three tiles eat half
  // the viewport before the user saw a single request.
  const body = (
    <div className="flex items-center gap-3">
      <PastelIcon tone={tone} size={32}>
        {icon}
      </PastelIcon>
      <div className="min-w-0 flex-1">
        {loading ? (
          <>
            <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
            <div className="mt-1.5 h-3 w-16 animate-pulse rounded-md bg-muted" />
          </>
        ) : (
          <>
            <p className="text-lg font-bold leading-tight tracking-tight tabular-nums text-foreground sm:text-2xl">
              {value}
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
            {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
          </>
        )}
      </div>
    </div>
  );

  const INTERACTIVE =
    "transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  if (href) {
    return (
      <Link
        to={href}
        aria-label={`${label} — deschide`}
        className={cn(SHELL, INTERACTIVE, "no-underline hover:no-underline", className)}
        data-testid={testId}
      >
        {body}
      </Link>
    );
  }

  if (!onClick) {
    return (
      <article
        className={cn(SHELL, className)}
        aria-label={loading ? `${label} — se încarcă` : label}
        aria-busy={loading || undefined}
        data-testid={testId}
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
      className={cn(SHELL, INTERACTIVE, className)}
      data-testid={testId}
    >
      {body}
    </button>
  );
}
