/**
 * POLISH-002: Dashboard widget customization panel.
 *
 * Shows a slide-over panel (or modal on mobile) with all available widgets
 * and toggle + reorder controls. Dark-mode semantic tokens, no hardcoded colors.
 */
import { Settings, ChevronUp, ChevronDown, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WidgetConfig, WidgetId } from "@/hooks/useDashboardWidgets";

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: Array<WidgetConfig & { visible: boolean }>;
  onToggle: (id: WidgetId) => void;
  onMoveUp: (id: WidgetId) => void;
  onMoveDown: (id: WidgetId) => void;
  onReset: () => void;
}

export function DashboardCustomizer({
  isOpen,
  onClose,
  widgets,
  onToggle,
  onMoveUp,
  onMoveDown,
  onReset,
}: DashboardCustomizerProps) {
  if (!isOpen) return null;

  // Sort: visible ones (in their display order) first, then hidden ones
  const visibleWidgets = widgets.filter((w) => w.visible);
  const hiddenWidgets = widgets.filter((w) => !w.visible);
  const orderedWidgets = [...visibleWidgets, ...hiddenWidgets];

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Personalizează dashboard"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="h-full w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Personalizează dashboard</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide panelul de personalizare"
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto py-3 px-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Activează/dezactivează widget-uri și schimbă ordinea lor cu săgețile.
          </p>

          {orderedWidgets.map((widget, idx) => {
            const visibleIdx = visibleWidgets.findIndex((w) => w.id === widget.id);
            const isFirst = widget.visible && visibleIdx === 0;
            const isLast = widget.visible && visibleIdx === visibleWidgets.length - 1;

            return (
              <div
                key={widget.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                  widget.visible
                    ? "border-border bg-card"
                    : "border-dashed border-border/60 bg-muted/30 opacity-60"
                )}
                data-testid={`widget-row-${widget.id}`}
              >
                {/* Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={widget.visible}
                  aria-label={`${widget.visible ? "Ascunde" : "Afișează"} ${widget.label}`}
                  onClick={() => onToggle(widget.id)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    widget.visible ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                      widget.visible ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{widget.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
                </div>

                {/* Reorder controls — only for visible widgets */}
                {widget.visible && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMoveUp(widget.id)}
                      disabled={isFirst}
                      aria-label={`Mută ${widget.label} mai sus`}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveDown(widget.id)}
                      disabled={isLast}
                      aria-label={`Mută ${widget.label} mai jos`}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Hidden placeholder width for hidden items (keeps layout stable) */}
                {!widget.visible && <div className="w-8" />}

                {/* Visual position indicator */}
                {widget.visible && (
                  <span className="text-[10px] font-mono text-muted-foreground/50 w-4 text-right">
                    {idx + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Resetează la setările implicite"
          >
            <RotateCcw className="h-4 w-4" />
            Resetează la implicit
          </button>
        </div>
      </div>
    </div>
  );
}
