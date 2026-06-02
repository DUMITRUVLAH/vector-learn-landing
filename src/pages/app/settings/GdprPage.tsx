/**
 * SET-803 — GDPR settings page
 *
 * /app/settings/gdpr — Download DPA + configure data retention policies.
 */
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import { ShieldCheck, Download, Save, RefreshCw, AlertCircle } from "lucide-react";

interface RetentionPolicy {
  leadsLostDays: number | null;
  inactiveStudentsDays: number | null;
}

export default function GdprPage() {
  const [policy, setPolicy] = useState<RetentionPolicy>({
    leadsLostDays: null,
    inactiveStudentsDays: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<RetentionPolicy>("/api/settings/gdpr/retention");
        setPolicy(data);
      } catch {
        setError("Nu am putut încărca politicile de retenție.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  async function handleDownloadDpa() {
    try {
      const res = await fetch("/api/settings/gdpr/dpa", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("download_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "DPA-VectorLearn.html";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Nu am putut descărca DPA-ul.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/settings/gdpr/retention", {
        method: "PATCH",
        body: JSON.stringify(policy),
      });
      setToast("saved");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("error");
      setTimeout(() => setToast(null), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      pageTitle="GDPR & Conformitate"
      pageDescription="Gestionează conformitatea GDPR: descarcă DPA, configurează retenția datelor."
    >
      <div className="mx-auto max-w-2xl space-y-8">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={[
              "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
              toast === "saved"
                ? "bg-foreground text-background"
                : "bg-destructive text-destructive-foreground",
            ].join(" ")}
          >
            {toast === "saved" ? "Salvat" : "Eroare la salvare"}
          </div>
        )}

        {/* DPA Section */}
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Contract de Prelucrare a Datelor (DPA)
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Descarcă contractul DPA pre-completat cu datele organizației tale. Imprimă,
            semnează și arhivează conform GDPR art. 28.
          </p>
          <button
            type="button"
            onClick={() => void handleDownloadDpa()}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Descarcă DPA
          </button>
        </section>

        {/* Retention Section */}
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            Politici de retenție date
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Configurează ștergerea automată a datelor conform principiului minimizării
            (GDPR art. 5). Lasă gol pentru a dezactiva ștergerea automată.
          </p>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" aria-hidden />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="leads-lost-days"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Șterge lead-uri "Lost" după (zile)
                </label>
                <input
                  id="leads-lost-days"
                  type="number"
                  min={30}
                  max={3650}
                  value={policy.leadsLostDays ?? ""}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      leadsLostDays: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder="ex: 365 (gol = dezactivat)"
                  className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Minim 30 de zile. Recomandat: 365.
                </p>
              </div>

              <div>
                <label
                  htmlFor="inactive-students-days"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Anonimizează elevi inactivi după (zile)
                </label>
                <input
                  id="inactive-students-days"
                  type="number"
                  min={30}
                  max={3650}
                  value={policy.inactiveStudentsDays ?? ""}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      inactiveStudentsDays: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                  placeholder="ex: 1095 (3 ani) (gol = dezactivat)"
                  className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Conform obligației fiscale de 3 ani. Minim 30 de zile.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Salvează politicile
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
