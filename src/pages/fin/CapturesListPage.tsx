/**
 * CAPTURE-003: /app/fin/captures
 *
 * Lista capturilor OCR AI cu status badge per rând.
 * Permite navigarea la pagina de confirmare individuală.
 *
 * Design: Vector 365 tokens, light + dark, WCAG AA.
 */
import { useState, useEffect } from "react";
import {
  FileText,
  Loader2,
  Upload,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import {
  getCaptures,
  CAPTURE_STATUS_LABELS,
  type FinCapture,
  type FinCaptureStatus,
} from "@/lib/api/finCaptures";
import { cn } from "@/lib/utils";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FinCaptureStatus }) {
  const styles: Record<FinCaptureStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    extracted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", styles[status])}>
      {CAPTURE_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CapturesListPage() {
  const { navigate } = useRouter();
  const [captures, setCaptures] = useState<FinCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCaptures()
      .then((r) => setCaptures(r.captures))
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell pageTitle="Documente AI (CAPTURE)">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Documente AI (CAPTURE)
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Bonuri și facturi procesate prin OCR. Confirmați câmpurile extrase.
            </p>
          </div>
          <button
            onClick={() => navigate("/app/fin/captures/new")}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Încarcă document
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && captures.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nicio captură încă</p>
            <p className="text-xs text-muted-foreground">
              Încărcați un bon sau o factură pentru a porni extracția AI.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && captures.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fișier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Data
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acțiune
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {captures.map((capture) => (
                  <tr
                    key={capture.id}
                    className="bg-card hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="max-w-[200px] truncate font-medium text-foreground">
                          {capture.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={capture.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(capture.createdAt).toLocaleDateString("ro-MD", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {capture.status === "extracted" && (
                        <button
                          onClick={() => navigate(`/app/fin/captures/${capture.id}`)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Confirmă
                        </button>
                      )}
                      {capture.status === "confirmed" && (
                        <button
                          onClick={() => navigate(`/app/fin/captures/${capture.id}`)}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Detalii
                        </button>
                      )}
                      {(capture.status === "pending" || capture.status === "processing") && (
                        <span className="text-xs text-muted-foreground">Se procesează...</span>
                      )}
                      {capture.status === "failed" && (
                        <button
                          onClick={() => navigate(`/app/fin/captures/${capture.id}`)}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5"
                        >
                          Eroare
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
