/**
 * CRM-143 — StageMoveUndoToast
 * Shows a 5-second countdown toast after a lead stage move.
 * Clicking "Anulează" calls the provided undo callback (moveLeadStage back).
 * Unlike UndoToast (CRM-127) this is purely client-side — no API undo-token needed.
 */
import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

const TOTAL_SECONDS = 5;

interface StageMoveUndoToastProps {
  /** e.g. "Mutat la \"Interesat\"" */
  message: string;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
}

export function StageMoveUndoToast({ message, onUndo, onDismiss }: StageMoveUndoToastProps) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep a ref to onDismiss so we can call it from inside the interval without stale closure
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          onDismissRef.current();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUndo = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setUndoing(true);
    try {
      await onUndo();
    } finally {
      setUndoing(false);
      onDismiss();
    }
  };

  const progress = (secondsLeft / TOTAL_SECONDS) * 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
    >
      {/* Countdown progress bar */}
      <div className="h-1 bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-1000"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={secondsLeft}
          aria-valuemin={0}
          aria-valuemax={TOTAL_SECONDS}
          aria-label={`Undo disponibil ${secondsLeft} secunde`}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <p className="text-sm font-medium text-foreground">
          {message} · {secondsLeft}s
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={undoing || secondsLeft <= 0}
            aria-label="Anulează mutarea de stadiu"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Anulează
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Închide notificarea"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
