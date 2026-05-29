import { useEffect } from "react";
import { X, Clock, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Integration, CATEGORY_META } from "@/data/integrations";

interface IntegrationModalProps {
  integration: Integration | null;
  onClose: () => void;
}

export function IntegrationModal({ integration, onClose }: IntegrationModalProps) {
  useEffect(() => {
    if (!integration) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [integration, onClose]);

  if (!integration) return null;
  const cat = CATEGORY_META[integration.category];
  const initials = integration.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="int-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      data-testid="integration-modal"
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide modal"
          className="absolute top-3 right-3 touch-target rounded-md hover:bg-muted flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center font-bold text-base text-foreground/80", cat.pastel)}>
            {initials}
          </div>
          <div>
            <h3 id="int-modal-title" className="text-lg font-display font-bold flex items-center gap-2">
              {integration.name}
              {integration.popular && <Sparkles className="h-4 w-4 text-primary" />}
            </h3>
            <p className="text-xs text-muted-foreground">{cat.label}</p>
          </div>
        </div>

        <p className="text-sm text-foreground/85 leading-relaxed mb-4">{integration.description}</p>

        <div className="rounded-lg border border-border p-4 mb-4">
          <p className="text-xs font-semibold text-foreground mb-2">Cum funcționează</p>
          <ul className="space-y-1.5">
            {[
              "Conectezi din panou cu 1 click + OAuth sau API key",
              "Mapping câmpuri editabil cu preview live",
              "Test connection cu mock data înainte de activare",
              "Sync bidirecțional cu retry automat la failure",
            ].map((step) => (
              <li key={step} className="flex items-start gap-2 text-xs text-foreground/85">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                {step}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Setup estimat: <strong className="text-foreground">~{integration.setupMinutes} min</strong>
          </span>
          <a
            href="#"
            className="text-primary font-semibold hover:underline"
          >
            Vezi documentația →
          </a>
        </div>
      </div>
    </div>
  );
}
