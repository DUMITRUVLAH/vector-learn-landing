/**
 * HR365-002 — PageHeader: the standard screen intro.
 *
 * Optional eyebrow (date / company), title, one-line subtitle, right-aligned
 * actions. `size="large"` is the dashboard/greeting variant (40px title).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  size?: "default" | "large";
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  size = "default",
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? (
          <p className="text-sm font-medium capitalize text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            "font-bold leading-tight tracking-tight",
            size === "large" ? "text-3xl sm:text-[2.5rem]" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={cn(
              "max-w-xl text-muted-foreground",
              size === "large" ? "text-base" : "text-sm",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
