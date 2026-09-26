// Pagina unui board: tab-uri Prezentare · Listă · Kanban · Calendar, cu panoul
// de detalii deschis lateral prin `?task=<id>`.
//
// De ce `?task=` în URL și nu doar state local: linkul devine partajabil —
// „uită-te la asta" într-un chat deschide exact task-ul, nu boardul. Aceeași
// convenție o refolosesc „Taskurile mele" și „Toate task-urile".

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  KanbanSquare,
  List,
  ListPlus,
  Loader2,
  Plus,
  Settings2,
  Star,
  Users,
  SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@/components/tasks/ui";
import { BoardCalendarView } from "@/components/tasks/BoardCalendarView";
import { BoardKanbanView } from "@/components/tasks/BoardKanbanView";
import { BoardListView } from "@/components/tasks/BoardListView";
import { BoardMembersDialog } from "@/components/tasks/BoardMembersDialog";
import { BoardOverviewView } from "@/components/tasks/BoardOverviewView";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskSortControl } from "@/components/tasks/TaskSortControl";
import {
  useAssignableIndex,
  useBoard,
  useBoardLists,
  useBoardMembers,
  useBoardTasks,
  useBulkCreateTasks,
  useCreateList,
  useCreateTask,
  useTasksAuth,
  useToggleBoardStar,
  useOpenTask,
} from "@/hooks/useTaskBoards";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  filterTasks,
  taskSetProgress,
  type TaskFilterState,
} from "@/lib/tasks/filters";
import { positionForNewTask } from "@/lib/tasks/positions";
import { DEFAULT_SORT, sortTasks, type GroupKey, type SortState } from "@/lib/tasks/sorting";
import { todayIso } from "@/lib/tasks/grouping";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import { boardColorClass } from "@/lib/tasks/meta";
import { TASKS_BOARDS, useNavigate, useParams, useSearchParams } from "@/lib/tasks/router";
import { toast } from "@/lib/tasks/toast";
import { useTasksT } from "@/lib/tasks/useTasksT";

type BoardTab = "overview" | "list" | "kanban" | "calendar";

const TABS: { key: BoardTab; icon: typeof List }[] = [
  { key: "overview", icon: BarChart3 },
  { key: "list", icon: List },
  { key: "kanban", icon: KanbanSquare },
  { key: "calendar", icon: CalendarDays },
];

export function TaskBoardDetailPage() {
  const { boardId } = useParams();
  const { t } = useTasksT();
  const { user, isHRAdmin, isSuperAdmin } = useTasksAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState<BoardTab>("kanban");
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [group, setGroup] = useState<GroupKey>("none");
  const [membersOpen, setMembersOpen] = useState(false);
  const [newList, setNewList] = useState({ name: "", is_done_list: false });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const { data: board, isLoading: boardLoading } = useBoard(boardId);
  const { data: lists = [] } = useBoardLists(boardId);
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    isError: tasksError,
    refetch: refetchTasks,
  } = useBoardTasks(boardId);
  const { data: members = [] } = useBoardMembers(boardId);
  const assignableIndex = useAssignableIndex(boardId);
  /** id → nume, pentru sortarea și gruparea pe responsabil. */
  const assignableNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);

  const createList = useCreateList(boardId);
  const createTask = useCreateTask();
  const bulkCreate = useBulkCreateTasks();
  const toggleStar = useToggleBoardStar();

  /**
   * Editorii boardului + HR/super pot scrie; ceilalți văd read-only.
   *
   * Dreptul vine întâi de la server (`can_edit`, calculat cu aceeași funcție care
   * decide la scriere): un board de echipă sau al întregii organizații dă drept de
   * lucru și oamenilor care NU sunt în lista de membri, deci lista singură i-ar fi
   * lăsat read-only pe un board pe care serverul îi lasă să scrie. Fără câmp,
   * rămâne regula pe membri.
   */
  const canEdit = useMemo(() => {
    if (board?.can_edit !== undefined) return board.can_edit;
    if (isHRAdmin || isSuperAdmin) return true;
    const me = members.find((m) => m.user_id === user?.id);
    return me?.role === "editor" || me?.role === "admin";
  }, [board, members, user?.id, isHRAdmin, isSuperAdmin]);

  /** Membrii îi schimbă adminul boardului — rolul efectiv (`my_role`), dacă serverul îl trimite. */
  const isBoardAdmin = useMemo(() => {
    if (isHRAdmin || isSuperAdmin) return true;
    if (board?.my_role !== undefined) return board.my_role === "admin";
    return members.find((m) => m.user_id === user?.id)?.role === "admin";
  }, [board, members, user?.id, isHRAdmin, isSuperAdmin]);

  const today = todayIso();
  const visibleTasks = useMemo(
    // Sub-taskurile trec de filtru: fiecare vedere decide singură dacă le arată
    // (Lista le indentează sub părinte, Kanbanul le ascunde).
    () => filterTasks(tasks, { ...filters, includeSubtasks: true, includeDone: true }, today),
    [tasks, filters, today],
  );
  const taskSets = useMemo(() => taskSetProgress(tasks), [tasks]);

  const openTaskId = params.get("task");
  const openTask = useOpenTask(openTaskId, tasks);

  const setOpenTask = (taskId: string | null) => {
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    setParams(params, { replace: true });
  };

  /**
   * Butonul primar din antet crea rândul ÎNAINTE ca omul să scrie ceva, cu
   * `title: ''` — dar serverul cere între 1 și 500 de caractere, deci
   * insertul cădea de fiecare dată și butonul părea pur și simplu mort.
   * Acum pornește cu un titlu implicit valid, iar modalul se deschide cu el
   * selectat, ca prima tastă să-l înlocuiască.
   */
  const addTask = async () => {
    if (!boardId) return;
    try {
      // Sus, ca la composerul din coloană — o singură regulă, `positionForNewTask`.
      // Fără poziție explicită, serverul pune cardul la coada coloanei: apăsai
      // butonul, se deschidea cartonașul, iar la închiderea lui cardul era la
      // coada unei coloane lungi, adică sub fold.
      const targetList = lists[0]?.id ?? null;
      const surori = tasks
        .filter((task) => !task.parent_task_id && (task.list_id ?? null) === targetList)
        .map((task) => task.position);
      const created = await createTask.mutateAsync({
        title: t("board.card.untitled"),
        board_id: boardId,
        list_id: targetList,
        position: positionForNewTask(surori),
      });
      setOpenTask(created.id);
    } catch (error) {
      console.error("[tasks] create", error);
      toast.error(taskErrorMessage(error, t));
    }
  };

  const submitList = async () => {
    const name = newList.name.trim();
    if (!name) return;
    try {
      await createList.mutateAsync({ name, is_done_list: newList.is_done_list });
      setNewList({ name: "", is_done_list: false });
      setListDialogOpen(false);
    } catch (error) {
      console.error("[tasks] create list", error);
      toast.error(t("board.toast.saveFailed"));
    }
  };

  if (boardLoading) {
    return (
      <TasksLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </TasksLayout>
    );
  }

  if (!board) {
    return (
      <TasksLayout>
        <div className="py-16 text-center">
          <p className="font-medium">{t("board.notFound.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("board.notFound.description")}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(TASKS_BOARDS)}>
            {t("board.notFound.back")}
          </Button>
        </div>
      </TasksLayout>
    );
  }

  const isStarred = (board.starred_by ?? []).includes(user?.id ?? "");
  const wide = tab === "kanban" || tab === "calendar";

  const header = (
    <div className="border-b bg-card px-4 pt-3 sm:px-6">
      <div className="flex items-center gap-2">
        <span className={cn("h-3 w-3 rounded", boardColorClass(board.color))} />
        <h1 className="truncate font-display text-lg font-bold tracking-tight">{board.name}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => toggleStar.mutate(board)}
          aria-label={t("board.star")}
        >
          <Star className={cn("h-4 w-4", isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
        </Button>

        <div className="flex-1" />

        {isBoardAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("board.members.button")}</span>
            <span className="tabular-nums text-muted-foreground">{members.length}</span>
          </Button>
        )}
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-1.5 sm:inline-flex"
              onClick={() => {
                setBulkText("");
                setBulkOpen(true);
              }}
            >
              <ListPlus className="h-3.5 w-3.5" />
              {t("board.list.bulkAdd")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={addTask} disabled={createTask.isPending}>
              <Plus className="h-3.5 w-3.5" />
              {t("board.card.add")}
            </Button>
          </>
        )}
      </div>

      {taskSets.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={t("board.taskSets.label")}>
          {taskSets.map((set) => (
            <button
              key={set.name}
              type="button"
              onClick={() => setFilters({ ...filters, search: set.name })}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-[11px] shadow-sm hover:bg-muted"
              title={t("board.taskSets.progress", { done: set.done, total: set.total })}
            >
              <span className="max-w-[180px] truncate font-medium">{set.name}</span>
              <span className="text-muted-foreground">
                {set.done}/{set.total}
              </span>
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${set.percent}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 overflow-x-auto">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`board.tabs.${key}`)}
          </button>
        ))}

        <div className="ml-auto flex shrink-0 items-center gap-2 pb-1.5">
          {tab !== "overview" && (
            <TaskFilterBar
              filters={filters}
              onChange={setFilters}
              tasks={tasks}
              boardId={boardId}
              showBoardFilter={false}
            />
          )}
          {(tab === "list" || tab === "kanban" || tab === "calendar") && (
            <TaskSortControl
              sort={sort}
              onSortChange={setSort}
              /*
                Kanbanul E deja împărțit pe coloane, iar coloanele impun statusul
                (`maps_to_status` al coloanei) — o sortare pe status în interiorul
                unei coloane n-ar schimba nimic și ar arăta ca un control stricat.
              */
              hiddenSortKeys={tab === "kanban" ? ["status"] : []}
              /* Calendarul așază task-urile pe zile — o a doua grupare în benzi
                 n-ar avea unde să încapă. Acolo rămâne doar sortarea (ordinea
                 din interiorul unei zile). */
              {...(tab === "calendar" ? {} : { group, onGroupChange: setGroup })}
            />
          )}
          {canEdit && tab === "kanban" && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setListDialogOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              {t("board.addList")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const body = tasksLoading ? (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : tasksError ? (
    <div className="p-4 sm:p-6">
      <TaskLoadError onRetry={() => refetchTasks()} />
    </div>
  ) : visibleTasks.length === 0 && activeFilterCount(filters) > 0 ? (
    // Cu filtre active și zero rezultate, boardul arăta pur și simplu coloane
    // goale — ce se confundă cu „boardul e gol". Acum spune de ce.
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <SearchX className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t("board.filters.noResults")}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setFilters({ ...EMPTY_FILTERS, includeDone: filters.includeDone })}
      >
        {t("board.filters.clear")}
      </Button>
    </div>
  ) : tab === "overview" ? (
    <div className="p-4 sm:p-6">
      <BoardOverviewView tasks={visibleTasks} assignableIndex={assignableIndex} onOpenTask={setOpenTask} />
    </div>
  ) : tab === "list" ? (
    <div className="p-4 sm:p-6">
      <BoardListView
        boardId={board.id}
        tasks={visibleTasks}
        lists={lists}
        assignableIndex={assignableIndex}
        onOpenTask={setOpenTask}
        canEdit={canEdit}
        sort={sort}
        group={group}
      />
    </div>
  ) : tab === "kanban" ? (
    <BoardKanbanView
      boardId={board.id}
      tasks={visibleTasks}
      lists={lists}
      assignableIndex={assignableIndex}
      onOpenTask={setOpenTask}
      onAddList={() => setListDialogOpen(true)}
      canEdit={canEdit}
      sort={sort}
      group={group}
    />
  ) : (
    <div className="h-full p-4 sm:p-6">
      <BoardCalendarView
        boardId={board.id}
        /* Calendarul nu resortează intern: ordinea din interiorul unei zile e
           exact ordinea în care primește task-urile. */
        tasks={sortTasks(visibleTasks, sort, { names: assignableNames })}
        lists={lists}
        onOpenTask={setOpenTask}
        canEdit={canEdit}
      />
    </div>
  );

  return (
    <TasksLayout fullBleed>
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="flex min-h-0 flex-1">
          <div className={cn("min-w-0 flex-1", wide ? "overflow-hidden" : "overflow-y-auto")}>{body}</div>
        </div>
      </div>

      {openTask && (
        <TaskDetailModal
          task={openTask}
          lists={lists}
          boardId={board.id}
          onClose={() => setOpenTask(null)}
          onOpenTask={setOpenTask}
          canEdit={canEdit}
        />
      )}

      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("board.addList")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="list-name">{t("board.form.listName")}</Label>
              <Input
                id="list-name"
                autoFocus
                value={newList.name}
                onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitList();
                  }
                }}
                placeholder={t("board.form.listNamePlaceholder")}
              />
            </div>
            <label className="flex items-start gap-2.5">
              <Checkbox
                checked={newList.is_done_list}
                onCheckedChange={(v) => setNewList({ ...newList, is_done_list: v === true })}
              />
              <span className="text-sm leading-tight">
                {t("board.form.isDoneList")}
                <span className="mt-0.5 block text-xs text-muted-foreground">{t("board.form.isDoneListHint")}</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialogOpen(false)}>
              {t("board.actions.cancel")}
            </Button>
            <Button onClick={submitList} disabled={createList.isPending}>
              {t("board.actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("board.list.bulkAdd")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("board.list.bulkHint")}</p>
            <Textarea
              autoFocus
              rows={8}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={t("board.list.bulkPlaceholder")}
              aria-label={t("board.list.bulkAdd")}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              {t("board.actions.cancel")}
            </Button>
            <Button
              disabled={!bulkText.trim() || bulkCreate.isPending}
              onClick={() => {
                const titles = bulkText
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean);
                bulkCreate.mutate(
                  { titles, board_id: board.id, list_id: lists[0]?.id ?? null },
                  {
                    onSuccess: (created) => {
                      toast.success(t("board.list.bulkCreated", { count: created.length }));
                      setBulkOpen(false);
                      setBulkText("");
                    },
                    onError: (error) => {
                      console.error("[tasks] bulk add", error);
                      // Serverul întoarce un cod (`title_length`…), nu o propoziție: îl traducem.
                      toast.error(taskErrorMessage(error, t));
                    },
                  },
                );
              }}
            >
              {t("board.list.bulkCreate", {
                count: bulkText.split("\n").filter((line) => line.trim()).length,
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BoardMembersDialog boardId={board.id} open={membersOpen} onOpenChange={setMembersOpen} members={members} />
    </TasksLayout>
  );
}
