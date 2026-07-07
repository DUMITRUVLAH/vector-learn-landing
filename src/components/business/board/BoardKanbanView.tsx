/**
 * TB-002: View-ul Kanban — coloane din board_lists (ordonate pe position) + lane
 * sintetic „Neîncadrate" pentru taskurile plan-first (listId null).
 *
 * DnD nativ HTML5 (decizie owner: zero librării noi). Mutarea e optimistă
 * (applyOptimisticMove — aceeași logică de sync ca serverul), apoi POST /move
 * și re-sync silent. Reordonarea în coloană = drop PE un card (inserare înainte).
 */
import { useState, useMemo, useCallback } from "react";
import type { BoardTask } from "@/lib/api/boardTasks";
import type { BoardList } from "@/lib/api/board";
import { dropPosition } from "@/lib/board/optimisticMove";
import { KanbanColumn } from "./KanbanColumn";

interface BoardKanbanViewProps {
  lists: BoardList[];
  tasks: BoardTask[];
  onMove: (taskId: string, listId: string | null, position: number) => Promise<void>;
  onCardClick?: (taskId: string) => void;
}

export function BoardKanbanView({ lists, tasks, onMove, onCardClick }: BoardKanbanViewProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const byList = useMemo(() => {
    const m = new Map<string | null, BoardTask[]>();
    m.set(null, []);
    for (const l of lists) m.set(l.id, []);
    for (const t of tasks) {
      // Listă necunoscută (ștearsă între timp) → tratăm ca „Neîncadrate" până la re-sync.
      const key = t.listId !== null && m.has(t.listId) ? t.listId : null;
      (m.get(key) as BoardTask[]).push(t);
    }
    for (const bucket of m.values()) bucket.sort((a, b) => a.position - b.position);
    return m;
  }, [lists, tasks]);

  // Id-ul taskului tras vine din dataTransfer (sursa de adevăr la drop) — NU din
  // state-ul draggingTaskId, care e doar vizual: un drop procesat înaintea
  // re-render-ului ar vedea un closure stale și mutarea s-ar pierde silențios.
  const handleDrop = useCallback(
    (draggedTaskId: string, targetListId: string | null, beforeTaskId: string | null) => {
      const position = dropPosition(tasks, draggedTaskId, targetListId, beforeTaskId);
      setDraggingTaskId(null);
      void onMove(draggedTaskId, targetListId, position);
    },
    [tasks, onMove]
  );

  const handleDragEnd = useCallback(() => setDraggingTaskId(null), []);

  const unassigned = byList.get(null) ?? [];
  const orderedLists = [...lists].sort((a, b) => a.position - b.position);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" aria-label="Board Kanban">
      {/* Lane sintetic pentru taskurile plan-first (fără coloană încă). */}
      {unassigned.length > 0 || draggingTaskId ? (
        <KanbanColumn
          listId={null}
          name="Neîncadrate"
          wipLimit={null}
          isDoneList={false}
          tasks={unassigned}
          draggingTaskId={draggingTaskId}
          onDragStart={setDraggingTaskId}
          onDragEnd={handleDragEnd}
          onDropTo={handleDrop}
          onCardClick={onCardClick}
        />
      ) : null}
      {orderedLists.map((l) => (
        <KanbanColumn
          key={l.id}
          listId={l.id}
          name={l.name}
          wipLimit={l.wipLimit}
          isDoneList={l.isDoneList}
          tasks={byList.get(l.id) ?? []}
          draggingTaskId={draggingTaskId}
          onDragStart={setDraggingTaskId}
          onDragEnd={handleDragEnd}
          onDropTo={handleDrop}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
