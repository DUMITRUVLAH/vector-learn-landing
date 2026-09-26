// Kanban pe STATUS, pentru vederile care adună task-uri din mai multe boarduri
// („Toate task-urile", „Taskurile mele").
//
// Coloanele unui board sunt definite de utilizator și diferă de la un board la
// altul, deci într-o vedere transversală singura axă comună e statusul. Mutarea
// între coloane schimbă statusul, iar `updateTask` duce cardul și în coloana
// potrivită din boardul lui — sincronizarea se întâmplă acolo, nu aici.

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import { CheckCircle2, Circle, ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTasksT, type TasksT } from "@/lib/tasks/useTasksT";
import { toast } from "@/lib/tasks/toast";
import { Input } from "@/components/tasks/ui";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { AssigneeAvatars } from "@/components/tasks/AssigneeAvatars";
import { useCreateTask, useUpdateTask } from "@/hooks/useTaskBoards";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { isOverdue, todayIso } from "@/lib/tasks/grouping";
import { OVERDUE_TEXT, PRIORITY_META, STATUS_META, boardDotClass } from "@/lib/tasks/meta";
import { TASK_STATUSES } from "@/lib/tasks/types";
import type { AssignableUser, BoardTask, TaskStatus } from "@/lib/tasks/types";

interface StatusKanbanProps {
  tasks: BoardTask[];
  /**
   * Contorul de subtask-uri, calculat de PAGINĂ peste setul NEFILTRAT.
   * Aici ajung doar task-urile de nivel 1 (listele plate ascund subtask-urile),
   * deci derivarea locală ar da mereu zero — de-aia vine ca prop.
   */
  subtaskCounts?: Record<string, { done: number; total: number }>;
  boardNames: Record<string, string>;
  assignableIndex: Record<string, AssignableUser>;
  onOpenTask: (taskId: string) => void;
  /**
   * Cui se atribuie task-urile create direct din coloană. În „Taskurile mele"
   * trebuie să fiu eu — altfel scrii un task și dispare pe loc din vederea în
   * care tocmai l-ai creat, fiindcă nu-ți mai aparține.
   */
  quickAddAssignees?: string[];
  canQuickAdd?: boolean;
}

export function StatusKanban({
  tasks,
  subtaskCounts,
  boardNames,
  assignableIndex,
  onOpenTask,
  quickAddAssignees,
  canQuickAdd = true,
}: StatusKanbanProps) {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const [addingIn, setAddingIn] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // Fără `TouchSensor`, pe telefon browserul consumă gestul ca scroll și emite
  // `pointercancel` — cardurile nu se pot muta cu degetul.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const grouped: Record<TaskStatus, BoardTask[]> = {
      todo: [],
      in_progress: [],
      pending: [],
      done: [],
    };
    for (const task of tasks) {
      if (task.parent_task_id) continue;
      grouped[task.status]?.push(task);
    }
    return grouped;
  }, [tasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const nextStatus = String(over.id).replace("status-", "") as TaskStatus;
    const task = tasks.find((item) => item.id === active.id);
    if (!task || task.status === nextStatus) return;

    updateTask.mutate(
      { id: task.id, patch: { status: nextStatus } },
      {
        onError: (error) => {
          console.error("[tasks] status change", error);
          toast.error(taskErrorMessage(error, t, "board.toast.moveFailed"));
        },
      },
    );
  };

  /**
   * Bifa de pe card = acelaşi lucru cu trasul în coloana „Finalizat", doar că
   * dintr-un click. Debifarea îl întoarce în „De făcut", fiindcă statusul de
   * dinainte nu se mai ştie odată ce task-ul a fost închis.
   */
  const toggleDone = (task: BoardTask) => {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    updateTask.mutate(
      { id: task.id, patch: { status: nextStatus } },
      {
        onError: (error) => {
          console.error("[tasks] toggle done", error);
          toast.error(taskErrorMessage(error, t, "board.toast.saveFailed"));
        },
      },
    );
  };

  const quickAdd = async (status: TaskStatus) => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    setAddingIn(null);
    try {
      // Fără board explicit: serverul îl pune pe boardul implicit al
      // workspace-ului. Vederile astea sunt transversale, n-au un board „curent".
      await createTask.mutateAsync({ title, status, assignees: quickAddAssignees ?? [] });
    } catch (error) {
      console.error("[tasks] status quick add", error);
      toast.error(taskErrorMessage(error, t, "board.toast.saveFailed"));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => (
          <StatusColumn
            key={status}
            status={status}
            label={t(`status.${status}`)}
            count={byStatus[status].length}
            canAdd={canQuickAdd}
            onStartAdd={() => {
              setAddingIn(status);
              setNewTitle("");
            }}
          >
            {byStatus[status].map((task) => (
              <StatusCard
                key={task.id}
                task={task}
                boardName={task.board_id ? boardNames[task.board_id] : undefined}
                overdue={isOverdue(task, today)}
                locale={locale}
                assignableIndex={assignableIndex}
                subtasks={subtaskCounts?.[task.id] ?? null}
                onOpen={() => onOpenTask(task.id)}
                onToggleDone={() => toggleDone(task)}
              />
            ))}

            {canQuickAdd &&
              (addingIn === status ? (
                <div className="rounded-xl border bg-card p-2">
                  <Input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        quickAdd(status);
                      }
                      if (e.key === "Escape") setAddingIn(null);
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
                    setAddingIn(status);
                    setNewTitle("");
                  }}
                  className="flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("board.card.add")}
                </button>
              ))}
          </StatusColumn>
        ))}
      </div>
    </DndContext>
  );
}

interface StatusColumnProps {
  status: TaskStatus;
  label: string;
  count: number;
  canAdd: boolean;
  onStartAdd: () => void;
  children: ReactNode;
}

function StatusColumn({ status, label, count, canAdd, onStartAdd, children }: StatusColumnProps) {
  const { t } = useTasksT();
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/col w-[270px] shrink-0 rounded-2xl p-2",
        STATUS_META[status].columnBg,
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className={cn("rounded-md px-2 py-1 text-[13px] font-semibold", STATUS_META[status].headerChip)}>
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
        <div className="flex-1" />
        {canAdd && (
          <button
            type="button"
            onClick={onStartAdd}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/col:opacity-100"
            aria-label={t("board.card.add")}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {count === 0 && (
        <p className="mb-2 rounded-xl border border-dashed py-6 text-center text-[11px] text-muted-foreground">
          {t("board.dropHere")}
        </p>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface StatusCardProps {
  task: BoardTask;
  boardName?: string;
  overdue: boolean;
  locale: Locale;
  assignableIndex: Record<string, AssignableUser>;
  subtasks?: { done: number; total: number } | null;
  onOpen: () => void;
  onToggleDone: () => void;
}

function StatusCard({
  task,
  boardName,
  overdue,
  locale,
  assignableIndex,
  subtasks,
  onOpen,
  onToggleDone,
}: StatusCardProps) {
  const { t } = useTasksT();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  const isDone = task.status === "done";
  return (
    /*
      Tot cardul e handle de tragere, nu doar titlul: pe un card de 3 rânduri,
      o zonă de apucat cât un rând de text e greu de nimerit. Controalele care
      trebuie să rămână clicabile (bifa, avatarele) opresc `pointerdown`, ca
      dnd-kit să nu le fure click-ul.
    */
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Enter deschide; restul tastelor merg la `KeyboardSensor` (Space
        // pornește tragerea). Fără asta, handler-ul propriu îl suprascria pe
        // cel din `{...listeners}` și cardul „draggable" nu se putea muta.
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        "cursor-grab touch-none rounded-xl border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          aria-pressed={isDone}
          aria-label={task.title}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-emerald-600"
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
        <p className="mt-1 truncate pl-6 text-[10px] text-muted-foreground">{task.task_set || task.source_module}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
        {boardName && task.board_id && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded", boardDotClass(task.board_id))} />
            {boardName}
          </span>
        )}
        {task.priority !== "medium" && (
          <span className={cn("rounded border px-1 py-0.5 text-[10px]", PRIORITY_META[task.priority].chip)}>
            {task.priority === "urgent" ? "!!" : task.priority === "high" ? "!" : "↓"}
          </span>
        )}
        {task.due_date && (
          <span className={cn("text-[10px]", overdue ? OVERDUE_TEXT : "text-muted-foreground")}>
            {format(parseISO(task.due_date), "d MMM", { locale })}
          </span>
        )}
        {subtasks && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] tabular-nums",
              subtasks.done === subtasks.total ? "text-emerald-600" : "text-muted-foreground",
            )}
            title={t("board.card.subtasks", { done: subtasks.done, total: subtasks.total })}
          >
            <ListChecks className="h-2.5 w-2.5" />
            {subtasks.done}/{subtasks.total}
          </span>
        )}
      </div>
      {/*
        Responsabilul pe rândul lui, cu numele scris: două inițiale într-un cerc
        de 20px nu spun cui i-a revenit task-ul — exact confuzia raportată.
        Rândul NU oprește `pointerdown`: avatarele n-au click (doar tooltip la
        hover), iar un `stopPropagation` aici ar tăia din suprafața de tragere
        exact în banda de jos a cardului, unde e cel mai natural să-l apuci.
      */}
      <div className="mt-1.5 flex items-center gap-1.5 pl-6">
        <AssigneeAvatars userIds={task.assignees ?? []} index={assignableIndex} size="xs" max={3} />
        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
          {assigneeLabel(task.assignees ?? [], assignableIndex, t)}
        </span>
      </div>
    </div>
  );
}

/** „Ana Popescu", „Ana Popescu +2" sau „Nimeni alocat". */
function assigneeLabel(ids: string[], index: Record<string, AssignableUser>, t: TasksT): string {
  if (ids.length === 0) return t("board.assignee.placeholder");
  const first = index[ids[0]]?.full_name ?? t("board.detail.unknownUser");
  return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
}
