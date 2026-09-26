// „Taskurile mele" — tot ce mi-e atribuit, din toate boardurile.
//
// Gruparea e pe termen (Restante / Azi / Săptămâna asta / Mai târziu / Fără
// termen), nu pe board: când te uiți la propria listă, întrebarea e „ce fac
// acum", nu „din ce proiect vine". Boardul apare ca etichetă pe rând.
//
// Task-urile gata nu apar (vezi `groupTasksByDue`) — asta e o listă de lucru,
// nu un istoric.

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Circle,
  HandHelping,
  KanbanSquare,
  List,
  ListChecks,
  Loader2,
  PartyPopper,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { Button, Card, CardContent } from "@/components/tasks/ui";
import { BoardCalendarView } from "@/components/tasks/BoardCalendarView";
import { StatusKanban } from "@/components/tasks/StatusKanban";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskSortControl } from "@/components/tasks/TaskSortControl";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import { TaskQuickAddBar } from "@/components/tasks/TaskQuickAddBar";
import {
  useAssignableIndex,
  useAvailableTasks,
  useBoardNames,
  useClaimTask,
  useCreateTask,
  useMyTasks,
  useTasksAuth,
  useUpdateTask,
  useViewPref,
  useOpenTask,
} from "@/hooks/useTaskBoards";
import { EMPTY_FILTERS, filterTasks, type TaskFilterState } from "@/lib/tasks/filters";
import { DEFAULT_SORT, sortTasks, type SortState, normalizeSort } from "@/lib/tasks/sorting";
import {
  DUE_BUCKETS,
  addDaysIso,
  groupTasksByDue,
  isOverdue,
  subtaskCounts,
  todayIso,
  toDueDateIso,
  type DueBucket,
} from "@/lib/tasks/grouping";
import { OVERDUE_TEXT, PRIORITY_META, boardDotClass } from "@/lib/tasks/meta";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { useSearchParams } from "@/lib/tasks/router";
import { toast } from "@/lib/tasks/toast";
import { useTasksT } from "@/lib/tasks/useTasksT";
import type { BoardTask } from "@/lib/tasks/types";

type MyTasksView = "list" | "kanban" | "calendar";

/**
 * Grupele în care „adaugă" are un termen neambiguu. „Restante" e trecutul, iar
 * „mai târziu" n-are o dată anume — acolo un buton de adăugare ar trebui să
 * inventeze un termen, deci nu-l punem.
 */
const ADDABLE_BUCKETS: DueBucket[] = ["today", "week", "unscheduled"];

export function MyTasksPage() {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  const [params, setParams] = useSearchParams();
  const { user } = useTasksAuth();

  const [view, setView] = useState<MyTasksView>("list");
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const viewPref = useViewPref<{
    view: MyTasksView;
    filters: TaskFilterState;
    sort?: SortState;
  }>("my-tasks");
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !viewPref.isLoaded) return;
    restored.current = true;
    if (viewPref.pref) {
      if (viewPref.pref.view) setView(viewPref.pref.view);
      if (viewPref.pref.filters) setFilters(viewPref.pref.filters);
      // Poate lipsi dintr-o vedere salvată înainte ca sortarea să existe.
      if (viewPref.pref.sort) setSort(normalizeSort(viewPref.pref.sort));
    }
  }, [viewPref.isLoaded, viewPref.pref]);

  const persist = (next: Partial<{ view: MyTasksView; filters: TaskFilterState; sort: SortState }>) => {
    if (!restored.current) return;
    viewPref.save.mutate({ view, filters, sort, ...next });
  };

  const { data: tasks = [], isLoading, isError, refetch } = useMyTasks();
  const assignableIndex = useAssignableIndex(null);
  /** id → nume, pentru sortarea pe responsabil (co-responsabilii unui task). */
  const assignableNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);
  const updateTask = useUpdateTask();

  // Coada de task-uri libere: cine termină devreme își ia singur de lucru, în
  // loc să aștepte ca cineva să i le atribuie. Se încarcă doar când e deschisă.
  const [showQueue, setShowQueue] = useState(false);
  const { data: available = [] } = useAvailableTasks(showQueue);
  const claimTask = useClaimTask();
  const boardNames = useBoardNames();

  /**
   * Secțiunile („Restante", „Azi", …) rămân gruparea paginii — ele SUNT
   * „Taskurile mele". Sortarea aleasă se aplică în interiorul fiecărei secțiuni;
   * implicit e tot termenul, ca înainte.
   */
  const filtered = useMemo(
    () =>
      sortTasks(filterTasks(tasks, filters, today), sort.key === "manual" ? { key: "due_date", dir: "asc" } : sort, {
        names: assignableNames,
      }),
    [tasks, filters, today, sort, assignableNames],
  );
  const groups = useMemo(() => groupTasksByDue(filtered, today), [filtered, today]);

  /**
   * Boardul păstrează ordinea manuală (`position`), nu pe cea după termen:
   * pe coloană tragi cardurile unde vrei, iar un task nou apare la coada
   * coloanei lui — nu se strecoară alfabetic printre celelalte. Lista rămâne
   * pe `due`, fiindcă acolo grupăm oricum pe termene.
   */
  const kanbanTasks = useMemo(
    () =>
      sortTasks(
        // Boardul are coloană dedicată „Finalizat", deci ascunderea implicită
        // a task-urilor gata ar goli-o mereu: tragi un card acolo şi dispare.
        filterTasks(tasks, { ...filters, includeDone: true }, today),
        { key: "manual", dir: "asc" },
      ),
    [tasks, filters, today],
  );

  const openTaskId = params.get("task");
  const openTask = useOpenTask(openTaskId, tasks);
  const setOpenTask = (taskId: string | null) => {
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    setParams(params, { replace: true });
  };

  const totalOpen = filtered.filter((task) => task.status !== "done").length;

  /* Peste setul NEFILTRAT — listele plate ascund subtask-urile (vezi AllTasksPage). */
  const subCounts = useMemo(() => subtaskCounts(tasks), [tasks]);

  const row = (task: BoardTask) => {
    const overdue = isOverdue(task, today);
    return (
      <div
        key={task.id}
        className="group flex items-center gap-2.5 border-b px-3 py-2.5 last:border-0 hover:bg-accent/10"
      >
        <button
          type="button"
          onClick={() => updateTask.mutate({ id: task.id, patch: { status: "done" } })}
          // `-m-2 p-2`: zona de atingere devine 32px fără să se mute nimic
          // vizual — bifarea unui task era o țintă de 16px pe telefon.
          className="-m-2 shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-emerald-600"
          aria-label={t("board.detail.markComplete")}
        >
          <Circle className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setOpenTask(task.id)}
          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
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

        {task.priority !== "medium" && (
          <span
            className={cn(
              "hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline",
              PRIORITY_META[task.priority].chip,
            )}
          >
            {t(`priority.${task.priority}`)}
          </span>
        )}

        {task.due_date && (
          <span className={cn("shrink-0 text-[11px] tabular-nums", overdue ? OVERDUE_TEXT : "text-muted-foreground")}>
            {format(parseISO(task.due_date), "d MMM", { locale })}
          </span>
        )}
      </div>
    );
  };

  return (
    <TasksLayout>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        {/*
          Fără avatar și fără nume: pagina se cheamă „Task-urile mele", e deschisă de mine,
          iar numele meu e deja în colțul din stânga-jos. Trei afirmări ale aceluiași fapt
          ocupau jumătate din antet și împingeau lista sub fold.
        */}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.myTasks.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("board.myTasks.openCount", { count: totalOpen })}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border bg-card p-1 shadow-sm">
            {(["kanban", "list", "calendar"] as const).map((key) => {
              const Icon = key === "list" ? List : key === "kanban" ? KanbanSquare : CalendarDays;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setView(key);
                    persist({ view: key });
                  }}
                  aria-pressed={view === key}
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
          showPersonFilter={false}
          variant="expanded"
          trailing={
            <TaskSortControl
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                persist({ sort: next });
              }}
            />
          }
        />
      </div>

      <div className="mb-4">
        <TaskQuickAddBar assigneeId={user?.id} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <TaskLoadError onRetry={() => refetch()} />
      ) : view === "calendar" ? (
        <div className="lg:h-[70vh]">
          {/*
            Înălțime fixă doar de la `lg` în sus, unde grila și sertarul stau UNUL LÂNGĂ
            ALTUL și încap. Pe telefon se așază unul SUB altul, deci conținutul e mai
            înalt decât `70vh`: cutia nu derula, ci se revărsa peste ce urma — butonul
            „Vezi task-urile libere" ajungea SUB cardul „Fără termen" și părea tăiat
            (raportat 10-09-2026).
          */}
          <BoardCalendarView
            boardId={null}
            tasks={filtered}
            onOpenTask={setOpenTask}
            canEdit
            quickAddAssignees={user ? [user.id] : []}
          />
        </div>
      ) : view === "kanban" ? (
        <StatusKanban
          tasks={kanbanTasks}
          subtaskCounts={subCounts}
          boardNames={boardNames}
          assignableIndex={assignableIndex}
          onOpenTask={setOpenTask}
          quickAddAssignees={user ? [user.id] : []}
        />
      ) : totalOpen === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-2xl pastel-mint p-3">
              <PartyPopper className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium">{t("board.myTasks.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("board.myTasks.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {DUE_BUCKETS.map((bucket) => {
            const items = groups[bucket];
            // Bucket gol fără cale de adăugare = zgomot; cu una, e o invitație.
            if (items.length === 0 && !ADDABLE_BUCKETS.includes(bucket)) return null;
            return (
              <div key={bucket} className="overflow-hidden rounded-2xl border bg-card">
                <div
                  className={cn(
                    "flex items-center gap-2 border-b px-3 py-2.5",
                    bucket === "overdue" ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/30",
                  )}
                >
                  <h2 className={cn("flex-1 text-sm font-semibold", bucket === "overdue" && OVERDUE_TEXT)}>
                    {t(`board.buckets.${bucket}`)}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                {items.map(row)}
                {ADDABLE_BUCKETS.includes(bucket) && (
                  <BucketQuickAdd bucket={bucket} today={today} assigneeId={user?.id} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setShowQueue((v) => !v)}
        >
          <HandHelping className="h-3.5 w-3.5" />
          {showQueue ? t("board.queue.hide") : t("board.queue.show")}
        </Button>

        {showQueue && (
          <div className="mt-2 overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-muted/30 px-3 py-2.5">
              <h2 className="text-sm font-semibold">{t("board.queue.title")}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("board.queue.hint")}</p>
            </div>
            {available.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">{t("board.queue.empty")}</p>
            ) : (
              available.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 border-b px-3 py-2.5 last:border-0 hover:bg-accent/10"
                >
                  <button
                    type="button"
                    onClick={() => setOpenTask(task.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                  >
                    {task.title}
                  </button>
                  {task.board_id && (
                    <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                      <span className={cn("h-2 w-2 rounded", boardDotClass(task.board_id))} />
                      {boardNames[task.board_id] ?? ""}
                    </span>
                  )}
                  {task.due_date && (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {format(parseISO(task.due_date), "d MMM", { locale })}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 text-xs"
                    onClick={() => claimTask.mutate(task)}
                  >
                    {t("board.queue.claim")}
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

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

interface BucketQuickAddProps {
  bucket: DueBucket;
  today: string;
  assigneeId?: string;
}

/**
 * Adăugare direct din listă, ca la Board (pe coloană) și Calendar (pe zi).
 * Termenul îl dă grupa în care scrii, ca task-ul să rămână unde l-ai creat.
 * Fără board: e un task personal (vezi `TaskQuickAddBar`).
 */
function BucketQuickAdd({ bucket, today, assigneeId }: BucketQuickAddProps) {
  const { t } = useTasksT();
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const dueFor = (): string | null => {
    if (bucket === "today") return toDueDateIso(new Date(`${today}T12:00:00`));
    if (bucket === "week") return toDueDateIso(new Date(`${addDaysIso(today, 7)}T12:00:00`));
    return null;
  };

  const submit = async () => {
    const clean = title.trim();
    if (!clean) {
      setOpen(false);
      return;
    }
    // Închidem întâi: altfel un al doilea Enter creează același task de două ori.
    setTitle("");
    setOpen(false);
    try {
      await createTask.mutateAsync({
        title: clean,
        board_id: null,
        due_date: dueFor(),
        assignees: assigneeId ? [assigneeId] : [],
      });
    } catch (error) {
      console.error("[tasks] bucket add", error);
      // Serverul întoarce un cod (`title_length`…), nu o propoziție: îl traducem.
      toast.error(taskErrorMessage(error, t));
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTitle("");
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("board.card.add")}
      </button>
    );
  }

  return (
    <div className="px-3 py-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        /*
          Blur-ul PĂSTREAZĂ ce ai scris, NU creează task-ul. Comentariul de dinainte spunea
          „Click în altă parte = salvează, nu arunca ce ai scris" — grija e corectă, soluția
          nu era: orice click adăuga un task, iar după Enter ieșeau două.
        */
        maxLength={300}
        placeholder={t("board.card.newPlaceholder")}
        aria-label={t("board.quickAdd.titleLabel")}
        className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
