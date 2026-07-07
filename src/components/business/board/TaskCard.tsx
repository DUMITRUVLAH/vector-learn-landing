/**
 * TB-002: Cardul Kanban — title, rol, pastilă termen (roșu = depășit), prioritate.
 * Draggable nativ HTML5; e și drop-target ca să permită inserarea ÎNAINTEA lui
 * (reordonare în coloană).
 */
import { CalendarDays, User } from "lucide-react";
import type { BoardTask } from "@/lib/api/boardTasks";
import { isOverdue, formatDateRo } from "@/lib/board/dates";
import { cn } from "@/lib/utils";

const PRIORITY_ACCENT: Record<BoardTask["priority"], string> = {
  low: "border-l-muted-foreground/30",
  normal: "border-l-transparent",
  high: "border-l-warning",
  urgent: "border-l-destructive",
};

interface TaskCardProps {
  task: BoardTask;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  /** (taskId tras — citit din dataTransfer, nu din state) → inserare înaintea acestui card. */
  onDropBefore: (draggedTaskId: string, beforeTaskId: string) => void;
  onClick?: (taskId: string) => void;
  isDragging: boolean;
}

export function TaskCard({ task, onDragStart, onDragEnd, onDropBefore, onClick, isDragging }: TaskCardProps) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div
      draggable
      role="listitem"
      aria-label={`Task: ${task.title}`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Id-ul călătorește prin dataTransfer — sursa de adevăr la drop. State-ul React
        // (onDragStart) e doar pentru stilizare; un drop sosit înaintea re-render-ului
        // ar citi un closure stale, deci NU ne bazăm pe el pentru mutare.
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        // Permite drop PE card = inserare înaintea lui.
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== task.id) onDropBefore(draggedId, task.id);
      }}
      onClick={() => onClick?.(task.id)}
      className={cn(
        "rounded-md border border-border border-l-4 bg-background p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow select-none",
        PRIORITY_ACCENT[task.priority],
        isDragging && "opacity-40",
        task.status === "done" && "opacity-70"
      )}
    >
      <p
        className={cn(
          "text-sm font-medium text-foreground leading-snug",
          task.status === "done" && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </p>
      {(task.dueDate || task.assigneeRole) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                overdue ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
              )}
            >
              <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
              {formatDateRo(task.dueDate)}
            </span>
          )}
          {task.assigneeRole && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              {task.assigneeRole}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
