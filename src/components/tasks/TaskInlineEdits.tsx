// Chip-uri editabile pe loc: click pe status / responsabil / termen /
// prioritate deschide un popover mic, fără să te trimită în panoul de detalii.
// Fiecare chip își face propria mutație, iar React Query invalidează listele.
//
// Toate opresc propagarea (`stop`): trăiesc în interiorul unui rând sau al unei
// celule care are deja `onClick` — fără asta, orice editare ar deschide și
// task-ul pe dedesubt.

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { toast } from "@/lib/tasks/toast";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "@/components/tasks/ui";
import { useAssignableUsers, useUpdateTask } from "@/hooks/useTaskBoards";
import { OVERDUE_TEXT, PRIORITY_META, STATUS_META, avatarClass, initialsOf } from "@/lib/tasks/meta";
import { toDueDateIso, todayIso } from "@/lib/tasks/grouping";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/types";
import type { BoardTask, TaskPriority, TaskStatus } from "@/lib/tasks/types";

/** Oprește propagarea către rândul/celula care ar deschide detaliile. */
const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

/** Popover-urile trăiesc într-un portal; opresc și `pointerdown` ca dnd-kit
 *  să nu creadă că a început o tragere când alegi din listă. */
const stopPointer = { onClick: stop, onKeyDown: stop, onPointerDown: stop };

interface InlineChipProps {
  task: BoardTask;
  className?: string;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export function InlineStatusChip({ task, className }: InlineChipProps) {
  const { t } = useTasksT();
  const [open, setOpen] = useState(false);
  const update = useUpdateTask();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onPointerDown={stop}
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-shadow hover:ring-1 hover:ring-border",
            STATUS_META[task.status].chip,
            className,
          )}
        >
          {t(`status.${task.status}`)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1" {...stopPointer}>
        {TASK_STATUSES.map((status: TaskStatus) => (
          <button
            key={status}
            type="button"
            onClick={(e) => {
              stop(e);
              update.mutate(
                { id: task.id, patch: { status } },
                { onError: () => toast.error(t("board.toast.saveFailed")) },
              );
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
              task.status === status && "bg-muted font-medium",
            )}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_META[status].dot)} />
            {t(`status.${status}`)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Responsabili (multi) ───────────────────────────────────────────────────

interface InlineAssigneesChipProps extends InlineChipProps {
  boardId?: string | null;
}

export function InlineAssigneesChip({ task, boardId, className }: InlineAssigneesChipProps) {
  const { t } = useTasksT();
  const [open, setOpen] = useState(false);
  const { data: people = [] } = useAssignableUsers(boardId ?? task.board_id);
  const update = useUpdateTask();

  const current = task.assignees ?? [];
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.full_name ?? t("board.detail.unknownUser");
  // Un cont dezactivat nu mai primește task-uri; dacă e deja responsabil,
  // rămâne în listă, bifat, ca să poată fi scos.
  const offered = people.filter((p) => p.is_active !== false || current.includes(p.user_id));

  const toggle = (id: string) => {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    update.mutate(
      { id: task.id, patch: { assignees: next } },
      { onError: () => toast.error(t("board.toast.saveFailed")) },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onPointerDown={stop}
          aria-label={t("board.detail.assignees")}
          className={cn("flex shrink-0 -space-x-1.5", className)}
        >
          {current.length === 0 ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-[11px] text-muted-foreground">
              +
            </span>
          ) : (
            current.slice(0, 3).map((id) => (
              <span
                key={id}
                title={nameOf(id)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-card",
                  avatarClass(id),
                )}
              >
                {initialsOf(nameOf(id))}
              </span>
            ))
          )}
          {current.length > 3 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
              +{current.length - 3}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-72 w-60 overflow-y-auto p-1" {...stopPointer}>
        {offered.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{t("board.assignee.empty")}</p>
        ) : (
          offered.map((person) => {
            const picked = current.includes(person.user_id);
            return (
              <button
                key={person.user_id}
                type="button"
                onClick={(e) => {
                  stop(e);
                  toggle(person.user_id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  picked && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                    avatarClass(person.user_id),
                  )}
                >
                  {initialsOf(person.full_name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{person.full_name}</span>
                {picked && <span aria-hidden="true">✓</span>}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Termen ─────────────────────────────────────────────────────────────────

export function InlineDueChip({ task, className }: InlineChipProps) {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const [open, setOpen] = useState(false);
  const update = useUpdateTask();

  const due = task.due_date ? parseISO(task.due_date) : undefined;
  const isDone = task.status === "done";
  // Fără termen e la fel de important ca un termen depășit — de aceea și el roșu.
  const alarming = !isDone && (!task.due_date || task.due_date.slice(0, 10) < todayIso());

  const save = (value: string | null) => {
    update.mutate(
      { id: task.id, patch: { due_date: value } },
      { onError: () => toast.error(t("board.toast.saveFailed")) },
    );
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onPointerDown={stop}
          aria-label={t("board.detail.dueDate")}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-shadow hover:ring-1 hover:ring-border",
            alarming && OVERDUE_TEXT,
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {due ? <span>{format(due, "d MMM", { locale })}</span> : <span>{t("board.detail.noDate")}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0" {...stopPointer}>
        <Calendar
          mode="single"
          selected={due}
          onSelect={(d) => save(d ? toDueDateIso(d) : null)}
          initialFocus
          locale={locale}
        />
        {due && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={(e) => {
                stop(e);
                save(null);
              }}
            >
              {t("board.calendar.clearDue")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Prioritate ─────────────────────────────────────────────────────────────

export function InlinePriorityChip({ task, className }: InlineChipProps) {
  const { t } = useTasksT();
  const [open, setOpen] = useState(false);
  const update = useUpdateTask();
  const current = task.priority;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onPointerDown={stop}
          aria-label={t("board.detail.priority")}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-shadow hover:ring-1 hover:ring-border",
            PRIORITY_META[current].chip,
            className,
          )}
        >
          <Flag className={cn("h-3 w-3", PRIORITY_META[current].flag)} />
          {t(`priority.${current}`)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1" {...stopPointer}>
        {TASK_PRIORITIES.map((priority: TaskPriority) => (
          <button
            key={priority}
            type="button"
            onClick={(e) => {
              stop(e);
              update.mutate(
                { id: task.id, patch: { priority } },
                { onError: () => toast.error(t("board.toast.saveFailed")) },
              );
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
              current === priority && "bg-muted font-medium",
            )}
          >
            <Flag className={cn("h-3 w-3", PRIORITY_META[priority].flag)} />
            {t(`priority.${priority}`)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
