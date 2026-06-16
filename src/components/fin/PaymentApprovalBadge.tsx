/**
 * APPROVAL-001: Payment approval status badge
 *
 * Shows whether a payment has a linked PAR and its approval status.
 * Used on payment detail pages to communicate the approval gate to the user.
 *
 * Design tokens: bg-*, text-*, border-* from Vector 365.
 * Dark mode: handled by semantic color tokens.
 * WCAG AA: text contrast via semantic tokens; badge min-size 44px touch target N/A (non-interactive display).
 */
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, XCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";

interface ParApprovalStatus {
  id: string;
  status: string;
  request_no: string;
}

interface PaymentApprovalBadgeProps {
  parRequestId: string | null;
  paymentAmountCents: number;
  /** Default 5000 MDL. Amounts >= threshold require PAR approval before paying. */
  thresholdMdl?: number;
}

const DEFAULT_THRESHOLD_MDL = 5000;

export function PaymentApprovalBadge({
  parRequestId,
  paymentAmountCents,
  thresholdMdl = DEFAULT_THRESHOLD_MDL,
}: PaymentApprovalBadgeProps) {
  const { navigate } = useRouter();
  const [parStatus, setParStatus] = useState<ParApprovalStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const amountMdl = paymentAmountCents / 100;
  const requiresApproval = amountMdl >= thresholdMdl;

  useEffect(() => {
    if (!parRequestId) return;

    let cancelled = false;
    setLoading(true);
    api<{ id: string; status: string; request_no: string }>(
      `/par/${parRequestId}`
    )
      .then((r) => {
        if (!cancelled) setParStatus(r);
      })
      .catch(() => {
        if (!cancelled) setParStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parRequestId]);

  // ── Case 1: No PAR required (amount below threshold) ──────────────────────
  if (!requiresApproval) {
    return null;
  }

  // ── Case 2: No PAR linked, but approval required ──────────────────────────
  if (!parRequestId) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
        )}
      >
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-destructive">Aprobare necesară</p>
          <p className="text-muted-foreground">
            Plățile de &ge;{thresholdMdl.toLocaleString("ro-MD")} MDL necesită un PAR
            aprobat înainte de marcare ca &ldquo;plătit&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/par/new")}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium text-primary",
              "underline-offset-2 hover:underline focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring rounded"
            )}
          >
            Creează PAR
            <ExternalLink className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // ── Case 3: PAR linked, loading status ────────────────────────────────────
  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
      >
        <Clock className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">Verificare PAR...</span>
      </div>
    );
  }

  // ── Case 4: PAR linked, status known ─────────────────────────────────────
  if (!parStatus) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
      >
        <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">
          PAR #{parRequestId.slice(0, 8)} — imposibil de verificat
        </span>
      </div>
    );
  }

  const statusConfig: Record<
    string,
    { icon: typeof CheckCircle2; className: string; label: string }
  > = {
    approved: {
      icon: CheckCircle2,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "PAR aprobat",
    },
    pending_approval: {
      icon: Clock,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "PAR în așteptare",
    },
    rejected: {
      icon: XCircle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      label: "PAR respins",
    },
    changes_requested: {
      icon: AlertCircle,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Modificări solicitate",
    },
  };

  const cfg = statusConfig[parStatus.status] ?? {
    icon: AlertCircle,
    className: "border-border bg-muted/30 text-muted-foreground",
    label: parStatus.status,
  };

  const Icon = cfg.icon;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2",
        cfg.className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <div className="text-sm">
        <span className="font-medium">{cfg.label}</span>
        <span className="ml-1 opacity-70">— {parStatus.request_no}</span>
        <button
          type="button"
          onClick={() => navigate(`/app/par/${parStatus.id}`)}
          className={cn(
            "ml-2 inline-flex items-center gap-0.5 text-xs",
            "underline-offset-2 hover:underline focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring rounded"
          )}
          aria-label={`Deschide PAR ${parStatus.request_no}`}
        >
          Vezi PAR
          <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default PaymentApprovalBadge;
