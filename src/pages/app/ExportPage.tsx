/**
 * REP-304 — Export rapoarte CSV
 * Pagina /app/analytics/export cu butoane download
 */
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";

// ─── API base (re-use same base as api.ts) ────────────────────────────────────

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams(params).toString();
  return `/api${path}${qs ? `?${qs}` : ""}`;
}

async function downloadCsv(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ExportPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloadingPayments, setDownloadingPayments] = useState(false);
  const [downloadingStudents, setDownloadingStudents] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  if (sessionStatus === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDownloadPayments = async () => {
    setDownloadingPayments(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadCsv(
        buildUrl("/analytics/export/payments", { from: fromDate, to: toDate }),
        `payments-${today}.csv`
      );
      showToast("success", "Fișier descărcat cu succes!");
    } catch {
      showToast("error", "Eroare la export. Încearcă din nou.");
    } finally {
      setDownloadingPayments(false);
    }
  };

  const handleDownloadStudents = async () => {
    setDownloadingStudents(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadCsv(
        buildUrl("/analytics/export/students"),
        `students-${today}.csv`
      );
      showToast("success", "Fișier elevi descărcat!");
    } catch {
      showToast("error", "Eroare la export elevi.");
    } finally {
      setDownloadingStudents(false);
    }
  };

  return (
    <AppShell
      pageTitle="Export date"
      pageDescription="Descarcă date brute în format CSV pentru import în SAGA/contabilitate"
    >
      <div className="space-y-6 max-w-xl">
        {/* Payments export */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Export plăți">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">Plăți CSV</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Export plăți (id, elev, sumă, status, dată scadență, dată plată, descriere).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="from-date" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                De la
              </label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Data de start export"
              />
            </div>
            <div>
              <label htmlFor="to-date" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Până la
              </label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Data de final export"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleDownloadPayments()}
            disabled={downloadingPayments}
            data-testid="download-payments-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloadingPayments ? "Se descarcă…" : "Descarcă plăți CSV"}
          </button>
        </section>

        {/* Students export */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4" aria-label="Export elevi">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">Elevi CSV</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Export toți elevii (id, nume, status, email, telefon, date contact părinți).
          </p>

          <button
            type="button"
            onClick={() => void handleDownloadStudents()}
            disabled={downloadingStudents}
            data-testid="download-students-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloadingStudents ? "Se descarcă…" : "Descarcă elevi CSV"}
          </button>
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
