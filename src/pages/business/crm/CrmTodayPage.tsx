/**
 * CRM — „Azi": lista de lucru zilnică a agentului — ce are de sunat, scris sau urmărit ACUM,
 * dintr-o singură privire. Portat din crm-vector (`src/lib/crm/today.ts`, `computeToday`), cu o
 * diferență de fond față de sursă: acolo fiecare agent vedea munca ÎNTREGII firme (bug real,
 * corectat aici — vezi `server/lib/crm/today.ts`) — selectorul de agent de mai jos e implicit pe
 * „eu", nu pe toată echipa.
 *
 * Patru gălețile, calculate pe server (`GET /api/crm/tasks/today`):
 *  - Restante          — taskuri deschise a căror scadență a trecut
 *  - Necontactate       — lead-uri noi, fără nicio interacțiune
 *  - Fără pas următor   — lead-uri active, fără niciun task programat
 *  - Neglijate          — lead-uri active, neatinse de peste 3 zile
 *
 * Click pe orice rând deschide fișa leadului (`LeadDetailSheet`), la fel ca din Pipeline —
 * inclusiv secțiunea „Taskuri" de-acolo, ca restanța să poată fi rezolvată fără să părăsești ecranul.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlarmClock, CalendarX, Clock, Loader2, UserPlus } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Label, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { getCrmStages, getCrmToday, type CrmStage, type CrmTodayLead, type CrmTodayResponse } from "@/lib/api/crm";
import { CRM_DEFAULT_STAGES, stageColorClasses } from "@/components/crm/constants";
import { leadTitle } from "@/components/crm/format";
import { LeadDetailSheet, type LeadDetailSheetToast } from "@/components/crm/LeadDetailSheet";

type ToastState = LeadDetailSheetToast | null;

const EMPTY_BUCKETS: CrmTodayResponse = { overdueTasks: [], uncontacted: [], noNextStep: [], neglected: [] };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Pagina principală ─────────────────────────────────────────────────────────

export function CrmTodayPage() {
  const { data: session } = useBusinessSession();
  const currentUserId = session?.user.id ?? null;
  const { members: teamMembers } = useTeamMembers();

  const [owner, setOwner] = useState("");
  const didInitOwner = useRef(false);

  const [buckets, setBuckets] = useState<CrmTodayResponse>(EMPTY_BUCKETS);
  const [stages, setStages] = useState<CrmStage[]>(CRM_DEFAULT_STAGES as CrmStage[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // Implicit, fiecare agent își vede DOAR munca lui — nu a toată firma (vezi antetul fișierului).
  // Managerii/adminii pot alege oricând „Toată echipa" din selector. Așteaptă ca echipa să se
  // încarce, ca `owner` să nu rămână pe un id care încă nu apare în `<Select>`.
  useEffect(() => {
    if (didInitOwner.current || !currentUserId || teamMembers.length === 0) return;
    didInitOwner.current = true;
    if (teamMembers.some((m) => m.id === currentUserId)) setOwner(currentUserId);
  }, [currentUserId, teamMembers]);

  const loadToday = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await getCrmToday(owner || undefined);
        setBuckets(res);
      } catch (err) {
        // La reîncărcare silențioasă (după închiderea fișei leadului), nu stricăm ecranul cu o
        // eroare — datele locale rămân cele bune, afișate deja.
        if (!silent) setError(err instanceof Error ? err.message : "Eroare la încărcarea listei de azi.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [owner]
  );

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    getCrmStages()
      .then((res) => {
        if (res.items && res.items.length > 0) setStages(res.items);
      })
      .catch(() => {
        // Rămâne CRM_DEFAULT_STAGES — fișa leadului tot funcționează, doar cu etichetele implicite.
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const totalCount =
    buckets.overdueTasks.length + buckets.uncontacted.length + buckets.noNextStep.length + buckets.neglected.length;

  return (
    <BusinessShell
      pageTitle="Azi"
      pageDescription="Ce ai de sunat, scris sau urmărit azi — dintr-o singură privire."
      actions={
        <div className="flex items-center gap-2">
          <Label htmlFor="crm-today-owner" className="shrink-0 text-sm text-muted-foreground">
            Agent
          </Label>
          <Select id="crm-today-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-[200px]">
            <option value="">Toată echipa</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.fullName} (eu)` : m.fullName}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă lista de azi..." />
          </div>
        ) : !error && totalCount === 0 ? (
          <EmptyState
            icon={<AlarmClock className="h-6 w-6" />}
            title="Nimic de făcut azi"
            description="Nicio restanță, niciun lead necontactat sau neglijat — pipeline-ul e curat."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BucketCard
              title="Restante"
              icon={<Clock className="h-4 w-4" aria-hidden="true" />}
              count={buckets.overdueTasks.length}
              emptyLabel="Niciun task restant."
            >
              <ul className="flex flex-col gap-2">
                {buckets.overdueTasks.map(({ lead, task }) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {leadTitle(lead)} · scadent {formatDate(task.dueAt!)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </BucketCard>

            <BucketCard
              title="Necontactate"
              icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
              count={buckets.uncontacted.length}
              emptyLabel="Niciun lead necontactat."
            >
              <TodayLeadList leads={buckets.uncontacted} stages={stages} onSelect={setSelectedLeadId} />
            </BucketCard>

            <BucketCard
              title="Fără pas următor"
              icon={<CalendarX className="h-4 w-4" aria-hidden="true" />}
              count={buckets.noNextStep.length}
              emptyLabel="Toate lead-urile active au un task programat."
            >
              <TodayLeadList leads={buckets.noNextStep} stages={stages} onSelect={setSelectedLeadId} />
            </BucketCard>

            <BucketCard
              title="Neglijate"
              icon={<AlarmClock className="h-4 w-4" aria-hidden="true" />}
              count={buckets.neglected.length}
              emptyLabel="Niciun lead neatins de mai mult de 3 zile."
            >
              <TodayLeadList leads={buckets.neglected} stages={stages} onSelect={setSelectedLeadId} />
            </BucketCard>
          </div>
        )}
      </div>

      <LeadDetailSheet
        leadId={selectedLeadId}
        stages={stages}
        onClose={() => {
          setSelectedLeadId(null);
          void loadToday({ silent: true });
        }}
        onChanged={() => void loadToday({ silent: true })}
        onToast={setToast}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </BusinessShell>
  );
}

// ─── Componente locale ──────────────────────────────────────────────────────────

function BucketCard({
  title,
  icon,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <Card tone="dashboard">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <Badge variant={count > 0 ? "warning" : "secondary"}>{count}</Badge>
      </CardHeader>
      <CardContent>
        {count === 0 ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : children}
      </CardContent>
    </Card>
  );
}

function TodayLeadList({
  leads,
  stages,
  onSelect,
}: {
  leads: CrmTodayLead[];
  stages: readonly CrmStage[];
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {leads.map((lead) => {
        const stage = stages.find((s) => s.key === lead.stage);
        return (
          <li key={lead.id}>
            <button
              type="button"
              onClick={() => onSelect(lead.id)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{leadTitle(lead)}</p>
                <p className="truncate text-xs text-muted-foreground">{lead.company || lead.phone || "—"}</p>
              </div>
              {stage && (
                <Badge
                  className={cn(
                    stageColorClasses(stage.color).bg,
                    stageColorClasses(stage.color).fg,
                    "border-transparent shrink-0"
                  )}
                >
                  {stage.label}
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
