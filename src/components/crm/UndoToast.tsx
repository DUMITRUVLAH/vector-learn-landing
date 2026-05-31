/**
 * CRM-127 — UndoToast component
 * Shows a countdown toast after a lead is deleted.
 * Clicking "Undo" calls the undo API and dismisses.
 */
import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { undoDeleteLead } from "@/lib/api/audit";

interface UndoToastProps {
  undoToken: string;
  expiresAt: string; // ISO string
  message?: string;
  onUndo?: (restoredIds: string[]) => void;
  onDismiss?: () => void;
}

const TOTAL_SECONDS = 30;

export function UndoToast({ undoToken, expiresAt, message = "Lead șters", onUndo, onDismiss }: UndoToastProps) {
  const expiresMs = new Date(expiresAt).getTime();
  const getSecondsLeft = () => Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));

  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsLeft);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const left = getSecondsLeft();
      setSecondsLeft(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onDismiss?.();
      }
    }, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const handleUndo = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setUndoing(true);
    try {
      const result = await undoDeleteLead(undoToken);
      onUndo?.(result.leadIds);
    } catch {
      // Token may have expired — silently dismiss
    } finally {
      setUndoing(false);
      onDismiss?.();
    }
  };

  const progress = (secondsLeft / TOTAL_SECONDS) * 100;

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-1 bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={secondsLeft}
          aria-valuemin={0}
          aria-valuemax={TOTAL_SECONDS}
          aria-label={`Undo disponibil ${secondsLeft} secunde`}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <p className="text-sm font-medium">{message} · {secondsLeft}s</p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={undoing || secondsLeft <= 0}
            aria-label="Anulează ştergerea"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Undo
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Închide notificarea"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
