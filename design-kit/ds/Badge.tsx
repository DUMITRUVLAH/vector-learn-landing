/**
 * HR365-002 — Badge + StatusBadge.
 *
 * Pill-shaped, `text-xs`, semibold. The semantic variants (success / warning /
 * info) are tinted surfaces with their own ink, not solid fills — they sit
 * inside dense tables without shouting.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground border-transparent",
  secondary: "bg-secondary text-secondary-foreground border-transparent",
  destructive: "bg-destructive text-destructive-foreground border-transparent",
  outline: "text-foreground border-border",
  success:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  warning:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  info: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = "default", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-normal",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * The status vocabulary shared by PAR requests, invoices, captures and tasks.
 * Unknown keys fall back to an outline badge showing the raw value, so a new
 * backend status degrades to readable text instead of rendering nothing.
 */
export const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: "Activ", variant: "default" },
  inactive: { label: "Inactiv", variant: "secondary" },
  pending: { label: "În așteptare", variant: "warning" },
  approved: { label: "Aprobat", variant: "success" },
  rejected: { label: "Respins", variant: "destructive" },
  draft: { label: "Ciornă", variant: "secondary" },
  completed: { label: "Completat", variant: "success" },
  paid: { label: "Plătit", variant: "success" },
  overdue: { label: "Depășit", variant: "destructive" },
  archived: { label: "Arhivat", variant: "outline" },
};

export interface StatusBadgeProps {
  status: string;
  /** Overrides the mapped label (keeps the mapped colour). */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status] ?? { label: label ?? status, variant: "outline" as BadgeVariant };
  return (
    <Badge variant={cfg.variant} className={className}>
      {label ?? cfg.label}
    </Badge>
  );
}
