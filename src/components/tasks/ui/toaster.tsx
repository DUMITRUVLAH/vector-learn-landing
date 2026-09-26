/**
 * Afișarea coadei de toast-uri a modulului (`@/lib/tasks/toast`). Montată o singură dată, în
 * shell-ul modulului. `role="status"` / `role="alert"`: cititorul de ecran anunță confirmarea
 * politicos și eroarea imediat.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismissToast, subscribeToasts, type ToastItem } from "@/lib/tasks/toast";

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const TONES = {
  success: "text-success",
  error: "text-destructive",
  info: "text-primary",
} as const;

export function TasksToaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (items.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONES[item.kind])} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{item.message}</p>
              {item.description && <p className="mt-1 text-muted-foreground">{item.description}</p>}
            </div>
            {item.action && (
              <button
                type="button"
                className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11"
                onClick={() => {
                  item.action?.onClick();
                  dismissToast(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Închide"
              className="-m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-sm:h-11 max-sm:w-11"
              onClick={() => dismissToast(item.id)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
