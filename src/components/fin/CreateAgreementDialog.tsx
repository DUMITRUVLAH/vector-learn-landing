/**
 * AGREEMENT-003: CreateAgreementDialog
 * Modal dialog for creating a new fin_agreement.
 * Design system: Vector 365 tokens — zero hardcoded hex.
 * WCAG AA: aria-modal, focus management, labeled inputs.
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { createAgreement, type AgreementStatus } from "@/lib/api/finAgreements";
import { ApiError } from "@/lib/api";

interface Party {
  id: string;
  name: string;
}

interface CreateAgreementDialogProps {
  parties: Party[];
  onCreated: () => void;
  onClose: () => void;
}

export function CreateAgreementDialog({
  parties,
  onCreated,
  onClose,
}: CreateAgreementDialogProps) {
  const [title, setTitle] = useState("");
  const [partyId, setPartyId] = useState("");
  const [status, setStatus] = useState<AgreementStatus>("draft");
  const [currency, setCurrency] = useState("MDL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // ESC closes dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createAgreement({
        title: title.trim(),
        partyId: partyId || null,
        status,
        currency,
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Eroare la crearea contractului."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agreement-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-6 shadow-xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <h2
            id="create-agreement-title"
            className="text-base font-semibold text-foreground"
          >
            Contract nou
          </h2>
          <button
            onClick={onClose}
            aria-label="Închide dialogul"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p
              className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="agr-title"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Titlu contract *
            </label>
            <input
              ref={titleRef}
              id="agr-title"
              type="text"
              required
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Contract servicii contabilitate 2026"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Party */}
          <div>
            <label
              htmlFor="agr-party"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Partener
            </label>
            <select
              id="agr-party"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Selectează partener —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status + Currency row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="agr-status"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="agr-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AgreementStatus)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="draft">Ciornă</option>
                <option value="active">Activ</option>
                <option value="paused">Pauzat</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="agr-currency"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Valută
              </label>
              <select
                id="agr-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="MDL">MDL</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="RON">RON</option>
              </select>
            </div>
          </div>

          {/* Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="agr-start"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Data start
              </label>
              <input
                id="agr-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="agr-end"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Data end
              </label>
              <input
                id="agr-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="agr-notes"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Note
            </label>
            <textarea
              id="agr-notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observații, condiții speciale..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[40px] items-center rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Creează contract
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
