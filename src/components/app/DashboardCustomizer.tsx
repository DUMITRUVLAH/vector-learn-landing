/**
 * POLISH-002: DashboardCustomizer — slide-over panel for toggling and reordering
 * dashboard widgets. Opened via a gear button in the dashboard header.
 */
import { X, ChevronUp, ChevronDown, GripVertical, RotateCcw } from "lucide-react";
import { WidgetConfig, WidgetId } from "@/hooks/useDashboardWidgets";

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
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

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-40 flex items-start justify-end bg-background/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="h-full w-full max-w-xs bg-card border-l border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Personalizează dashboard"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Personalizează dashboard</h2>
          <button
            type="button"
            aria-label="Închide personalizator"
            onClick={onClose}
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Instructions */}
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
          Activează sau dezactivează widget-urile. Reordonează-le cu săgețile.
        </p>

        {/* Widget list */}
        <ul className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {widgets.map((widget, idx) => (
            <li
              key={widget.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5"
            >
              {/* Drag handle visual (not functional, just UX affordance) */}
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />

              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={widget.visible}
                aria-label={`${widget.visible ? "Dezactivează" : "Activează"} ${widget.label}`}
                onClick={() => onToggle(widget.id)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
                  widget.visible ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    widget.visible ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>

              {/* Label */}
              <span
                className={`flex-1 text-xs ${widget.visible ? "font-medium" : "text-muted-foreground"}`}
              >
                {widget.label}
              </span>

              {/* Order buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-label={`Mută ${widget.label} sus`}
                  onClick={() => onMoveUp(widget.id)}
                  disabled={idx === 0}
                  className="rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Mută ${widget.label} jos`}
                  onClick={() => onMoveDown(widget.id)}
                  disabled={idx === widgets.length - 1}
                  className="rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Resetează la valorile implicite
          </button>
        </div>
      </div>
    </div>
  );
}
