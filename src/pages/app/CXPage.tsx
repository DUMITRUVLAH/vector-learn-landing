/**
 * CX-702/703/704 — /app/cx
 *
 * Customer Experience module: cohort board with Active/Viitoare/Trecute tabs,
 * horizontal cohort selector, progress header, and 3 participant tables
 * (Înscriși / Gratuit / Cont de Plată) with stats bar.
 *
 * CX-704: Export CSV button wired to downloadCsv util.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  AlertCircle,
  Download,
  Plus,
  X,
  MessageSquare,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listCohorts, createCohort, type Cohort } from "@/lib/api/cohorts";
import { listCourses, type Course } from "@/lib/api/courses";
import { listFeedbackForms, sendFeedbackToCohort, type FeedbackForm } from "@/lib/api/feedback";
import { CohortTabs } from "@/components/modules/cx/CohortTabs";
import { CohortProgress } from "@/components/modules/cx/CohortProgress";
import { CohortStats, type BreakevenData } from "@/components/modules/cx/CohortStats";
import { ParticipantTable } from "@/components/modules/cx/ParticipantTable";
import { useCohortParticipants } from "@/hooks/useCohortParticipants";
import type { AddParticipantPayload, CohortParticipant } from "@/lib/api/cohortParticipants";
import { downloadCsv } from "@/lib/exportCsv";
import { computeCohortBreakeven } from "@/lib/cohortBreakeven";
import { cn } from "@/lib/utils";

// ─── Break-even computation (client-side, CX-705) ────────────────────────────

interface CohortCosts {
  mentorCostCents: number;
  roomCostCents: number;
  marketingCostCents: number;
}

function computeBreakeven(
  incasatCents: number,
  expectedCents: number,
  costs: CohortCosts
): BreakevenData {
  const result = computeCohortBreakeven({
    incasatCents,
    expectedCents,
    mentorCostCents: costs.mentorCostCents,
    roomCostCents: costs.roomCostCents,
    marketingCostCents: costs.marketingCostCents,
  });
  return {
    projectedProfitCents: result.projectedProfitCents,
    isProfit: result.isProfit,
  };
}

/** Format "YYYY-MM-DD" → "d Mon YYYY" */
function fmtDate(iso: string): string {
  const parts = iso.split("-").map(Number);
  const yyyy = parts[0] ?? 2026;
  const mm = parts[1] ?? 1;
  const dd = parts[2] ?? 1;
  const MON = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd} ${MON[mm - 1]} ${yyyy}`;
}

type TabKey = "active" | "upcoming" | "past";

// ─── Main page ────────────────────────────────────────────────────────────────

export function CXPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // CX: create-cohort modal
  const [showCreate, setShowCreate] = useState(false);

  // Ref to hold the latest participants list for the selected cohort.
  // Updated by ParticipantsSection via onParticipantsChange callback.
  const participantsRef = useRef<CohortParticipant[]>([]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { cohorts: c } = await listCohorts();
      setCohorts(c);
      const activeOnes = c.filter((x) => x.category === "active");
      if (activeOnes.length > 0) {
        setSelectedId(activeOnes[0].id);
      } else {
        const upcomingOnes = c.filter((x) => x.category === "upcoming");
        if (upcomingOnes.length > 0) {
          setActiveTab("upcoming");
          setSelectedId(upcomingOnes[0].id);
        }
      }
    } catch {
      setError("Nu s-au putut încărca cohortele. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") load();
  }, [sessionStatus, load]);

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    const first = cohorts.filter((c) => c.category === tab)[0];
    setSelectedId(first?.id ?? null);
  }

  // After creating a cohort: reload, jump to its tab, and select it.
  async function handleCohortCreated(created: Cohort) {
    setShowCreate(false);
    await load();
    setActiveTab(created.category);
    setSelectedId(created.id);
  }

  const selectedCohort = cohorts.find((c) => c.id === selectedId) ?? null;

  function handleExport() {
    if (!selectedCohort) return;
    downloadCsv({
      courseName: selectedCohort.label,
      editionLabel: fmtDate(selectedCohort.startDate),
      participants: participantsRef.current,
    });
  }

  return (
    <AppShell
      pageTitle="Grupe"
      pageDescription="Urmărire grupe / clase de cursanți pe ediții"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!selectedCohort}
            aria-disabled={!selectedCohort}
            title={
              selectedCohort
                ? `Descarcă CSV pentru ${selectedCohort.label}`
                : "Selectează o cohortă pentru a exporta"
            }
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
              "border border-border transition-colors",
              selectedCohort
                ? "text-foreground bg-card hover:bg-muted cursor-pointer"
                : "text-muted-foreground opacity-50 cursor-not-allowed"
            )}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Creează o grupă / ediție nouă"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Grupă nouă
          </button>
        </div>
      }
    >
      {loading && (
        <div
          className="flex items-center justify-center py-16 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
          Se încarcă cohortele…
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-sm">{error}</p>
            <button
              onClick={load}
              className="mt-1 text-xs underline underline-offset-2 hover:no-underline min-h-[44px]"
            >
              Reîncearcă
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <CohortTabs
            cohorts={cohorts}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            selectedCohortId={selectedId}
            onCohortSelect={setSelectedId}
          />

          {selectedCohort ? (
            <>
              <CohortHeader cohort={selectedCohort} />
              <ParticipantsSection
                cohortId={selectedCohort.id}
                cohortCosts={{
                  mentorCostCents: selectedCohort.mentorCostCents,
                  roomCostCents: selectedCohort.roomCostCents,
                  marketingCostCents: selectedCohort.marketingCostCents,
                }}
                onParticipantsChange={(ps) => {
                  participantsRef.current = ps;
                }}
              />
            </>
          ) : cohorts.length > 0 ? (
            <div className="text-sm text-muted-foreground py-4" role="status">
              Selectează o cohortă din lista de mai sus.
            </div>
          ) : (
            /* No cohorts at all → make creating the first one the obvious action */
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Nu ai nicio grupă încă. Creează prima ediție pentru a începe să înscrii cursanți și să trimiți feedback.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Creează prima grupă
              </button>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateCohortModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCohortCreated}
        />
      )}
    </AppShell>
  );
}

// ─── Create cohort / edition modal ────────────────────────────────────────────

const WEEK_DAYS: { value: string; label: string }[] = [
  { value: "Monday", label: "Lu" },
  { value: "Tuesday", label: "Ma" },
  { value: "Wednesday", label: "Mi" },
  { value: "Thursday", label: "Jo" },
  { value: "Friday", label: "Vi" },
  { value: "Saturday", label: "Sâ" },
  { value: "Sunday", label: "Du" },
];

function CreateCohortModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Cohort) => Promise<void> | void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courseId, setCourseId] = useState("");
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [totalHours, setTotalHours] = useState(32);
  const [hoursPerSession, setHoursPerSession] = useState(2);
  const [isOnline, setIsOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCourses({ includeArchived: false })
      .then((res) => setCourses(res.items))
      .catch(() => setError("Nu pot încărca cursurile."))
      .finally(() => setCoursesLoading(false));
  }, []);

  // Pre-fill a sensible label from the chosen course + start month.
  useEffect(() => {
    if (!courseId || label.trim()) return;
    const course = courses.find((c) => c.id === courseId);
    if (course && startDate) {
      const MON = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
      const m = Number(startDate.split("-")[1] ?? 1);
      setLabel(`${course.name} — Ediția ${MON[m - 1]} ${startDate.split("-")[0]}`);
    }
  }, [courseId, startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = courseId && label.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { cohort } = await createCohort({
        courseId,
        label: label.trim(),
        startDate,
        totalHours,
        hoursPerSession,
        scheduleDays: scheduleDays.length > 0 ? scheduleDays : null,
        isOnline,
      });
      await onCreated(cohort);
    } catch {
      setError("Nu am putut crea grupa. Verifică datele și încearcă din nou.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-cohort-title"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="create-cohort-title" className="text-base font-bold">Grupă / ediție nouă</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Course */}
          <div>
            <label htmlFor="cohort-course" className="block text-xs font-semibold text-muted-foreground mb-1">Curs *</label>
            <select
              id="cohort-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              disabled={coursesLoading}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{coursesLoading ? "Se încarcă cursurile…" : "— Alege cursul —"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!coursesLoading && courses.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nu ai cursuri.{" "}
                <a href="#/app/courses" className="text-primary underline">Adaugă un curs întâi.</a>
              </p>
            )}
          </div>

          {/* Label */}
          <div>
            <label htmlFor="cohort-label" className="block text-xs font-semibold text-muted-foreground mb-1">Nume ediție *</label>
            <input
              id="cohort-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Spaniolă A2 — Ediția Mai 2026"
              required
              maxLength={300}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Start date */}
          <div>
            <label htmlFor="cohort-start" className="block text-xs font-semibold text-muted-foreground mb-1">Data de început *</label>
            <input
              id="cohort-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Schedule days */}
          <div>
            <span className="block text-xs font-semibold text-muted-foreground mb-1">Zile de curs</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zile de curs">
              {WEEK_DAYS.map((d) => {
                const active = scheduleDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={active}
                    aria-label={d.value}
                    onClick={() =>
                      setScheduleDays((prev) =>
                        active ? prev.filter((x) => x !== d.value) : [...prev, d.value]
                      )
                    }
                    className={cn(
                      "min-h-[40px] min-w-[40px] rounded-md border text-xs font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:border-primary"
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cohort-total-hours" className="block text-xs font-semibold text-muted-foreground mb-1">Total ore</label>
              <input
                id="cohort-total-hours"
                type="number"
                min={1}
                value={totalHours}
                onChange={(e) => setTotalHours(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="cohort-hps" className="block text-xs font-semibold text-muted-foreground mb-1">Ore/ședință</label>
              <input
                id="cohort-hps"
                type="number"
                min={1}
                value={hoursPerSession}
                onChange={(e) => setHoursPerSession(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Online */}
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isOnline}
              onChange={(e) => setIsOnline(e.target.checked)}
              className="h-4 w-4"
            />
            Grupă online
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Creează grupa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cohort header ────────────────────────────────────────────────────────────

function CohortHeader({ cohort }: { cohort: Cohort }) {
  const startLabel = fmtDate(cohort.startDate);
  const endLabel = fmtDate(cohort.endDate);
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
       <div>
        <h2 className="text-lg font-semibold text-foreground">{cohort.label}</h2>
        {/* INTEG-203: show courseName with link to courses page */}
        {cohort.courseName && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Curs:{" "}
            <a
              href="#/app/courses"
              className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={`Navighează la cursul ${cohort.courseName}`}
            >
              {cohort.courseName}
            </a>
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-0.5">
          {startLabel} → {endLabel}
          {cohort.isOnline && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">
              Online
            </span>
          )}
        </p>
       </div>
        {/* CX: send a feedback form to the whole cohort in one click */}
        <button
          type="button"
          onClick={() => setShowFeedback(true)}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Trimite feedback întregii grupe"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Trimite feedback grupei</span>
        </button>
      </div>
      <CohortProgress progress={cohort.progress} />
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{cohort.totalHours}h</span> total
        </span>
        <span>
          <span className="font-medium text-foreground">{cohort.hoursPerSession}h</span>/sesiune
        </span>
        {cohort.scheduleDays && cohort.scheduleDays.length > 0 && (
          <span>{cohort.scheduleDays.join(", ")}</span>
        )}
      </div>

      {showFeedback && (
        <SendCohortFeedbackModal
          cohort={cohort}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}

// ─── Send feedback to whole cohort modal ──────────────────────────────────────

function SendCohortFeedbackModal({ cohort, onClose }: { cohort: Cohort; onClose: () => void }) {
  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formId, setFormId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; total: number; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFeedbackForms()
      .then((res) => {
        const active = res.forms.filter((f) => f.isActive);
        setForms(active);
        if (active[0]) setFormId(active[0].id);
      })
      .catch(() => setError("Nu pot încărca formularele de feedback."))
      .finally(() => setFormsLoading(false));
  }, []);

  async function handleSend() {
    if (!formId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendFeedbackToCohort(formId, cohort.id);
      setResult(res);
    } catch {
      setError("Nu am putut trimite feedback-ul. Încearcă din nou.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-feedback-title"
      onClick={onClose}
    >
      <div className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="send-feedback-title" className="text-base font-bold">Trimite feedback grupei</h3>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Grupa: <span className="font-semibold text-foreground">{cohort.label}</span>
          </p>

          {result ? (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm" role="status">
              <div className="flex items-center gap-2 font-semibold text-success">
                <Check className="h-4 w-4" aria-hidden="true" />
                Feedback trimis
              </div>
              <p className="mt-1 text-foreground">
                {result.created} invitați{result.created === 1 ? "e" : "i"} create
                {result.skipped > 0 && `, ${result.skipped} deja invitați`}.
              </p>
              {result.reason === "no_linked_students" && (
                <p className="mt-1 text-muted-foreground text-xs">
                  Grupa nu are participanți proveniți din CRM (cu fișă de elev). Adaugă elevi convertiți din leaduri.
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="feedback-form" className="block text-xs font-semibold text-muted-foreground mb-1">Formular feedback</label>
                <select
                  id="feedback-form"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  disabled={formsLoading}
                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{formsLoading ? "Se încarcă…" : "— Alege formularul —"}</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                {!formsLoading && forms.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nu ai formulare active.{" "}
                    <a href="#/app/feedback" className="text-primary underline">Creează unul.</a>
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Se trimite o invitație fiecărui participant din grupă care are fișă de elev (provenit din CRM).
              </p>
            </>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            {result ? "Închide" : "Anulează"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!formId || sending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Trimite
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Participants section ─────────────────────────────────────────────────────

interface ParticipantsSectionProps {
  cohortId: string;
  cohortCosts: CohortCosts;
  onParticipantsChange: (participants: CohortParticipant[]) => void;
}

function ParticipantsSection({ cohortId, cohortCosts, onParticipantsChange }: ParticipantsSectionProps) {
  const {
    participants,
    stats,
    loading,
    error,
    handleAdd,
    handleToggleWhatsapp,
    handleDelete,
  } = useCohortParticipants(cohortId);

  // Sync participants to parent ref whenever they change
  useEffect(() => {
    onParticipantsChange(participants);
  }, [participants, onParticipantsChange]);

  const enrolled = participants.filter(
    (p) => p.paymentStatus === "full" || p.paymentStatus === "half"
  );
  const free = participants.filter((p) => p.paymentStatus === "free");
  const pending = participants.filter(
    (p) => p.paymentStatus === "pending" || p.paymentStatus === null
  );

  async function handleAddEnrolled(data: {
    fullName: string;
    email?: string;
    phone?: string;
  }) {
    const payload: AddParticipantPayload = {
      ...data,
      paymentStatus: "pending",
      amountCents: 0,
    };
    await handleAdd(payload);
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 text-muted-foreground text-sm py-4"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Se încarcă participanții…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-sm text-destructive">
        {error}
      </div>
    );
  }

  const breakeven = computeBreakeven(
    stats.incasatCents,
    stats.expectedCents,
    cohortCosts
  );

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <CohortStats stats={stats} breakeven={breakeven} />

      {/* Table 1: Înscriși (full + half) */}
      <ParticipantTable
        title="Cursanți Înscriși"
        participants={enrolled}
        cohortId={cohortId}
        onToggleWhatsapp={handleToggleWhatsapp}
        onDelete={handleDelete}
        showAddRow
        onAdd={handleAddEnrolled}
      />

      {/* Table 2: Gratuit */}
      <ParticipantTable
        title="Gratuit"
        participants={free}
        cohortId={cohortId}
        onToggleWhatsapp={handleToggleWhatsapp}
        onDelete={handleDelete}
      />

      {/* Table 3: Cont de Plată */}
      <ParticipantTable
        title="Cont de Plată"
        participants={pending}
        cohortId={cohortId}
        onToggleWhatsapp={handleToggleWhatsapp}
        onDelete={handleDelete}
      />
    </div>
  );
}
