// Kanban pe @dnd-kit, cu poziții fracționate.
//
// De ce pointer-based și nu drag&drop nativ HTML5: cu HTML5, orice re-render în
// timpul tragerii (și React Query re-randează des) anulează drag-ul în Chrome,
// iar controalele interactive de pe card îl interceptează. Pragul de 6px pe
// PointerSensor rezolvă și problema opusă — click-ul pe bifa de completare nu
// mai pornește o tragere.
//
// Drop pe un CARD = inserare înaintea lui; drop pe COLOANĂ = la coadă. În ambele
// cazuri se scrie o singură poziție, nu se renumerotează coloana.

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  ListChecks,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  Plus,
  SortAsc,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTasksT, type TasksT } from "@/lib/tasks/useTasksT";
import { toast } from "@/lib/tasks/toast";
import { RecurrenceBadge } from "@/components/tasks/RecurrenceBadge";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Textarea,
} from "@/components/tasks/ui";
import { AssigneeAvatars } from "@/components/tasks/AssigneeAvatars";
import {
  useArchiveList,
  useArchivedLists,
  useBulkCreateTasks,
  useCommentCounts,
  useCreateTask,
  useListOperations,
  useListTaskCount,
  useMoveTask,
  useUnarchiveList,
  useUpdateTask,
} from "@/hooks/useTaskBoards";
import { positionForDrop, positionForNewTask } from "@/lib/tasks/positions";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { OVERDUE_TEXT, PRIORITY_META, listTone } from "@/lib/tasks/meta";
import { isOverdue, subtaskCounts, todayIso } from "@/lib/tasks/grouping";
import { DEFAULT_SORT, groupTasks, sortTasks, type GroupKey, type SortState } from "@/lib/tasks/sorting";
import { parseTag, TAG_COLORS } from "@/lib/tasks/tags";
import type { AssignableUser, BoardTask, TaskList } from "@/lib/tasks/types";

interface BoardKanbanViewProps {
  boardId: string;
  tasks: BoardTask[];
  lists: TaskList[];
  assignableIndex: Record<string, AssignableUser>;
  onOpenTask: (taskId: string) => void;
  onAddList: () => void;
  canEdit: boolean;
  /** Ordinea cardurilor în interiorul unei coloane. Implicit: aranjarea manuală. */
  sort?: SortState;
  /** Benzi orizontale peste coloane (responsabil / prioritate / etichetă). */
  group?: GroupKey;
}

/** Coloana virtuală pentru cardurile fără listă (import-uri, task-uri vechi). */
const UNSORTED = "__unsorted__";

export function BoardKanbanView({
  boardId,
  tasks,
  lists,
  assignableIndex,
  onOpenTask,
  onAddList,
  canEdit,
  sort = DEFAULT_SORT,
  group = "none",
}: BoardKanbanViewProps) {
  const { t, i18n } = useTasksT();
  const dateLocale = getDateFnsLocale(i18n.language);
  const today = todayIso();

  const moveTask = useMoveTask();
  const updateTask = useUpdateTask(lists);
  const createTask = useCreateTask();
  const archiveList = useArchiveList(boardId);
  const listOps = useListOperations(boardId);
  const bulkCreate = useBulkCreateTasks();

  /*
    Referințe STABILE pentru carduri. Fără ele, `memo` de pe `KanbanCard` n-ar
    face nimic: o funcție nouă la fiecare randare a boardului e o prop nouă,
    deci toate cele ~300 de carduri se re-randau la orice bifă sau reîncărcare.
  */
  const openTask = useCallback((id: string) => onOpenTask(id), [onOpenTask]);
  const toggleDone = useCallback(
    (task: BoardTask) =>
      updateTask.mutate({
        id: task.id,
        patch: { status: task.status === "done" ? "todo" : "done" },
      }),
    [updateTask.mutate],
  );

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [bulkIn, setBulkIn] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});

  const unarchiveList = useUnarchiveList(boardId);
  const { data: archivedLists = [] } = useArchivedLists(boardId, canEdit);
  const { data: archivingCount = 0 } = useListTaskCount(archiving);

  // `PointerSensor` singur nu ajunge pe telefon: coloanele stau în containere cu
  // scroll, deci browserul preia gestul ca scroll și emite `pointercancel`.
  // `TouchSensor` cu `delay` pornește tragerea abia după apăsare lungă — scroll-ul
  // rămâne posibil, iar `tolerance` iartă tremurul degetului în cele 200ms.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /** id → nume, pentru sortarea și gruparea pe responsabil. */
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);

  const topLevel = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const { data: commentCounts = {} } = useCommentCounts(topLevel.map((task) => task.id));
  /* Subtask-urile sunt deja în `tasks` (le scoatem doar din coloane), deci
     contorul se derivă — fără a doua interogare pentru același fapt. */
  const subCounts = useMemo(() => subtaskCounts(tasks), [tasks]);

  const columns = useMemo(() => {
    const byList: Record<string, BoardTask[]> = { [UNSORTED]: [] };
    for (const list of lists) byList[list.id] = [];
    for (const task of topLevel) {
      const key = task.list_id && byList[task.list_id] ? task.list_id : UNSORTED;
      byList[key].push(task);
    }
    // `sortTasks` e stabil, deci pe `manual` iese exact ordinea pozițiilor de
    // dinainte — sortarea nu schimbă nimic până când utilizatorul nu o cere.
    for (const key of Object.keys(byList)) byList[key] = sortTasks(byList[key], sort, { names });
    return byList;
  }, [topLevel, lists, sort, names]);

  /**
   * Benzile. Se calculează peste TOATE cardurile, o singură dată; fiecare coloană
   * își filtrează apoi propriile carduri din setul benzii.
   *
   * Un card cu doi responsabili apare în ambele benzi — deci id-urile de
   * drag & drop trebuie să fie unice PER BANDĂ, nu per card (vezi `instanceId`).
   */
  const lanes = useMemo(
    () => (group === "none" ? null : groupTasks(topLevel, group, { names, unassignedLabel: t("group.unassigned") })),
    [topLevel, group, names, t],
  );

  const draggedTask = draggedId ? (topLevel.find((task) => task.id === draggedId) ?? null) : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedId(null);
    const { active, over } = event;
    if (!over) return;

    // Identitatea vine din `data`, nu din `active.id`: cu benzi active id-ul e
    // per APARIȚIE (`bandă:task`), fiindcă același task poate fi în două benzi.
    const activeData = active.data.current as { taskId?: string } | undefined;
    const task = topLevel.find((item) => item.id === (activeData?.taskId ?? active.id));
    if (!task) return;

    const overData = over.data.current as { type: "card" | "column"; listId: string; taskId?: string } | undefined;
    if (!overData) return;

    const targetListId = overData.listId === UNSORTED ? null : overData.listId;
    const targetList = targetListId ? (lists.find((l) => l.id === targetListId) ?? null) : null;

    // Pozițiile coloanei țintă FĂRĂ cardul mutat — altfel calculul „între vecini"
    // s-ar raporta la locul lui vechi și cardul ar sări înapoi.
    const siblings = (columns[overData.listId] ?? []).filter((item) => item.id !== task.id);
    let index = siblings.length;
    if (overData.type === "card") {
      const overIndex = siblings.findIndex((item) => item.id === (overData.taskId ?? over.id));
      if (overIndex >= 0) index = overIndex;
    }
    const position = positionForDrop(
      siblings.map((item) => item.position),
      index,
    );

    if (task.list_id === targetListId && task.position === position) return;

    moveTask.mutate(
      {
        taskId: task.id,
        toListId: targetListId,
        position,
        currentStatus: task.status,
        targetList,
      },
      {
        onError: (error) => {
          console.error("[tasks] move", error);
          // Motivul refuzului („dependențele nu sunt gata", „are nevoie de
          // aprobare") spune exact ce blochează — e mai util decât un text generic.
          // Serverul îl trimite ca un cod (`needs_approval`), deci trece prin
          // `taskErrorMessage`, care îl traduce — afișat brut, omul ar citi codul.
          toast.error(taskErrorMessage(error, t, "board.toast.moveFailed"));
        },
      },
    );
  };

  const quickAdd = async (listId: string) => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      // Sus, nu jos. Fără poziție explicită, serverul pune `MAX + 1024`,
      // adică la coadă — pe o coloană lungă taskul dispărea sub fold exact în
      // clipa în care îl scriai.
      //
      // Inserția în cap înjumătățește poziția minimă, iar înjumătățirea consumă
      // mantisa. În practică încap peste o mie de adăugări în
      // același punct înainte ca media să nu se mai distingă; dacă totuși se
      // ajunge acolo, taskul merge la coadă (`position: 0` = „calculează tu"),
      // cu un semnal în consolă — o ordine degradată e mai bună decât două
      // carduri cu aceeași poziție, unde ordinea devine arbitrară.
      const surori = (columns[listId] ?? []).map((item) => item.position);
      const position = positionForNewTask(surori);
      if (position === 0) {
        console.error("[tasks] pozițiile din capul coloanei s-au epuizat", { listId });
      }
      await createTask.mutateAsync({
        title,
        board_id: boardId,
        list_id: listId === UNSORTED ? null : listId,
        position,
      });
    } catch (error) {
      console.error("[tasks] quick add", error);
      toast.error(taskErrorMessage(error, t, "board.toast.saveFailed"));
    }
  };

  const renderColumn = (
    key: string,
    name: string,
    color: string,
    isDoneList: boolean,
    listId: string | null,
    /** Cu benzi active: id-ul benzii și cardurile ei (deja filtrate). */
    lane?: { id: string; taskIds: Set<string> },
  ) => {
    const all = columns[key] ?? [];
    const items = lane ? all.filter((task) => lane.taskIds.has(task.id)) : all;
    return (
      <KanbanColumn key={`${lane?.id ?? "all"}-${key}`} listId={key} laneId={lane?.id} className="w-[280px] shrink-0">
        <div className={cn("group/col flex h-full flex-col rounded-2xl", listTone(color).columnBg)}>
          <div className="flex items-center gap-2 px-3 py-2.5">
            {renaming === key ? (
              <Input
                autoFocus
                aria-label={t("board.list.rename")}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && listId && renameValue.trim()) {
                    listOps.rename.mutate({ id: listId, name: renameValue.trim() });
                    setRenaming(null);
                  }
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={() => {
                  if (listId && renameValue.trim() && renameValue.trim() !== name) {
                    listOps.rename.mutate({ id: listId, name: renameValue.trim() });
                  }
                  setRenaming(null);
                }}
                className="h-6 flex-1 px-1 text-sm font-semibold"
              />
            ) : (
              <h3
                className={cn(
                  "flex min-w-0 items-center gap-1 truncate rounded-md px-2 py-1 text-[13px] font-semibold",
                  listTone(color).headerChip,
                )}
              >
                {/*
                  Fără semnul ăsta nu se putea vedea CARE coloană duce în
                  „Finalizat" — bifa se alegea la creare și dispărea din vedere.
                */}
                {isDoneList && (
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                    aria-label={t("board.list.isDoneList")}
                  />
                )}
                <span className="truncate">{name}</span>
              </h3>
            )}
            <span className="text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
            <div className="flex-1" />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setAddingIn(key);
                  setNewTitle("");
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/col:opacity-100"
                aria-label={t("board.card.add")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            {canEdit && listId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("board.list.menu", { name })}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenaming(listId);
                      setRenameValue(name);
                    }}
                  >
                    <ListPlus className="mr-2 h-3.5 w-3.5" />
                    {t("board.list.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setBulkIn(listId);
                      setBulkText("");
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {t("board.list.bulkAdd")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => listOps.setDoneList.mutate({ id: listId, isDone: !isDoneList })}>
                    <CheckCircle2 className={cn("mr-2 h-3.5 w-3.5", isDoneList && "text-emerald-600")} />
                    {t(isDoneList ? "board.list.unsetDoneList" : "board.list.setDoneList")}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => listOps.reorder.mutate({ lists, listId, direction: -1 })}>
                    <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
                    {t("board.list.moveLeft")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => listOps.reorder.mutate({ lists, listId, direction: 1 })}>
                    <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                    {t("board.list.moveRight")}
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <SortAsc className="mr-2 h-3.5 w-3.5" />
                      {t("board.list.sortBy")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {(["due_date", "priority", "title", "created_at"] as const).map((key) => (
                        <DropdownMenuItem key={key} onClick={() => listOps.sort.mutate({ listId, key })}>
                          {t(`board.list.sortKeys.${key}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {lists.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                        {t("board.list.moveAll")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {lists
                          .filter((l) => l.id !== listId)
                          .map((l) => (
                            <DropdownMenuItem
                              key={l.id}
                              onClick={() => listOps.moveAll.mutate({ fromListId: listId, toListId: l.id })}
                            >
                              {l.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  <DropdownMenuItem
                    onClick={() => listOps.duplicate.mutate({ listId, copySuffix: t("board.list.copySuffix") })}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    {t("board.list.duplicate")}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/*
                    Arhivarea ascunde cardurile din coloană de pe board
                    (`listBoardTasks` le filtrează), fără să le șteargă. Se
                    executa instant, deci 30 de carduri dispăreau fără avertisment
                    și fără cale de întoarcere din UI.

                    Meniul se închide la alegere (fără `preventDefault`): meniul
                    de aici nu se închide singur când focusul trece în dialog, iar
                    ținut deschis ar pluti peste confirmare.
                  */}
                  <DropdownMenuItem onSelect={() => setArchiving(listId)}>
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    {t("board.actions.archiveList")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {/*
              Composerul stă în CAPUL coloanei, fiindcă acolo intră și cardul
              (`positionAtStart`). Cu el la coadă, taskul scris apărea în altă
              parte decât locul în care îl scriai — iar pe o coloană lungă,
              butonul „+" din antet deschidea un input aflat sub fold.
            */}
            {canEdit &&
              (addingIn === key ? (
                <div className="rounded-xl border bg-card p-2">
                  <Input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        quickAdd(key);
                      }
                      if (e.key === "Escape") {
                        setAddingIn(null);
                        setNewTitle("");
                      }
                    }}
                    /*
                      Blur-ul PĂSTREAZĂ ce ai scris, NU creează rândul. Varianta veche
                      (`if (newTitle.trim()) quickAdd(...)`) adăuga un task la orice click
                      în altă parte — pe dialog, pe alt buton, pe fereastră — iar după un
                      Enter ieșeau DOUĂ: Enter scria unul, blur-ul îl scria pe al doilea.
                      Composerul rămâne deschis cu textul în el; se închide doar gol.
                    */
                    onBlur={() => {
                      if (!newTitle.trim()) setAddingIn(null);
                    }}
                    placeholder={t("board.card.newPlaceholder")}
                    aria-label={t("board.card.newPlaceholder")}
                    className="h-8 border-0 px-1 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingIn(key);
                    setNewTitle("");
                  }}
                  className="flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("board.card.add")}
                </button>
              ))}
            {items.length === 0 && addingIn !== key && (
              <p className="rounded-xl border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                {t("board.dropHere")}
              </p>
            )}
            {items.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                instanceId={lane ? `${lane.id}:${task.id}` : undefined}
                listId={key}
                locale={dateLocale}
                today={today}
                t={t}
                assignableIndex={assignableIndex}
                commentCount={commentCounts[task.id] ?? 0}
                subtasks={subCounts[task.id] ?? null}
                onOpen={openTask}
                onToggleDone={toggleDone}
              />
            ))}
          </div>
        </div>
      </KanbanColumn>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) => setDraggedId(String(event.active.id))}
      onDragCancel={() => setDraggedId(null)}
      onDragEnd={handleDragEnd}
    >
      {lanes ? (
        /*
          Benzi: fiecare bandă e un Kanban complet, cu aceleași coloane. Tragerea
          unui card între coloane funcționează ca înainte (schimbă starea); ce NU
          face e să schimbe banda — responsabilul unui card nu se modifică fiindcă
          l-ai mutat cu mâna în dreptul altcuiva. Ar fi o rescriere de date pe
          care nimeni n-a cerut-o explicit.
        */
        <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 pb-4 pt-1">
          {lanes.map((lane) => {
            const collapsedLane = collapsedLanes[lane.id];
            const label =
              group === "priority"
                ? t(`priority.${lane.id}`)
                : lane.isUnassigned
                  ? t(group === "tag" ? "group.untagged" : "group.unassigned")
                  : lane.label;
            const taskIds = new Set(lane.tasks.map((task) => task.id));

            return (
              <div key={lane.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsedLanes((c) => ({ ...c, [lane.id]: !c[lane.id] }))}
                  className="mb-2 flex items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/10"
                  aria-label={collapsedLane ? t("group.expand") : t("group.collapse")}
                >
                  {collapsedLane ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{lane.tasks.length}</span>
                </button>

                {!collapsedLane && (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {(columns[UNSORTED]?.length ?? 0) > 0 &&
                      renderColumn(UNSORTED, t("board.unsorted"), "pastel-peach", false, null, {
                        id: lane.id,
                        taskIds,
                      })}
                    {lists.map((list) =>
                      renderColumn(list.id, list.name, list.color, list.is_done_list, list.id, {
                        id: lane.id,
                        taskIds,
                      }),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4 pt-1">
          {/* Cardurile fără coloană apar doar dacă există — altfel ar fi o coloană
            goală permanentă pe fiecare board. */}
          {(columns[UNSORTED]?.length ?? 0) > 0 &&
            renderColumn(UNSORTED, t("board.unsorted"), "pastel-peach", false, null)}

          {lists.map((list) => renderColumn(list.id, list.name, list.color, list.is_done_list, list.id))}

          {canEdit && (
            <div className="flex h-fit w-[240px] shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={onAddList}
                className="flex items-center gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                {t("board.addList")}
              </button>

              {/*
              Coloanele arhivate ascund cardurile din ele. Fără intrarea asta,
              `unarchiveList` rămânea cod mort și cardurile dispăreau definitiv
              din board. Apare doar când chiar există ceva arhivat — nu ținem un
              element de UI permanent gol.
            */}
              {archivedLists.length > 0 && (
                <div className="rounded-2xl border bg-muted/30 p-2">
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    aria-expanded={showArchived}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {t("board.archivedLists.title")} ({archivedLists.length})
                  </button>
                  {showArchived && (
                    <ul className="mt-1 space-y-1">
                      {archivedLists.map((list) => (
                        <li key={list.id} className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs">{list.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              unarchiveList.mutate(list.id, {
                                onSuccess: () => toast.success(t("board.toast.listRestored")),
                                onError: (error) => {
                                  console.error("[tasks] unarchive list", error);
                                  toast.error(taskErrorMessage(error, t));
                                },
                              })
                            }
                            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={t("board.actions.restoreList")}
                            title={t("board.actions.restoreList")}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!bulkIn} onOpenChange={(open) => !open && setBulkIn(null)}>
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
              aria-label={t("board.list.bulkPlaceholder")}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkIn(null)}>
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
                  {
                    titles,
                    board_id: boardId,
                    list_id: bulkIn === UNSORTED ? null : bulkIn,
                  },
                  {
                    onSuccess: (created) => {
                      toast.success(t("board.list.bulkCreated", { count: created.length }));
                      setBulkIn(null);
                      setBulkText("");
                    },
                    onError: (error) => {
                      console.error("[tasks] bulk add", error);
                      toast.error(t("board.toast.saveFailed"));
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

      <DragOverlay dropAnimation={null}>
        {draggedTask && (
          <div className="w-[264px] rotate-2 rounded-xl border bg-card p-2.5 shadow-lg">
            <p className="text-sm font-medium">{draggedTask.title}</p>
          </div>
        )}
      </DragOverlay>
      {/* Confirmarea arhivării: spune CÂTE carduri dispar de pe board. */}
      <AlertDialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("board.archiveList.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {archivingCount > 0
                ? t("board.archiveList.withTasks", { count: archivingCount })
                : t("board.archiveList.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("board.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = archiving;
                setArchiving(null);
                if (!target) return;
                archiveList.mutate(target, {
                  onSuccess: () => toast.success(t("board.toast.listArchived")),
                  onError: (error) => {
                    console.error("[tasks] archive list", error);
                    toast.error(taskErrorMessage(error, t));
                  },
                });
              }}
            >
              {t("board.actions.archiveList")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}

interface KanbanColumnProps {
  listId: string;
  children: ReactNode;
  className?: string;
  /** Aceeași coloană apare în fiecare bandă — id-ul de drop trebuie să difere. */
  laneId?: string;
}

function KanbanColumn({ listId, children, className, laneId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${laneId ?? "all"}-${listId}`,
    data: { type: "column", listId },
  });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary/40 rounded-2xl")}>
      {children}
    </div>
  );
}

interface KanbanCardProps {
  task: BoardTask;
  listId: string;
  locale: Locale;
  today: string;
  /**
   * Traducătorul, dat de sus. Etichetele se calculează ÎN card, nu la apelant:
   * un `t(...)` per card în părinte producea string-uri noi la fiecare randare
   * a boardului, deci `memo` n-ar fi oprit nimic.
   */
  t: TasksT;
  assignableIndex: Record<string, AssignableUser>;
  commentCount: number;
  /** Câte subtask-uri are și câte sunt gata; `null` = n-are niciunul. */
  subtasks: { done: number; total: number } | null;
  onOpen: (taskId: string) => void;
  onToggleDone: (task: BoardTask) => void;
  /**
   * Id-ul de drag & drop al ACESTEI apariții a cardului. Cu benzi active, un
   * task cu doi responsabili se randează de două ori: id-uri identice ar face
   * dnd-kit să tragă mereu prima apariție. Identitatea reală a task-ului
   * călătorește prin `data.taskId`, nu prin id.
   */
  instanceId?: string;
}

/*
  `memo`: la o bifă, React re-randa toate cardurile boardului, deși se schimba
  unul singur — la ~300 de carduri, fiecare cu două abonamente dnd-kit, asta
  însemna sute de milisecunde de ecran blocat pe telefon. Prop-urile sunt
  stabile (vezi `openTask`/`toggleDone` din părinte), deci comparația implicită
  e de ajuns.
*/
const KanbanCard = memo(function KanbanCard({
  task,
  listId,
  locale,
  today,
  t,
  assignableIndex,
  commentCount,
  subtasks,
  onOpen,
  onToggleDone,
  instanceId,
}: KanbanCardProps) {
  const dndId = instanceId ?? task.id;
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dndId,
    data: { type: "card", listId, taskId: task.id },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: "card", listId, taskId: task.id },
  });

  const overdue = isOverdue(task, today);
  const isDone = task.status === "done";
  const tags = (task.tags ?? []).slice(0, 2).map(parseTag);
  /* Ce ACȚIUNE face bifa, nu titlul: cititorul de ecran anunța titlul, deci se
     putea marca din greșeală un task ca terminat. */
  const toggleLabel = t(isDone ? "board.card.toggleUndone" : "board.card.toggleDone", {
    title: task.title,
  });
  const subtasksLabel = subtasks ? t("board.card.subtasks", { done: subtasks.done, total: subtasks.total }) : undefined;

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        // Enter deschide task-ul; ORICE altă tastă merge mai departe la
        // `KeyboardSensor` (Space pornește tragerea, săgețile o mută). Fără
        // compunerea asta, `onKeyDown`-ul propriu îl suprascria pe cel din
        // `{...listeners}` — cardul se anunța „draggable" și Space nu făcea nimic.
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(task.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        // `touch-none` e cerut de dnd-kit pe elementul tras: fără el browserul
        // consumă gestul ca scroll și tragerea se anulează.
        "group cursor-grab touch-none rounded-xl border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Bifa oprește `pointerdown`, altfel dnd-kit capturează pointer-ul și
            click-ul simplu nu mai ajunge niciodată la handler. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(task);
          }}
          aria-label={toggleLabel}
          className="mt-0.5 shrink-0 rounded p-1 -m-1 text-muted-foreground transition-colors hover:text-emerald-600"
        >
          {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
        </button>

        <p
          className={cn(
            "min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-snug",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
      </div>

      {(task.task_set || task.source_module !== "manual") && (
        <p className="mt-1 flex items-center gap-1 pl-6 text-[10px] text-muted-foreground">
          <ListChecks className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.task_set || task.source_module}</span>
        </p>
      )}

      {(tags.length > 0 ||
        task.due_date ||
        task.assignees?.length ||
        commentCount > 0 ||
        task.is_recurring ||
        subtasks) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
          {tags.map((tag) => {
            const palette = TAG_COLORS[tag.color] ?? TAG_COLORS.gray;
            return (
              <span
                key={tag.label}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: palette.bg, color: palette.text }}
              >
                {tag.label}
              </span>
            );
          })}

          {task.priority !== "medium" && (
            <span
              className={cn("rounded border px-1 py-0.5 text-[10px] font-medium", PRIORITY_META[task.priority].chip)}
            >
              {task.priority === "urgent" ? "!!" : task.priority === "high" ? "!" : "↓"}
            </span>
          )}

          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px]",
                overdue ? OVERDUE_TEXT : "text-muted-foreground",
              )}
            >
              <CalendarDays className="h-2.5 w-2.5" />
              {format(parseISO(task.due_date), "d MMM", { locale })}
            </span>
          )}

          {task.is_recurring && <RecurrenceBadge rule={task.recurrence_rule} />}

          {/*
            Indicatorul de subtask-uri: „gata/total", nu doar o iconiță. Un card
            care ascunde o listă de nouă pași arată la fel ca unul singular, iar
            singurul mod de a afla era să-l deschizi.
          */}
          {subtasks && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px] tabular-nums",
                subtasks.done === subtasks.total ? "text-emerald-600" : "text-muted-foreground",
              )}
              title={subtasksLabel}
            >
              <ListChecks className="h-2.5 w-2.5" />
              {subtasks.done}/{subtasks.total}
            </span>
          )}

          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-2.5 w-2.5" />
              {commentCount}
            </span>
          )}

          {task.source_module !== "manual" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <ListChecks className="h-2.5 w-2.5" />
              {task.source_module}
            </span>
          )}

          <div className="ml-auto">
            <AssigneeAvatars userIds={task.assignees ?? []} index={assignableIndex} size="xs" max={2} />
          </div>
        </div>
      )}
    </div>
  );
});
