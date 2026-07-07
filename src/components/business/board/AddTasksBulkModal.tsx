/**
 * TB-001: Modal „Adaugă în masă" — lipești N linii, fiecare devine un task plan-first
 * (doar titlu; listă/dată/rol se completează ulterior în Tabel). Un singur POST /bulk.
 */
import { useState, useEffect, useRef } from "react";
import { X, ListPlus, Loader2, AlertCircle } from "lucide-react";
import { createTasksBulk } from "@/lib/api/boardTasks";

interface AddTasksBulkModalProps {
  open: boolean;
  boardId: string;
  onClose: () => void;
  onCreated: (count: number) => void;
}

export function AddTasksBulkModal({ open, boardId, onClose, onCreated }: AddTasksBulkModalProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      // Focus după ce modalul se montează.
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [open]);

  // Escape închide modalul (convenția dialogurilor din repo — vezi CreateAgreementDialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const titles = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (titles.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createTasksBulk({ boardId, titles });
      onCreated(res.created);
    } catch {
      setError("Nu am putut crea taskurile. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tb-bulk-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="tb-bulk-title" className="text-lg font-semibold text-foreground">
              Adaugă taskuri în masă
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Un task pe linie. Se creează fără dată și fără coloană — le programezi apoi în Tabel.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div>
          <label htmlFor="tb-bulk-text" className="sr-only">
            Taskuri, câte unul pe linie
          </label>
          <textarea
            id="tb-bulk-text"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"Landing page ediția nouă\nCampanie ads pornită\nConfirmă trainerii\n…"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {titles.length} task{titles.length === 1 ? "" : "uri"} de creat (max. 200)
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            Anulează
          </button>
          <button
            type="submit"
            disabled={saving || titles.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            Creează {titles.length > 0 ? titles.length : ""} taskuri
          </button>
        </div>
      </form>
    </div>
  );
}
