// „Toate task-urile" — vederea transversală peste boarduri.
//
// Kanbanul de aici e pe STATUS, nu pe coloane: coloanele diferă de la un board
// la altul, deci singura axă comună e statusul. Mutarea între coloane schimbă
// statusul, iar sincronizarea din `updateTask` duce cardul și în coloana
// potrivită din boardul lui.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "@/lib/tasks/router";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  KanbanSquare,
  List,
  ListChecks,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { Card, CardContent } from "@/components/tasks/ui";
import { BoardCalendarView } from "@/components/tasks/BoardCalendarView";
import { StatusKanban } from "@/components/tasks/StatusKanban";
import { AssigneeAvatars } from "@/components/tasks/AssigneeAvatars";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskSortControl } from "@/components/tasks/TaskSortControl";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import { TaskQuickAddBar } from "@/components/tasks/TaskQuickAddBar";
import {
  useAllTasks,
  useAssignableIndex,
  useUpdateTask,
  useViewPref,
  useBoardNames,
  useOpenTask,
} from "@/hooks/useTaskBoards";
import { EMPTY_FILTERS, filterTasks, type TaskFilterState } from "@/lib/tasks/filters";
import { DEFAULT_SORT, groupTasks, sortTasks, type GroupKey, type SortState, normalizeSort } from "@/lib/tasks/sorting";
import { isOverdue, subtaskCounts, todayIso } from "@/lib/tasks/grouping";
import { OVERDUE_TEXT, STATUS_META, boardDotClass } from "@/lib/tasks/meta";
import type { BoardTask } from "@/lib/tasks/types";

type AllTasksView = "list" | "kanban" | "calendar";

export function AllTasksPage() {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<AllTasksView>("list");
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [group, setGroup] = useState<GroupKey>("none");

  // Vedere salvată: filtrele se aplică o singură dată, la prima încărcare.
  // Fără garda `restored`, o salvare ulterioară ar reveni peste ce tocmai a
  // schimbat utilizatorul (React Query reîmprospătează preferința în fundal).
  const viewPref = useViewPref<{
    view: AllTasksView;
    filters: TaskFilterState;
    sort?: SortState;
    group?: GroupKey;
  }>("all-tasks");
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !viewPref.isLoaded) return;
    restored.current = true;
    if (viewPref.pref) {
      if (viewPref.pref.view) setView(viewPref.pref.view);
      if (viewPref.pref.filters) setFilters(viewPref.pref.filters);
      // Preferințele noi pot lipsi dintr-o vedere salvată ÎNAINTE de acest val:
      // se citesc tolerant, cu implicit.
      if (viewPref.pref.sort) setSort(normalizeSort(viewPref.pref.sort));
      if (viewPref.pref.group) setGroup(viewPref.pref.group);
    }
  }, [viewPref.isLoaded, viewPref.pref]);

  const persist = (
    next: Partial<{ view: AllTasksView; filters: TaskFilterState; sort: SortState; group: GroupKey }>,
  ) => {
    if (!restored.current) return;
    viewPref.save.mutate({ view, filters, sort, group, ...next });
  };

  const { data: tasks = [], isLoading, isError, refetch } = useAllTasks();
  const assignableIndex = useAssignableIndex(null);
  /** id → nume, pentru sortarea și gruparea pe responsabil. */
  const assignableNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);
  const updateTask = useUpdateTask();

  const boardNames = useBoardNames();

  const filtered = useMemo(
    () =>
      sortTasks(
        // Kanbanul e pe status: o coloană „Finalizat" din care lipsesc chiar
        // task-urile finalizate ar fi goală mereu și nu ai putea trage nimic
        // înapoi din ea. În Listă și Calendar rămâne alegerea utilizatorului.
        filterTasks(tasks, view === "kanban" ? { ...filters, includeDone: true } : filters, today),
        // Implicit rămâne „termenul cel mai apropiat întâi" — ordinea manuală
        // n-are înțeles peste boarduri diferite, unde `position` e per board.
        sort.key === "manual" ? { key: "due_date", dir: "asc" } : sort,
        { names: assignableNames },
      ),
    [tasks, filters, today, view, sort, assignableNames],
  );

  /* Peste setul NEFILTRAT: `filtered` scoate subtask-urile din listele plate,
     deci un contor derivat de acolo ar fi mereu zero. */
  const subCounts = useMemo(() => subtaskCounts(tasks), [tasks]);

  const openTaskId = params.get("task");
  const openTask = useOpenTask(openTaskId, tasks);
  const setOpenTask = (taskId: string | null) => {
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    setParams(params, { replace: true });
  };

  // Peste prag, rândurile se virtualizează: la 2.000 de task-uri lista randa
  // tot setul deodată, iar filtrarea și tastatul deveneau vizibil lente.
  const row = (task: BoardTask) => {
    const overdue = isOverdue(task, today);
    const isDone = task.status === "done";
    return (
      <div
        key={task.id}
        className="group flex items-center gap-2.5 border-b px-3 py-2.5 last:border-0 hover:bg-accent/10"
      >
        <button
          type="button"
          onClick={() => updateTask.mutate({ id: task.id, patch: { status: isDone ? "todo" : "done" } })}
          className="-m-2 shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-emerald-600"
          aria-label={t("board.detail.markComplete")}
        >
          {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => setOpenTask(task.id)}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm hover:underline",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>

        {task.board_id && (
          <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <span className={cn("h-2 w-2 rounded", boardDotClass(task.board_id))} />
            {boardNames[task.board_id] ?? ""}
          </span>
        )}

        {subCounts[task.id] && (
          <span
            className={cn(
              "hidden shrink-0 items-center gap-0.5 text-[11px] tabular-nums sm:inline-flex",
              subCounts[task.id].done === subCounts[task.id].total ? "text-emerald-600" : "text-muted-foreground",
            )}
            title={t("board.card.subtasks", {
              done: subCounts[task.id].done,
              total: subCounts[task.id].total,
            })}
          >
            <ListChecks className="h-3 w-3" />
            {subCounts[task.id].done}/{subCounts[task.id].total}
          </span>
        )}

        <span
          className={cn("hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:inline", STATUS_META[task.status].chip)}
        >
          {t(`status.${task.status}`)}
        </span>

        <AssigneeAvatars
          userIds={task.assignees ?? []}
          index={assignableIndex}
          size="xs"
          max={2}
          className="hidden shrink-0 sm:flex"
        />

        {task.due_date && (
          <span
            className={cn(
              "w-[52px] shrink-0 text-right text-[11px] tabular-nums",
              overdue ? OVERDUE_TEXT : "text-muted-foreground",
            )}
          >
            {format(parseISO(task.due_date), "d MMM", { locale })}
          </span>
        )}
      </div>
    );
  };

  return (
    <TasksLayout>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.allTasks.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("board.allTasks.subtitle", { count: filtered.length })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border bg-card p-1 shadow-sm">
            {(["list", "kanban", "calendar"] as const).map((key) => {
              const Icon = key === "list" ? List : key === "kanban" ? KanbanSquare : CalendarDays;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setView(key);
                    persist({ view: key });
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    view === key
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`board.tabs.${key}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <TaskFilterBar
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            persist({ filters: next });
          }}
          tasks={tasks}
          variant="expanded"
          trailing={
            <TaskSortControl
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                persist({ sort: next });
              }}
              group={group}
              onGroupChange={(next) => {
                setGroup(next);
                persist({ group: next });
              }}
            />
          }
        />
      </div>

      <div className="mb-4">
        <TaskQuickAddBar />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <TaskLoadError onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-14 text-center">
            <p className="font-medium">{t("board.allTasks.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("board.allTasks.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : view === "calendar" ? (
        <div className="lg:h-[70vh]">
          {/*
            Înălțime fixă doar de la `lg` în sus, unde grila și sertarul stau UNUL LÂNGĂ
            ALTUL și încap. Pe telefon se așază unul SUB altul, deci conținutul e mai
            înalt decât `70vh`: cutia nu derula, ci se revărsa peste ce urma — butonul
            „Vezi task-urile libere" ajungea SUB cardul „Fără termen" și părea tăiat
            (raportat 10-09-2026).
          */}
          <BoardCalendarView boardId={null} tasks={filtered} onOpenTask={setOpenTask} canEdit />
        </div>
      ) : view === "kanban" ? (
        <StatusKanban
          tasks={filtered}
          subtaskCounts={subCounts}
          boardNames={boardNames}
          assignableIndex={assignableIndex}
          onOpenTask={setOpenTask}
        />
      ) : (
        <TaskGroupedRows tasks={filtered} group={group} names={assignableNames} renderRow={row} />
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

/**
 * Lista de rânduri, virtualizată peste un prag.
 *
 * Sub prag randăm normal: virtualizarea are cost propriu (măsurare, absolute
 * positioning) și nu merită pentru 40 de rânduri. Peste, randăm doar ce se vede
 * — altfel un set de 2.000 de task-uri blochează tabul la fiecare tastă în
 * căutare.
 */
const VIRTUALIZE_ABOVE = 120;
const ROW_HEIGHT = 44;

interface TaskGroupedRowsProps {
  tasks: BoardTask[];
  group: GroupKey;
  names: Record<string, string>;
  renderRow: (task: BoardTask) => JSX.Element;
}

/**
 * Benzile de grupare peste `TaskRows`.
 *
 * Fiecare bandă își păstrează virtualizarea proprie (`TaskRows` decide singur
 * dacă e cazul), deci gruparea nu anulează câștigul de performanță pe liste
 * mari. Fără grupare, randează exact ca înainte — zero cost.
 */
function TaskGroupedRows({ tasks, group, names, renderRow }: TaskGroupedRowsProps) {
  const { t } = useTasksT();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () => groupTasks(tasks, group, { names, unassignedLabel: t("group.unassigned") }),
    [tasks, group, names, t],
  );

  if (group === "none") return <TaskRows tasks={tasks} renderRow={renderRow} />;

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.id];
        // Prioritatea și „fără responsabil" au etichete CODIFICATE în funcția
        // pură; traducerea se face aici.
        const label =
          group === "priority"
            ? t(`priority.${g.id}`)
            : g.isUnassigned
              ? group === "tag"
                ? t("group.untagged")
                : t("group.unassigned")
              : g.label;

        return (
          <div key={g.id} className="overflow-hidden rounded-2xl border bg-card">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              className="flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2.5 text-left"
              aria-label={isCollapsed ? t("group.expand") : t("group.collapse")}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <h3 className="flex-1 truncate text-sm font-semibold">{label}</h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">{g.tasks.length}</span>
            </button>
            {!isCollapsed && <div>{g.tasks.map(renderRow)}</div>}
          </div>
        );
      })}
    </div>
  );
}

interface TaskRowsProps {
  tasks: BoardTask[];
  renderRow: (task: BoardTask) => JSX.Element;
}

function TaskRows({ tasks, renderRow }: TaskRowsProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = tasks.length > VIRTUALIZE_ABOVE;

  const virtualizer = useVirtualizer({
    count: virtual ? tasks.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (!virtual) {
    return <div className="overflow-hidden rounded-2xl border bg-card">{tasks.map(renderRow)}</div>;
  }

  return (
    <div ref={parentRef} className="overflow-auto rounded-2xl border bg-card" style={{ maxHeight: "70vh" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={tasks[item.index].id}
            ref={virtualizer.measureElement}
            data-index={item.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start}px)`,
            }}
          >
            {renderRow(tasks[item.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
