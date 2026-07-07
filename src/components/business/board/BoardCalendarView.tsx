/**
 * TB-003: View-ul Calendar — grilă lunară 6×7 (Date nativ + Intl, fără librării),
 * chips pentru taskurile cu termen în luna vizibilă + rail „Fără termen".
 *
 * Programare prin drag: tragi un task din rail (sau dintr-o zi) și îl lași pe o zi
 * → i se setează dueDate (PATCH optimist prin onPatch). Id-ul călătorește prin
 * dataTransfer — aceeași lecție anti-closure-stale ca în Kanban (TB-002).
 */
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import type { BoardTask, TaskPatch } from "@/lib/api/boardTasks";
import { buildMonthGrid, monthLabelRo, shiftMonth, todayIso, isOverdue } from "@/lib/board/dates";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<BoardTask["status"], string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  blocked: "bg-destructive/15 text-destructive",
  done: "bg-success/15 text-success line-through",
};

const WEEKDAYS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

interface BoardCalendarViewProps {
  tasks: BoardTask[];
  onPatch: (taskId: string, patch: TaskPatch) => Promise<void>;
  /** TB-005: click pe chip → deschide dialogul de detalii al cardului. */
  onCardClick?: (taskId: string) => void;
}

export function BoardCalendarView({ tasks, onPatch, onCardClick }: BoardCalendarViewProps) {
  const today = todayIso();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDay = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const bucket = m.get(t.dueDate);
      if (bucket) bucket.push(t);
      else m.set(t.dueDate, [t]);
    }
    return m;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.dueDate), [tasks]);

  function nav(delta: number) {
    const [y, m] = shiftMonth(year, month, delta);
    setYear(y);
    setMonth(m);
  }

  function handleDropOnDay(e: React.DragEvent, iso: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) void onPatch(taskId, { dueDate: iso });
  }

  const chip = (t: BoardTask) => (
    <button
      key={t.id}
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
      }}
      onClick={() => onCardClick?.(t.id)}
      title={t.title}
      className={cn(
        "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium cursor-grab active:cursor-grabbing",
        STATUS_CHIP[t.status],
        isOverdue(t.dueDate, t.status) && "ring-1 ring-destructive"
      )}
    >
      {t.title}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1 min-w-0">
        {/* Navigare lună */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground capitalize">
            {monthLabelRo(year, month)}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => nav(-1)}
              aria-label="Luna anterioară"
              className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setYear(Number(today.slice(0, 4)));
                setMonth(Number(today.slice(5, 7)));
              }}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[40px]"
            >
              Azi
            </button>
            <button
              type="button"
              onClick={() => nav(1)}
              aria-label="Luna următoare"
              className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Grila 6×7 */}
        <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border overflow-hidden">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-muted/60 px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
          {grid.map((cell) => {
            const dayTasks = byDay.get(cell.iso) ?? [];
            const isToday = cell.iso === today;
            return (
              <div
                key={cell.iso}
                data-iso={cell.iso}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => handleDropOnDay(e, cell.iso)}
                className={cn(
                  "min-h-[84px] bg-card p-1.5 flex flex-col gap-1",
                  !cell.inMonth && "bg-muted/30"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    isToday
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : cell.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  )}
                >
                  {cell.day}
                </span>
                {dayTasks.slice(0, 3).map(chip)}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 3} altele</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Trage un task pe o zi ca să-i setezi termenul.
        </p>
      </div>

      {/* Rail „Fără termen" — backlogul de programat */}
      <aside
        aria-label="Taskuri fără termen"
        className="w-full lg:w-64 shrink-0 rounded-lg border border-border bg-card p-3"
      >
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Fără termen ({unscheduled.length})
        </h4>
        {unscheduled.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Totul e programat — niciun task fără termen.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">{unscheduled.map(chip)}</div>
        )}
      </aside>
    </div>
  );
}
