/**
 * POLISH-003: Reusable empty-state component.
 *
 * Props:
 *   icon       — Lucide icon (ReactNode) shown above the title
 *   title      — bold heading
 *   description — muted paragraph text
 *   action?    — optional CTA button { label, onClick }
 *
 * Fully dark-mode compatible via semantic tokens. No hardcoded colors.
 * Centered vertically in its container; typically placed inside a flex/grid cell
 * or a minimum-height wrapper by the parent.
 */
import type { ReactNode } from "react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Lucide icon (or any ReactNode) displayed above the title */
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional primary CTA */
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center"
      role="status"
      aria-label={title}
    >
      {/* Icon container — 48×48 */}
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Text */}
      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Optional CTA */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors min-h-[44px]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
