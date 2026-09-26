// Gantt & milestones — planul pe axa timpului, peste toate boardurile.
//
// Barele se desenează pe o grilă de zile calculată în `lib/tasks/gantt.ts`
// (funcție pură, testată). Lățimea unei zile e configurabilă din zoom; restul e
// aritmetică simplă de offset, ca aranjarea să nu depindă de fusul orar al
// celui care se uită.
//
// Milestone = romb, fără durată: un reper („lansare", „audit") nu se întinde pe
// mai multe zile chiar dacă are și `start_date`, și `due_date`.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/tasks/router";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { format, parseISO } from "date-fns";
import { Diamond, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { Button, Card, CardContent, ScrollArea, ScrollBar } from "@/components/tasks/ui";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskSortControl } from "@/components/tasks/TaskSortControl";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import { useAllTasks, useAssignableIndex, useUpdateTask } from "@/hooks/useTaskBoards";
import { EMPTY_FILTERS, filterTasks, type TaskFilterState } from "@/lib/tasks/filters";
import { buildGanttLayout, monthTicks } from "@/lib/tasks/gantt";
import { DEFAULT_SORT, sortTasks, type SortState } from "@/lib/tasks/sorting";
import { todayIso } from "@/lib/tasks/grouping";
import { STATUS_META, boardDotClass } from "@/lib/tasks/meta";

const ZOOM_LEVELS = { compact: 14, normal: 26, wide: 44 } as const;
type Zoom = keyof typeof ZOOM_LEVELS;

export function TaskGanttPage() {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<TaskFilterState>({ ...EMPTY_FILTERS, includeDone: true });
  const [zoom, setZoom] = useState<Zoom>("normal");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { data: tasks = [], isLoading, isError, refetch } = useAllTasks();
  const updateTask = useUpdateTask();

  const assignableIndex = useAssignableIndex(null);
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);

  const filtered = useMemo(() => {
    const base = filterTasks(tasks, filters, today);
    // Pe `manual` lăsăm Ganttul să-și aranjeze rândurile cronologic, ca înainte.
    return sort.key === "manual" ? base : sortTasks(base, sort, { names });
  }, [tasks, filters, today, sort, names]);

  const layout = useMemo(
    () => buildGanttLayout(filtered, { today, preserveOrder: sort.key !== "manual" }),
    [filtered, today, sort.key],
  );

  /**
   * Rândurile se randează în tranșe.
   *
   * Fiecare rând conține un container lat de `totalDays × dayWidth` px — la 18
   * luni înseamnă ~14.000px. Cu 2.000 de task-uri, tabul îngheța secunde bune la
   * fiecare schimbare de zoom și la fiecare tastă din căutare. Nu virtualizăm
   * (rândurile stau într-un `ScrollArea` cu scroll orizontal, iar sincronizarea
   * cu antetul axei e fragilă) — arătăm o tranșă și spunem EXPLICIT câte au
   * rămas, ca limitarea să nu fie tăcută.
   */
  const GANTT_PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(GANTT_PAGE);
  useEffect(() => setVisibleCount(GANTT_PAGE), [filters, tasks.length]);
  const visibleRows = layout.rows.slice(0, visibleCount);
  const hiddenRows = layout.rows.length - visibleRows.length;
  const ticks = useMemo(() => monthTicks(layout.from, layout.totalDays), [layout.from, layout.totalDays]);

  const dayWidth = ZOOM_LEVELS[zoom];
  const gridWidth = layout.totalDays * dayWidth;
  const todayOffset =
    today >= layout.from && today <= layout.to
      ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${layout.from}T00:00:00Z`)) / 86_400_000)
      : null;

  const openTaskId = params.get("task");
  const openTask = openTaskId ? (tasks.find((task) => task.id === openTaskId) ?? null) : null;
  const setOpenTask = (taskId: string | null) => {
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    setParams(params, { replace: true });
  };

  return (
    <TasksLayout>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.gantt.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("board.gantt.subtitle", { count: layout.rows.length })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {(Object.keys(ZOOM_LEVELS) as Zoom[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoom(level)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  zoom === level ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t(`board.gantt.zoom.${level}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5">
        <TaskFilterBar filters={filters} onChange={setFilters} tasks={tasks} variant="expanded" />
        <div className="mt-2 flex justify-end">
          {/* Ganttul n-are benzi: rândurile lui SUNT deja o listă pe axa timpului. */}
          <TaskSortControl sort={sort} onSortChange={setSort} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <TaskLoadError onRetry={() => refetch()} />
      ) : layout.rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-2xl pastel-lavender p-3">
              <Flag className="h-6 w-6 text-violet-600" />
            </div>
            <p className="font-medium">{t("board.gantt.emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("board.gantt.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <ScrollArea className="w-full">
            <div className="min-w-fit">
              {/* Antet: lunile. Zilele individuale n-au etichetă — la 26px
                  lățime ar fi ilizibile și oricum axa se citește pe luni. */}
              <div className="flex border-b bg-muted/30">
                <div className="w-[220px] shrink-0 border-r px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("board.gantt.taskColumn")}
                </div>
                <div className="relative" style={{ width: gridWidth }}>
                  {ticks.map((tick) => (
                    <div
                      key={tick.iso}
                      className="absolute top-0 border-l px-1.5 py-2 text-[11px] font-medium capitalize"
                      style={{ left: tick.offsetDays * dayWidth }}
                    >
                      {format(parseISO(tick.iso), "LLL yyyy", { locale })}
                    </div>
                  ))}
                  <div className="py-2 text-[11px] opacity-0">.</div>
                </div>
              </div>

              <div className="relative">
                {todayOffset !== null && (
                  <div
                    className="pointer-events-none absolute top-0 z-10 h-full w-px bg-red-400"
                    style={{ left: 220 + todayOffset * dayWidth + dayWidth / 2 }}
                  />
                )}

                {visibleRows.map((row) => (
                  <div key={row.task.id} className="flex border-b last:border-0 hover:bg-accent/10">
                    <div className="flex w-[220px] shrink-0 items-center gap-2 border-r px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateTask.mutate({
                            id: row.task.id,
                            patch: { is_milestone: !row.isMilestone },
                          })
                        }
                        className={cn(
                          "shrink-0 transition-colors",
                          row.isMilestone ? "text-violet-600" : "text-muted-foreground/40 hover:text-violet-600",
                        )}
                        title={t("board.gantt.toggleMilestone")}
                        aria-label={t("board.gantt.toggleMilestone")}
                      >
                        <Diamond className={cn("h-3.5 w-3.5", row.isMilestone && "fill-current")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenTask(row.task.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                      >
                        {row.task.title}
                      </button>
                    </div>

                    <div className="relative py-2" style={{ width: gridWidth }}>
                      {row.isMilestone ? (
                        <button
                          type="button"
                          onClick={() => setOpenTask(row.task.id)}
                          className="absolute top-1.5"
                          style={{ left: row.offsetDays * dayWidth + dayWidth / 2 - 7 }}
                          title={row.task.title}
                          aria-label={row.task.title}
                        >
                          <Diamond className="h-3.5 w-3.5 rotate-0 fill-violet-500 text-violet-600" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenTask(row.task.id)}
                          className={cn(
                            "absolute top-2 flex h-4 items-center rounded px-1.5 text-[10px] text-white transition-opacity hover:opacity-80",
                            STATUS_META[row.task.status].bar,
                          )}
                          style={{
                            left: row.offsetDays * dayWidth,
                            width: Math.max(row.spanDays * dayWidth - 2, 8),
                          }}
                          title={`${row.from} → ${row.to}`}
                        >
                          {row.spanDays * dayWidth > 70 && <span className="truncate">{row.task.title}</span>}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {hiddenRows > 0 && (
            <div className="flex items-center justify-center gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>{t("board.gantt.hiddenRows", { count: hiddenRows })}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setVisibleCount((n) => n + GANTT_PAGE)}
              >
                {t("board.gantt.showMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      {layout.undated.length > 0 && (
        <Card className="mt-4 rounded-2xl">
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">{t("board.gantt.undated", { count: layout.undated.length })}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t("board.gantt.undatedHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {layout.undated.slice(0, 30).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setOpenTask(task.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent/10"
                >
                  {task.board_id && <span className={cn("h-1.5 w-1.5 rounded", boardDotClass(task.board_id))} />}
                  <span className="max-w-[220px] truncate">{task.title}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          lists={[]}
          boardId={openTask.board_id}
          onClose={() => setOpenTask(null)}
          onOpenTask={setOpenTask}
        />
      )}
    </TasksLayout>
  );
}
