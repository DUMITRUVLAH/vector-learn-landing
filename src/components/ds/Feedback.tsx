/**
 * HR365-006 — Alert, Tabs, Progress, Skeleton, Separator.
 *
 * Alert tones are tinted surfaces, not solid fills, so a warning inside a dense
 * page reads as information rather than an error state.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─── Alert ────────────────────────────────────────────────────────────────────

export type AlertVariant = "default" | "destructive" | "success" | "warning" | "info";

const ALERT_TONES: Record<AlertVariant, string> = {
  default: "bg-card border-border text-foreground",
  destructive: "bg-destructive/[0.06] border-destructive/40 text-destructive",
  success:
    "bg-success/[0.06] border-success/35 text-emerald-700 dark:text-emerald-300",
  warning: "bg-warning/[0.08] border-warning/40 text-amber-700 dark:text-amber-300",
  info: "bg-info/[0.06] border-info/35 text-blue-700 dark:text-blue-300",
};

export interface AlertProps {
  variant?: AlertVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alert({ variant = "default", icon, title, children, className }: AlertProps) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn("flex w-full items-start gap-3 rounded-lg border p-4", ALERT_TONES[variant], className)}
    >
      {icon && (
        <span className="mt-px flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="text-sm font-semibold leading-tight">{title}</p>}
        {children && (
          <div className={cn("text-sm leading-relaxed", variant === "default" && "text-muted-foreground")}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Count pill rendered after the label. */
  count?: number;
}

export interface TabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the tab strip. */
  "aria-label": string;
  className?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  className,
  ...rest
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-md bg-muted p-1", className)}
      {...rest}
    >
      {tabs.map((tab) => {
        const on = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-3 py-1.5 text-sm transition-all duration-200",
              on
                ? "border-border bg-background font-semibold text-primary shadow-sm"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-3xs font-semibold",
                  on ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {tab.count > 99 ? "99+" : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressProps {
  /** 0–100; clamped. */
  value: number;
  tone?: "primary" | "success" | "warning" | "destructive";
  height?: number;
  "aria-label"?: string;
  className?: string;
}

const PROGRESS_TONES = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

export function Progress({ value, tone = "primary", height = 10, className, ...rest }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative w-full overflow-hidden rounded-full bg-secondary", className)}
      style={{ height: `${height}px` }}
      {...rest}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", PROGRESS_TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
}

// ─── Separator ────────────────────────────────────────────────────────────────

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "vertical" ? "w-px self-stretch" : "h-px w-full", "bg-border", className)}
    />
  );
}
