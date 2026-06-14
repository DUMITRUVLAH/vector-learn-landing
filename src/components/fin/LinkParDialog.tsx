/**
 * APPROVAL-002: LinkParDialog
 *
 * A dialog for linking an approved PAR to a payment that requires authorization.
 * Fetches the list of approved PARs, lets the user pick one, and calls
 * POST /api/payments/:id/link-par.
 *
 * Design: Vector 365 semantic tokens only. Dark mode: covered by token system.
 * WCAG AA: focus rings, aria-modal, aria-labels, min 44px touch targets.
 */
import { useState, useEffect, useId } from "react";
import { Search, X, Link2, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { listPar } from "@/lib/api/par";
import { linkParToPayment } from "@/lib/api/payments";
import type { ParRequest } from "@/lib/api/par";

interface LinkParDialogProps {
  paymentId: string;
  paymentAmountCents: number;
  /** Called after the PAR was successfully linked */
  onLinked: (parRequestId: string) => void;
  onClose: () => void;
}

export function LinkParDialog({
  paymentId,
  paymentAmountCents,
  onLinked,
  onClose,
}: LinkParDialogProps) {
  const titleId = useId();
  const searchId = useId();

  const [approvedPars, setApprovedPars] = useState<ParRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load approved PARs on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPar({ status: "approved" })
      .then(({ requests }) => {
        if (!cancelled) setApprovedPars(requests);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Eroare la încărcare");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = approvedPars.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.requestNo.toLowerCase().includes(q) ||
      (p.endUse ?? "").toLowerCase().includes(q) ||
      (p.payeeName ?? "").toLowerCase().includes(q)
    );
  });

  const handleLink = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await linkParToPayment(paymentId, selected);
      onLinked(selected);
      onClose();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Nu pot lega PAR-ul. Încearcă din nou."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const amountMdl = (paymentAmountCents / 100).toLocaleString("ro-MD");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="border-b border-border px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 id={titleId} className="text-base font-bold">
              Leagă PAR aprobat
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plată de {amountMdl} MDL necesită autorizare PAR
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide dialogul"
            className="rounded-md p-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2 shrink-0">
          <label htmlFor={searchId} className="sr-only">
            Caută PAR aprobat
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <input
              id={searchId}
              type="search"
              placeholder="Caută după număr, titlu sau furnizor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1.5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden />
              <span>Se încarcă PAR-urile aprobate…</span>
            </div>
          ) : loadError ? (
            <div className="py-10 text-center text-sm text-destructive">{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search ? "Niciun PAR nu corespunde căutării." : "Nu există PAR-uri aprobate."}
            </div>
          ) : (
            filtered.map((par) => {
              const isSelected = selected === par.id;
              return (
                <button
                  key={par.id}
                  type="button"
                  onClick={() => setSelected(par.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground">{par.requestNo}</span>
                      {par.endUse && (
                        <span className="ml-2 text-muted-foreground truncate">{par.endUse}</span>
                      )}
                    </div>
                    {isSelected && (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-primary mt-0.5"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {par.payeeName && <span>{par.payeeName}</span>}
                    {par.totalEstimatedCents > 0 && (
                      <span>
                        {(par.totalEstimatedCents / 100).toLocaleString("ro-MD")} {par.currency}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 shrink-0 space-y-2">
          {submitError && (
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
            >
              Anulează
            </button>
            <button
              type="button"
              onClick={handleLink}
              disabled={!selected || submitting}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden />
              )}
              Leagă PAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LinkParDialog;
