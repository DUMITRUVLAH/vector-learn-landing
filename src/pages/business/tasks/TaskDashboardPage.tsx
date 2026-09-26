// Dashboard de task-uri — starea muncii peste toate boardurile.
//
// Toate cifrele ies din `lib/tasks/analytics.ts` (funcții pure, testate) peste
// setul deja încărcat de „toate task-urile": nicio interogare în plus, deci
// schimbarea unui filtru recalculează instantaneu.

import { useMemo, useState } from "react";
import { TASKS_BOARDS, boardPath, useNavigate } from "@/lib/tasks/router";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, ListTodo, Loader2, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { Card, CardContent } from "@/components/tasks/ui";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import {
  useAllTasks,
  useAssignableIndex,
  useAssignableUsers,
  useBoardNames,
  useTasksAuth,
} from "@/hooks/useTaskBoards";
import {
  completionTrend,
  computeKpis,
  countByStatus,
  dueSoon,
  loadByPerson,
  statsByBoard,
} from "@/lib/tasks/analytics";
import { EMPTY_FILTERS, filterTasks, type TaskFilterState } from "@/lib/tasks/filters";
import { todayIso } from "@/lib/tasks/grouping";
import { OVERDUE_TEXT, STATUS_META, avatarClass, boardDotClass, initialsOf } from "@/lib/tasks/meta";
import { TASK_STATUSES } from "@/lib/tasks/types";

export function TaskDashboardPage() {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  const navigate = useNavigate();
  const { user, isHRAdmin, isSuperAdmin } = useTasksAuth();
  const isHr = isHRAdmin || isSuperAdmin;
  // Identitatea sosește asincron (`/api/tasks/me`): implicitul — toată compania pentru
  // administrator, echipa mea pentru ceilalți — se derivă din rol până alege omul
  // explicit. Fixat la montare, administratorul care deschidea direct dashboardul
  // rămânea pe „Echipa mea".
  const [pickedScope, setScope] = useState<"own" | "team" | "company" | null>(null);
  const scope = pickedScope ?? (isHr ? "company" : "team");

  // Dashboardul se uită la TOT, inclusiv la ce e gata — altfel rata de
  // finalizare s-ar calcula pe un set din care lipsesc exact finalizările.
  const [filters, setFilters] = useState<TaskFilterState>({
    ...EMPTY_FILTERS,
    includeDone: true,
  });

  const { data: tasks = [], isLoading } = useAllTasks();
  const assignableIndex = useAssignableIndex(null);
  const { data: assignable = [] } = useAssignableUsers(null);

  // „Echipa mea" = eu + coechipierii (oamenii din aceleași echipe ale workspace-ului).
  const scopeIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    if (scope === "team") {
      for (const person of assignable) {
        if (person.relation === "self" || person.relation === "teammate") ids.add(person.user_id);
      }
    }
    return ids;
  }, [assignable, scope, user?.id]);

  const scoped = useMemo(() => {
    const allowed =
      scope === "company"
        ? tasks
        : tasks.filter((task) => {
            const assignees = new Set([task.assigned_to, ...(task.assignees ?? [])].filter(Boolean));
            return [...scopeIds].some((id) => assignees.has(id));
          });
    return filterTasks(allowed, filters, today);
  }, [tasks, filters, today, scope, scopeIds]);

  const kpis = useMemo(() => computeKpis(scoped, today), [scoped, today]);
  const trend = useMemo(() => completionTrend(scoped, today, 30), [scoped, today]);
  const byStatus = useMemo(() => countByStatus(scoped), [scoped]);
  const people = useMemo(() => loadByPerson(scoped, today), [scoped, today]);
  const boardStats = useMemo(() => statsByBoard(scoped, today), [scoped, today]);
  const soon = useMemo(() => dueSoon(scoped, today, 7), [scoped, today]);

  const boardNames = useBoardNames();

  const maxLoad = Math.max(1, ...people.map((p) => p.open));
  const chartData = useMemo(
    () => trend.map((point) => ({ ...point, label: format(parseISO(point.day), "d MMM", { locale }) })),
    [trend, locale],
  );

  return (
    <TasksLayout>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.dashboard.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("board.dashboard.subtitle")}</p>
        </div>
        <div
          className="flex rounded-xl border bg-card p-1 shadow-sm"
          role="group"
          aria-label={t("board.dashboard.scopeLabel")}
        >
          {(["own", "team", ...(isHr ? (["company"] as const) : [])] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-pressed={scope === value}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                scope === value
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(`board.dashboard.scopes.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <TaskFilterBar filters={filters} onChange={setFilters} tasks={scoped} variant="expanded" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
              icon={<ListTodo className="h-4 w-4 text-blue-600" />}
              tone="pastel-sky"
              label={t("board.dashboard.open")}
              value={kpis.open}
            />
            <Kpi
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              tone="pastel-mint"
              label={t("board.dashboard.completion")}
              value={`${kpis.completionPct}%`}
              hint={t("board.dashboard.completedIn30", { count: kpis.recentlyCompleted })}
            />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
              tone="pastel-rose"
              label={t("board.dashboard.overdue")}
              value={kpis.overdue}
            />
            <Kpi
              icon={<UserX className="h-4 w-4 text-orange-600" />}
              tone="pastel-peach"
              label={t("board.dashboard.unassigned")}
              value={kpis.unassigned}
            />
            <Kpi
              icon={<Clock className="h-4 w-4 text-violet-600" />}
              tone="pastel-lavender"
              label={t("board.dashboard.cycle")}
              value={kpis.avgCycleDays === null ? "—" : t("board.dashboard.days", { count: kpis.avgCycleDays })}
            />
          </div>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("board.dashboard.trend")}</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  {/*
                    Fără margine negativă: `left: -20` peste o axă de 32px
                    lăsa 12px pentru cifre, deci „0", „2", „4" ieșeau 2-3px
                    în stânga containerului și erau tăiate de card. Trucul de
                    a fura șanțul axei se plătește exact în etichetele ei.
                  */}
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="taskCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="taskCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={32} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name={t("board.dashboard.created")}
                      stroke="hsl(217 91% 60%)"
                      fill="url(#taskCreated)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name={t("board.dashboard.completed")}
                      stroke="hsl(160 84% 39%)"
                      fill="url(#taskCompleted)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("board.dashboard.workload")}</h2>
                {people.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("board.overview.noWorkload")}</p>
                ) : (
                  <div className="space-y-2.5">
                    {people.slice(0, 10).map((row) => {
                      const name = assignableIndex[row.userId]?.full_name ?? t("board.detail.unknownUser");
                      return (
                        <div key={row.userId} className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              avatarClass(row.userId),
                            )}
                          >
                            {initialsOf(name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs">{name}</span>
                              <span className="shrink-0 text-xs tabular-nums">
                                {row.open}
                                {row.overdue > 0 && <span className={cn("ml-1", OVERDUE_TEXT)}>({row.overdue})</span>}
                              </span>
                            </div>
                            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-red-500"
                                style={{ width: `${(row.overdue / maxLoad) * 100}%` }}
                              />
                              <div
                                className="h-full bg-blue-500"
                                style={{ width: `${((row.open - row.overdue) / maxLoad) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("board.dashboard.byBoard")}</h2>
                {boardStats.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("board.dashboard.noBoards")}</p>
                ) : (
                  <div className="space-y-2.5">
                    {boardStats.map((row) => (
                      <button
                        key={row.boardId}
                        type="button"
                        onClick={() => navigate(boardPath(row.boardId))}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 shrink-0 rounded", boardDotClass(row.boardId))} />
                          <span className="min-w-0 flex-1 truncate text-xs hover:underline">
                            {boardNames[row.boardId] ?? t("board.dashboard.unknownBoard")}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {row.done}/{row.total}
                          </span>
                          {row.overdue > 0 && (
                            <span className={cn("shrink-0 text-[11px]", OVERDUE_TEXT)}>{row.overdue}</span>
                          )}
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.pct}%` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("board.overview.distribution")}</h2>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {TASK_STATUSES.map((status) => {
                    const count = byStatus[status];
                    if (count === 0) return null;
                    return (
                      <div
                        key={status}
                        className={cn("h-full", STATUS_META[status].bar)}
                        style={{ width: `${(count / Math.max(1, kpis.total)) * 100}%` }}
                        title={`${t(`status.${status}`)}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {TASK_STATUSES.map((status) => (
                    <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", STATUS_META[status].dot)} />
                      {t(`status.${status}`)}
                      <span className="font-medium tabular-nums text-foreground">{byStatus[status]}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("board.dashboard.dueSoon")}</h2>
                {soon.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("board.dashboard.nothingSoon")}</p>
                ) : (
                  <div className="space-y-1">
                    {soon.slice(0, 8).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() =>
                          // Task personal = fără board: adresa boardului `null` ducea
                          // la ecranul „Boardul nu există". „Toate task-urile"
                          // rezolvă orice task vizibil, indiferent de board.
                          navigate(
                            task.board_id ? boardPath(task.board_id, task.id) : `${TASKS_BOARDS}/all?task=${task.id}`,
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent/10"
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[task.status].dot)} />
                        <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
                        {task.due_date && (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {format(parseISO(task.due_date), "d MMM", { locale })}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </TasksLayout>
  );
}

interface KpiProps {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string | number;
  hint?: string;
}

function Kpi({ icon, tone, label, value, hint }: KpiProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-2.5 p-3.5">
        <div className={cn("rounded-xl p-2", tone)}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
          {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
