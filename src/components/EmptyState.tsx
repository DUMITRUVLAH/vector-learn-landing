/**
 * POLISH-003: EmptyState — reusable empty state component with icon, title,
 * description, and optional action CTA. Used across all key app pages.
 */
import { ReactNode } from "react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Lucide icon or any ReactNode (48×48 display) */
  icon: ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div
        className="rounded-2xl bg-muted p-4 mb-4 text-muted-foreground/60"
        aria-hidden="true"
      >
        <div className="h-12 w-12 flex items-center justify-center">{icon}</div>
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-5">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
