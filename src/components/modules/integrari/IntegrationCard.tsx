import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Integration, CATEGORY_META } from "@/data/integrations";

interface IntegrationCardProps {
  integration: Integration;
  onClick?: (i: Integration) => void;
}

export function IntegrationCard({ integration, onClick }: IntegrationCardProps) {
  const cat = CATEGORY_META[integration.category];
  const initials = integration.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onClick?.(integration)}
      data-testid={`int-card-${integration.id}`}
      className="text-left rounded-2xl border border-border bg-card p-4 card-hover relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Integrare ${integration.name} — ${cat.label}`}
    >
      {integration.popular && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
          <Sparkles className="h-2.5 w-2.5" />
          Popular
        </span>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm text-foreground/80", cat.pastel)}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{integration.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{cat.label}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
        {integration.description}
      </p>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        Setup ~{integration.setupMinutes} min
      </div>
    </button>
  );
}
