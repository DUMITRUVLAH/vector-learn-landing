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
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listCohorts, type Cohort } from "@/lib/api/cohorts";
import { CohortTabs } from "@/components/modules/cx/CohortTabs";
import { CohortProgress } from "@/components/modules/cx/CohortProgress";
import { CohortStats } from "@/components/modules/cx/CohortStats";
import { ParticipantTable } from "@/components/modules/cx/ParticipantTable";
import { useCohortParticipants } from "@/hooks/useCohortParticipants";
import type { AddParticipantPayload, CohortParticipant } from "@/lib/api/cohortParticipants";
import { downloadCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";

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
      pageTitle="Customer Experience (CX)"
      pageDescription="Urmărire cohorte cursanți pe ediții"
      actions={
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
          Export CSV
        </button>
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
                onParticipantsChange={(ps) => {
                  participantsRef.current = ps;
                }}
              />
            </>
          ) : (
            cohorts.length > 0 && (
              <div className="text-sm text-muted-foreground py-4" role="status">
                Selectează o cohortă din lista de mai sus.
              </div>
            )
          )}
        </div>
      )}
    </AppShell>
  );
}

// ─── Cohort header ────────────────────────────────────────────────────────────

function CohortHeader({ cohort }: { cohort: Cohort }) {
  const startLabel = fmtDate(cohort.startDate);
  const endLabel = fmtDate(cohort.endDate);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
    </div>
  );
}

// ─── Participants section ─────────────────────────────────────────────────────

interface ParticipantsSectionProps {
  cohortId: string;
  onParticipantsChange: (participants: CohortParticipant[]) => void;
}

function ParticipantsSection({ cohortId, onParticipantsChange }: ParticipantsSectionProps) {
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

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <CohortStats stats={stats} />

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
