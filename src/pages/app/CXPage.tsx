/**
 * CX-702 — /app/cx
 *
 * Customer Experience module: cohort board with Active/Viitoare/Trecute tabs,
 * horizontal cohort selector, and a progress header for the selected cohort.
 * Participants (CX-703), Export CSV (CX-704), and Break-even (CX-705) come next.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  BookOpen,
  Download,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listCohorts, type Cohort } from "@/lib/api/cohorts";
import { CohortTabs } from "@/components/modules/cx/CohortTabs";
import { CohortProgress } from "@/components/modules/cx/CohortProgress";
import { cn } from "@/lib/utils";

/** Format "YYYY-MM-DD" → "d Mon YYYY" */
function fmtDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-").map(Number);
  const MON = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd} ${MON[(mm ?? 1) - 1]} ${yyyy}`;
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

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { cohorts: c } = await listCohorts();
      setCohorts(c);
      // Auto-select first cohort in the active tab if nothing selected
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

  // When tab changes, auto-select first cohort in that tab
  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    const first = cohorts.filter((c) => c.category === tab)[0];
    setSelectedId(first?.id ?? null);
  }

  const selectedCohort = cohorts.find((c) => c.id === selectedId) ?? null;

  return (
    <AppShell
      pageTitle="Customer Experience (CX)"
      pageDescription="Urmărire cohorte cursanți pe ediții"
      actions={
        <button
          disabled
          aria-disabled="true"
          title="Export CSV — disponibil în CX-704"
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
            "border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      }
    >
      {/* Loading skeleton */}
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

      {/* Error state */}
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

      {/* Main content */}
      {!loading && !error && (
        <div className="space-y-6">
          {/* Tab bar + cohort selector */}
          <CohortTabs
            cohorts={cohorts}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            selectedCohortId={selectedId}
            onCohortSelect={setSelectedId}
          />

          {/* Cohort header + progress widget */}
          {selectedCohort ? (
            <CohortHeader cohort={selectedCohort} />
          ) : (
            cohorts.length > 0 && (
              <div className="text-sm text-muted-foreground py-4" role="status">
                Selectează o cohortă din lista de mai sus.
              </div>
            )
          )}

          {/* Placeholder for CX-703 participants */}
          {selectedCohort && (
            <div
              className="rounded-xl border border-dashed border-border p-8 text-center"
              aria-label="Secțiune participanți — vine în CX-703"
            >
              <BookOpen
                className="h-8 w-8 mx-auto mb-3 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-muted-foreground">
                Participanții cohortei vor apărea aici (CX-703)
              </p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

// ─── Cohort header ────────────────────────────────────────────────────────────

interface CohortHeaderProps {
  cohort: Cohort;
}

function CohortHeader({ cohort }: CohortHeaderProps) {
  const startLabel = fmtDate(cohort.startDate);
  const endLabel = fmtDate(cohort.endDate);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Title row */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">{cohort.label}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {startLabel} → {endLabel}
          {cohort.isOnline && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">
              Online
            </span>
          )}
        </p>
      </div>

      {/* Progress widget */}
      <CohortProgress progress={cohort.progress} />

      {/* Meta row */}
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
    </div>
  );
}
