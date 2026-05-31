/**
 * CRM-120 — Dashboard „Azi" per vânzător
 * Afișează: task-uri scadente, leaduri noi necontactate, follow-up necesar, Next Best Action.
 */
import { useEffect, useState } from "react";
import { Loader2, Phone, Clock, AlertTriangle, Zap, Users, MessageCircle, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  fetchTodayDashboard,
  type TodayDashboardResponse,
  type TodayDashboardTask,
  type TodayDashboardItem,
  type TodayNBAItem,
} from "@/lib/api/leads";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  webform: "Site web", manual: "Manual", facebook_ad: "Facebook",
  google_ads: "Google", referral: "Recomandare", phone_in: "Telefon",
  instagram: "Instagram", import: "Import", other: "Altul",
};

const STAGE_LABEL: Record<string, string> = {
  new: "Lead nou", contacted: "Contactat", trial: "Trial", paid: "Client", lost: "Pierdut",
};

const formatEur = (cents: number) =>
  cents > 0
    ? new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
    : null;

export function TodayDashboardPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [data, setData] = useState<TodayDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    setLoading(true);
    fetchTodayDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, []);

  const totalActions = data?.totalActions ?? 0;

  return (
    <AppShell
      pageTitle="Dashboard Azi"
      pageDescription={
        totalActions > 0
          ? `${totalActions} acțiuni de făcut azi`
          : "Tot e la zi"
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă acțiunile de azi…
        </div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Summary bar */}
          {totalActions > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Ai {totalActions} acțiuni de făcut azi —{" "}
                {data!.overdueOrDueToday.length > 0 && `${data!.overdueOrDueToday.length} task-uri scadente, `}
                {data!.newUncontacted.length > 0 && `${data!.newUncontacted.length} leaduri noi, `}
                {data!.followUpNeeded.length > 0 && `${data!.followUpNeeded.length} follow-up`}
              </p>
            </div>
          )}

          {/* Section 1: Tasks due today / overdue */}
          {data!.overdueOrDueToday.length > 0 && (
            <Section
              title="Task-uri scadente"
              icon={<Clock className="h-4 w-4 text-destructive" />}
              count={data!.overdueOrDueToday.length}
              accent="destructive"
            >
              {data!.overdueOrDueToday.map((t) => (
                <TaskRow
                  key={t.taskId}
                  task={t}
                  onClickLead={() => navigate(`/app/leads/${t.leadId}`)}
                />
              ))}
            </Section>
          )}

          {/* Section 2: New uncontacted */}
          {data!.newUncontacted.length > 0 && (
            <Section
              title="Leaduri noi necontactate"
              icon={<Users className="h-4 w-4 text-primary" />}
              count={data!.newUncontacted.length}
              accent="primary"
            >
              {data!.newUncontacted.map((l) => (
                <LeadRow
                  key={l.id}
                  item={l}
                  onClick={() => navigate(`/app/leads/${l.id}`)}
                />
              ))}
            </Section>
          )}

          {/* Section 3: Follow-up needed */}
          {data!.followUpNeeded.length > 0 && (
            <Section
              title="Follow-up de făcut"
              icon={<MessageCircle className="h-4 w-4 text-amber-600" />}
              count={data!.followUpNeeded.length}
              accent="warning"
            >
              {data!.followUpNeeded.map((l) => (
                <LeadRow
                  key={l.id}
                  item={l}
                  onClick={() => navigate(`/app/leads/${l.id}`)}
                />
              ))}
            </Section>
          )}

          {/* Section 4: Next Best Action */}
          {data!.nextBestAction.length > 0 && (
            <Section
              title="Next Best Action (top 5)"
              icon={<Zap className="h-4 w-4 text-success" />}
              count={data!.nextBestAction.length}
              accent="success"
            >
              {data!.nextBestAction.map((l) => (
                <NBARow
                  key={l.id}
                  item={l}
                  onClick={() => navigate(`/app/leads/${l.id}`)}
                />
              ))}
            </Section>
          )}

          {/* Empty state */}
          {totalActions === 0 && data!.nextBestAction.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-success" />
              </div>
              <p className="text-lg font-bold">Bravo! Tot e la zi.</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Nu ai task-uri scadente, leaduri noi necontactate sau follow-up-uri de făcut.
              </p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  accent: "destructive" | "primary" | "warning" | "success";
  children: React.ReactNode;
}

function Section({ title, icon, count, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onClickLead }: { task: TodayDashboardTask; onClickLead: () => void }) {
  const now = new Date();
  const dueDate = task.dueAt ? new Date(task.dueAt) : null;
  const isOverdue = dueDate !== null && dueDate < now;
  const daysOverdue = isOverdue
    ? Math.floor((now.getTime() - dueDate!.getTime()) / 86400000)
    : 0;

  return (
    <button
      type="button"
      onClick={onClickLead}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
      aria-label={`Task pentru ${task.leadFullName}: ${task.taskTitle}`}
    >
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
        isOverdue ? "bg-destructive/10 text-destructive" : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
      )}>
        {isOverdue ? `${daysOverdue}d` : "!"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{task.leadFullName}</p>
        <p className="text-xs text-muted-foreground truncate">{task.taskTitle}</p>
        {task.leadInterestCourse && (
          <p className="text-[11px] text-muted-foreground/70 truncate">{task.leadInterestCourse}</p>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {task.leadValueCents > 0 && (
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatEur(task.leadValueCents)}
          </span>
        )}
        {task.leadPhone && (
          <a
            href={`tel:${task.leadPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 text-primary p-1.5 transition-colors touch-target"
            aria-label={`Sună ${task.leadFullName}`}
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" aria-hidden="true" />
      </div>
    </button>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

interface LeadRowItem {
  id: string;
  fullName: string;
  stage: string;
  phone: string | null;
  interestCourse: string | null;
  valueCents: number;
  reason: string;
  source?: string;
}

function LeadRow({ item, onClick }: { item: LeadRowItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
      aria-label={`Lead ${item.fullName}: ${item.reason}`}
    >
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
        {item.fullName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{item.fullName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {STAGE_LABEL[item.stage] ?? item.stage}
          </span>
          {item.interestCourse && (
            <span className="text-[11px] text-muted-foreground/70 truncate">{item.interestCourse}</span>
          )}
        </div>
        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">{item.reason}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {item.valueCents > 0 && (
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatEur(item.valueCents)}
          </span>
        )}
        {item.phone && (
          <a
            href={`tel:${item.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 text-primary p-1.5 transition-colors touch-target"
            aria-label={`Sună ${item.fullName}`}
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" aria-hidden="true" />
      </div>
    </button>
  );
}

// ─── NBA row ──────────────────────────────────────────────────────────────────

function NBARow({ item, onClick }: { item: TodayNBAItem; onClick: () => void }) {
  const hotLevel = (item.score ?? 0) >= 70 ? "hot" : (item.score ?? 0) >= 40 ? "warm" : "cold";
  const hotColors = {
    hot: "bg-destructive/10 text-destructive",
    warm: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    cold: "bg-muted text-muted-foreground",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
      aria-label={`NBA Lead ${item.fullName} — scor ${item.score ?? 0}`}
    >
      <div className={cn(
        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
        hotColors[hotLevel]
      )}>
        {item.score ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{item.fullName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {STAGE_LABEL[item.stage] ?? item.stage}
          </span>
          {item.interestCourse && (
            <span className="text-[11px] text-muted-foreground/70 truncate">{item.interestCourse}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{item.ageDays}z în pipeline</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {item.valueCents > 0 && (
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatEur(item.valueCents)}
          </span>
        )}
        {item.phone && (
          <a
            href={`tel:${item.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 text-primary p-1.5 transition-colors touch-target"
            aria-label={`Sună ${item.fullName}`}
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" aria-hidden="true" />
      </div>
    </button>
  );
}
