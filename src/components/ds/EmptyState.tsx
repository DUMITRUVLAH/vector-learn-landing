/**
 * HR365-002 — EmptyState: centred glyph in a muted circle, title, one-line
 * description, optional action. `compact` is the in-card variant.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  icon?: ReactNode;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  icon,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-16",
        className,
      )}
    >
      {icon ? (
        <span
          className="mb-4 inline-flex rounded-full bg-muted p-4 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <h3
        className={cn(
          "font-semibold",
          compact ? "text-sm text-muted-foreground" : "text-xl text-foreground",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
