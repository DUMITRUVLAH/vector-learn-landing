/**
 * CAPTURE-003: Badge de încredere AI (verde/amber/roșu).
 *
 * Verde  ≥ 0.85: AI este confident — valoarea e probabil corectă.
 * Amber  0.60–0.84: Încredere medie — verificați.
 * Roșu   < 0.60: AI nu e sigur — completați manual.
 *
 * A11y: aria-label pe badge, contrast ≥ 4.5:1, WCAG AA.
 */
import { cn } from "@/lib/utils";

export interface ConfidenceBadgeProps {
  /** Grad de încredere [0..1]. Null = AI nu a găsit câmpul. */
  confidence: number | null | undefined;
  className?: string;
}

interface Tier {
  label: string;
  ariaLabel: string;
  className: string;
}

function getTier(confidence: number | null | undefined): Tier {
  if (confidence == null) {
    return {
      label: "—",
      ariaLabel: "Câmp negăsit de AI",
      className:
        "bg-muted text-muted-foreground",
    };
  }
  if (confidence >= 0.85) {
    return {
      label: `${Math.round(confidence * 100)}%`,
      ariaLabel: `Încredere AI ridicată: ${Math.round(confidence * 100)}%`,
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    };
  }
  if (confidence >= 0.60) {
    return {
      label: `${Math.round(confidence * 100)}%`,
      ariaLabel: `Încredere AI medie: ${Math.round(confidence * 100)}% — verificați`,
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    };
  }
  return {
    label: `${Math.round(confidence * 100)}%`,
    ariaLabel: `Încredere AI scăzută: ${Math.round(confidence * 100)}% — completați manual`,
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const tier = getTier(confidence);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        tier.className,
        className
      )}
      aria-label={tier.ariaLabel}
      title={tier.ariaLabel}
    >
      {tier.label}
    </span>
  );
}
