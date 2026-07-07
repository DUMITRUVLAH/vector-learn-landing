/**
 * TB-002: Coloana Kanban — header (nume, contor, badge WIP), corp drop-target.
 * Drop pe corp = mutare la finalul coloanei; drop pe un card = inserare înaintea lui.
 */
import { useState } from "react";
import type { BoardTask } from "@/lib/api/boardTasks";
import { TaskCard } from "./TaskCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  listId: string | null;
  name: string;
  wipLimit: number | null;
  isDoneList: boolean;
  tasks: BoardTask[];
  draggingTaskId: string | null;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  /** (taskId tras — din dataTransfer) → mutare în această listă, opțional înaintea unui card. */
  onDropTo: (draggedTaskId: string, listId: string | null, beforeTaskId: string | null) => void;
  onCardClick?: (taskId: string) => void;
}

export function KanbanColumn({
  listId,
  name,
  wipLimit,
  isDoneList,
  tasks,
  draggingTaskId,
  onDragStart,
  onDragEnd,
  onDropTo,
  onCardClick,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const overWip = wipLimit !== null && tasks.length > wipLimit;

  return (
    <section
      aria-label={`Coloana ${name}, ${tasks.length} taskuri`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card",
        dragOver && "ring-2 ring-ring border-primary/40"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Ieșirea reală din coloană (nu tranzitul peste copii).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId) onDropTo(draggedId, listId, null);
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {name}
          {isDoneList && <span className="sr-only"> (coloană finală)</span>}
        </h3>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              overWip ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
            )}
            title={overWip ? `Peste limita WIP (${wipLimit})` : undefined}
          >
            {tasks.length}
            {wipLimit !== null && ` / ${wipLimit}`}
          </span>
        </div>
      </header>
      <div role="list" aria-label={`Taskuri în ${name}`} className="flex flex-col gap-2 p-2 min-h-[80px] flex-1">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            isDragging={draggingTaskId === t.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropBefore={(draggedId, beforeId) => onDropTo(draggedId, listId, beforeId)}
            onClick={onCardClick}
          />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Trage un card aici
          </p>
        )}
      </div>
    </section>
  );
}
