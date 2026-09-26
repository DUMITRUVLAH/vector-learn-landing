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
  /** CRM-G01 — antetul din Google Drive: titlu de 24px cu greutate normală, fără „erou". */
  variant?: "hr365" | "gm3";
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  size = "default",
  variant = "hr365",
  className,
}: PageHeaderProps) {
  const gm3 = variant === "gm3";
  return (
    <div
      className={cn(
        gm3
          ? "mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          : "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className={cn("flex min-w-0 flex-col", gm3 ? "gap-0.5" : "gap-1.5")}>
        {eyebrow ? (
          <p className="text-sm font-medium capitalize text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            gm3
              ? "text-2xl font-normal leading-tight"
              : cn("font-bold leading-tight tracking-tight", size === "large" ? "text-3xl sm:text-[2.5rem]" : "text-2xl sm:text-3xl"),
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
      {actions ? (
        // Pe telefon acțiunile nu se mai înghesuie pe un rând care lățea pagina (Pipeline avea 809px
        // pe un ecran de 390 și se deschidea micșorat la 48%): devin un rând care derulează lateral,
        // iar acțiunea principală (butonul plin) trece prima, ca „Adaugă…" să fie mereu la vedere.
        <div className="flex items-center gap-2 sm:flex-wrap sm:justify-end max-sm:-mb-1 max-sm:overflow-x-auto max-sm:pb-1 max-sm:[&>*]:shrink-0 max-sm:[&>[data-variant=default]]:order-first">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
