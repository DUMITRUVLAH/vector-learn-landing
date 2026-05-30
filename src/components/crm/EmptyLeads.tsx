/**
 * CRM-128 — EmptyLeads component
 * Shown when the kanban/list view has zero leads (no filters active).
 */
import { UserPlus } from "lucide-react";

interface EmptyLeadsProps {
  onAddLead?: () => void;
}

function LeadsSVG() {
  return (
    <svg
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="none"
      aria-hidden="true"
      className="mx-auto"
    >
      {/* Kanban board columns */}
      <rect x="4" y="16" width="28" height="64" rx="6" className="fill-muted" />
      <rect x="38" y="16" width="28" height="64" rx="6" className="fill-muted" />
      <rect x="72" y="16" width="28" height="64" rx="6" className="fill-muted" />
      {/* Plus icon in center column */}
      <circle cx="52" cy="48" r="14" className="fill-primary/20" />
      <path d="M52 42v12M46 48h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="stroke-primary" />
      {/* Person icons in first/last columns */}
      <circle cx="18" cy="36" r="6" className="fill-primary/30" />
      <path d="M10 56c0-4.4 3.6-8 8-8h0c4.4 0 8 3.6 8 8" className="fill-primary/30" />
      <circle cx="86" cy="36" r="6" className="fill-muted-foreground/20" />
      <path d="M78 56c0-4.4 3.6-8 8-8h0c4.4 0 8 3.6 8 8" className="fill-muted-foreground/20" />
    </svg>
  );
}

export function EmptyLeads({ onAddLead }: EmptyLeadsProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <LeadsSVG />
      <h3 className="mt-4 text-lg font-semibold">Niciun lead încă</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">
        Adaugă primul lead sau importă din CSV pentru a începe să gestionezi pipeline-ul.
      </p>
      {onAddLead && (
        <button
          type="button"
          onClick={onAddLead}
          className="mt-5 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Adaugă primul lead
        </button>
      )}
    </div>
  );
}
