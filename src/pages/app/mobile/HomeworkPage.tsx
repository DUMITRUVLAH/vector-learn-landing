/**
 * MOB-102: Mobile homework list page
 * Route: /m/homework
 * Shows homework sorted by deadline with "overdue only" filter.
 * Students can submit text or image responses.
 */
import { useEffect, useState, useCallback } from "react";
import { BookOpen, ChevronLeft, CheckCircle, Clock, AlertCircle, Upload, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HomeworkItem {
  id: string;
  body: string;
  deadline: string;
  status: "pending" | "submitted" | "graded";
  lessonId: string;
  createdAt: string;
}

interface HomeworkListResponse {
  homework: HomeworkItem[];
}

function isOverdue(deadline: string): boolean {
  return new Date(deadline).getTime() < Date.now();
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  return d.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_META: Record<HomeworkItem["status"], { label: string; icon: React.ReactNode; cls: string }> = {
  pending: {
    label: "În așteptare",
    icon: <Clock className="h-3.5 w-3.5" />,
    cls: "text-warning",
  },
  submitted: {
    label: "Trimis",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    cls: "text-success",
  },
  graded: {
    label: "Notat",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    cls: "text-primary",
  },
};

export function HomeworkPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [items, setItems] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null); // homework id being submitted
  const [submitText, setSubmitText] = useState("");
  const [activeSubmit, setActiveSubmit] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadHomework = useCallback(() => {
    if (sessionStatus !== "authenticated") return;
    setLoading(true);
    const url = overdueOnly ? "/api/m/homework?filter=overdue" : "/api/m/homework";
    api<HomeworkListResponse>(url)
      .then((d) => { setItems(d.homework); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionStatus, overdueOnly]);

  useEffect(() => {
    loadHomework();
  }, [loadHomework]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = async (id: string) => {
    if (!submitText.trim()) return;
    setSubmitting(id);
    try {
      await api(`/api/m/homework/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ text_body: submitText }),
      });
      setToast("Tema a fost trimisă!");
      setActiveSubmit(null);
      setSubmitText("");
      loadHomework();
    } catch {
      setToast("Eroare la trimitere. Încearcă din nou.");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-card border border-border px-4 py-2.5 text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/m/dashboard" className="text-muted-foreground hover:text-foreground" aria-label="Înapoi">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold flex-1">Teme</h1>
        <BookOpen className="h-4 w-4 text-muted-foreground" />
      </header>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        <button
          onClick={() => setOverdueOnly(false)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            !overdueOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          Toate
        </button>
        <button
          onClick={() => setOverdueOnly(true)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1",
            overdueOnly ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          <AlertCircle className="h-3 w-3" />
          Doar restante
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} teme</span>
      </div>

      {/* List */}
      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {overdueOnly ? "Nicio temă restantă!" : "Nicio temă momentan"}
            </p>
          </div>
        ) : (
          items.map((item) => {
            const meta = STATUS_META[item.status];
            const overdue = item.status === "pending" && isOverdue(item.deadline);
            const isActive = activeSubmit === item.id;

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card p-4 space-y-2",
                  overdue ? "border-destructive/40" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug flex-1">{item.body}</p>
                  <span className={cn("flex items-center gap-1 text-xs shrink-0", meta.cls)}>
                    {meta.icon}
                    {meta.label}
                  </span>
                </div>

                <p className={cn("text-xs flex items-center gap-1", overdue ? "text-destructive" : "text-muted-foreground")}>
                  <Clock className="h-3 w-3" />
                  {overdue ? "Expirat: " : "Termen: "}
                  {formatDeadline(item.deadline)}
                </p>

                {/* Submit section */}
                {item.status === "pending" && (
                  <>
                    {!isActive ? (
                      <button
                        onClick={() => { setActiveSubmit(item.id); setSubmitText(""); }}
                        className="flex items-center gap-1.5 text-xs text-primary font-medium mt-1"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Trimite tema
                      </button>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={submitText}
                          onChange={(e) => setSubmitText(e.target.value)}
                          placeholder="Scrie răspunsul tău..."
                          rows={3}
                          aria-label="Răspuns temă"
                          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSubmit(item.id)}
                            disabled={!submitText.trim() || submitting === item.id}
                            className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium py-2 disabled:opacity-50 transition-opacity"
                          >
                            {submitting === item.id ? "Se trimite..." : "Trimite"}
                          </button>
                          <button
                            onClick={() => setActiveSubmit(null)}
                            className="rounded-lg border border-border text-xs font-medium py-2 px-3 text-muted-foreground"
                          >
                            Anulează
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
