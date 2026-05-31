/**
 * FB-004 — Feedback module /app/feedback
 *
 * Manager-facing hub for course feedback forms:
 *  - Pick a form type (Feedback Inițial / Mijloc Curs / Final) → builder pre-filled.
 *  - List existing forms with sent/submitted counts.
 *  - Edit a form's questions; send it to selected students; view aggregated results.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  BarChart3,
  ClipboardList,
  Sparkles,
  Flag,
  Hourglass,
  ArrowLeft,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  listForms,
  createForm,
  deleteForm,
  STAGE_META,
  DEFAULT_QUESTIONS,
  type FeedbackFormListItem,
  type FeedbackStage,
} from "@/lib/api/feedback";
import { FeedbackFormBuilder } from "@/components/app/feedback/FeedbackFormBuilder";
import { FeedbackSendPanel } from "@/components/app/feedback/FeedbackSendPanel";
import { FeedbackResults } from "@/components/app/feedback/FeedbackResults";

const STAGE_ICON: Record<FeedbackStage, React.ComponentType<{ className?: string }>> = {
  initial: Sparkles,
  mid: Hourglass,
  final: Flag,
};

const STAGE_ORDER: FeedbackStage[] = ["initial", "mid", "final"];

type View =
  | { kind: "list" }
  | { kind: "builder"; stage: FeedbackStage; formId?: string }
  | { kind: "send"; formId: string; title: string }
  | { kind: "results"; formId: string };

export function FeedbackPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [forms, setForms] = useState<FeedbackFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listForms();
      setForms(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formsByStage = useMemo(() => {
    const map: Record<FeedbackStage, FeedbackFormListItem[]> = { initial: [], mid: [], final: [] };
    for (const f of forms) map[f.stage].push(f);
    return map;
  }, [forms]);

  const handleQuickCreate = async (stage: FeedbackStage) => {
    // One-click: create a default form for the stage, then open its builder.
    try {
      const created = await createForm({
        stage,
        title: STAGE_META[stage].label,
        description: STAGE_META[stage].description,
        questions: DEFAULT_QUESTIONS[stage],
      });
      await load();
      setView({ kind: "builder", stage, formId: created.id });
    } catch {
      setError("create_failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ștergi acest formular? Răspunsurile asociate se pierd.")) return;
    await deleteForm(id);
    await load();
  };

  if (view.kind === "builder") {
    return (
      <FeedbackFormBuilder
        stage={view.stage}
        formId={view.formId}
        onClose={() => {
          void load();
          setView({ kind: "list" });
        }}
      />
    );
  }

  if (view.kind === "send") {
    return (
      <FeedbackSendPanel
        formId={view.formId}
        formTitle={view.title}
        onClose={() => {
          void load();
          setView({ kind: "list" });
        }}
      />
    );
  }

  if (view.kind === "results") {
    return <FeedbackResults formId={view.formId} onBack={() => setView({ kind: "list" })} />;
  }

  return (
    <AppShell
      pageTitle="Feedback cursanți"
      pageDescription="Trimite formulare de feedback cursanților și analizează răspunsurile."
    >
      {/* Type picker — the 3 stage templates */}
      <section aria-labelledby="type-picker-heading" className="mb-8">
        <h2 id="type-picker-heading" className="text-lg font-semibold mb-1">
          Tipuri de formulare
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Selectează un tip de formular pentru a-l configura. Aceste șabloane se aplică la toate
          cursurile.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {STAGE_ORDER.map((stage) => {
            const Icon = STAGE_ICON[stage];
            const meta = STAGE_META[stage];
            const count = formsByStage[stage].length;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => void handleQuickCreate(stage)}
                className={cn(
                  "group flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition-colors",
                  "hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target"
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{meta.label}</span>
                  <span className="block text-sm text-muted-foreground">{meta.description}</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <Plus className="h-3.5 w-3.5" />
                  {count > 0 ? `Adaugă încă unul (${count} existente)` : "Creează formular"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Existing forms */}
      <section aria-labelledby="forms-heading">
        <h2 id="forms-heading" className="text-lg font-semibold mb-4">
          Formularele tale
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
            Nu am putut încărca formularele. Reîncearcă.
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Niciun formular încă</p>
            <p className="text-sm text-muted-foreground">
              Alege un tip de formular de mai sus pentru a începe.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {forms.map((f) => {
              const Icon = STAGE_ICON[f.stage];
              return (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="font-semibold">{f.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.stageMeta.label} · {f.questionCount}{" "}
                        {f.questionCount === 1 ? "întrebare" : "întrebări"} · trimis la {f.sentCount},
                        răspuns {f.submittedCount}
                        {!f.isActive && " · inactiv"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setView({ kind: "send", formId: f.id, title: f.title })}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 touch-target"
                    >
                      <Send className="h-4 w-4" /> Trimite
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ kind: "results", formId: f.id })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent touch-target"
                    >
                      <BarChart3 className="h-4 w-4" /> Rezultate
                    </button>
                    <button
                      type="button"
                      aria-label={`Editează ${f.title}`}
                      onClick={() => setView({ kind: "builder", stage: f.stage, formId: f.id })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-accent touch-target"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Șterge ${f.title}`}
                      onClick={() => void handleDelete(f.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10 touch-target"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

/** Small shared back button used by sub-views. */
export function BackToFeedback({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Înapoi la formulare
    </button>
  );
}
