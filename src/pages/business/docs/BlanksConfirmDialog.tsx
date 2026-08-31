/**
 * DC-103 — întrebarea de dinaintea hârtiei.
 *
 * Owner-ul: „când exportăm și poate nu e completat fiecare câmp, trebuie să apară un pop-up: chiar
 * vrei să faci actul așa, că n-ai completat detaliile astea?". Deci nu un refuz și nici o tăcere —
 * o listă concretă și două butoane. Pe hârtie, câmpurile rămase apar ca rânduri de completat cu
 * pixul, deci alegerea „continui oricum" e legitimă și trebuie să fie ușoară.
 */
import { AlertTriangle, X } from "lucide-react";

export interface BlanksConfirmDialogProps {
  title: string;
  intro: string;
  fields: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BlanksConfirmDialog({
  title,
  intro,
  fields,
  confirmLabel,
  onConfirm,
  onCancel,
}: BlanksConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="blanks-dialog-title"
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <h2 id="blanks-dialog-title" className="text-lg font-semibold text-foreground">
                {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Închide"
            className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
          {fields.map((field) => (
            <li key={field} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-muted-foreground">
                •
              </span>
              {field}
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">
          Câmpurile necompletate apar în document ca rânduri de completat cu pixul, niciodată ca
          etichete tehnice.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            Completez acum
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="touch-target rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
