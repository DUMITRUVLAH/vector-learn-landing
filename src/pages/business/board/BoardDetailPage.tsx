/**
 * TB-001: TaskBoard — pagina unui board, cu view switcher (Tabel · Kanban · Calendar · Prezentare).
 * Faza 1 livrează view-ul Tabel (plan-first); Kanban/Calendar/Prezentare vin în fazele 2/3/6.
 *
 * Id-ul boardului se parsează ROUTE-AGNOSTIC (match pe /board/<uuid>, nu strip de prefix fix) —
 * lecția PAR-detail http_404 din CLAUDE.md §3.5.1quater: un prefix mutat nu are voie să rupă parsarea.
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Table2, KanbanSquare, Calendar, BarChart3, Package } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter, Link } from "@/router/HashRouter";
import { getBoard, type Board, type BoardList, type BoardLabel } from "@/lib/api/board";
import { listTasks, patchTask, createTask, archiveTask, moveTask, type BoardTask, type TaskPatch } from "@/lib/api/boardTasks";
import { BoardTableView } from "@/components/business/board/BoardTableView";
import { BoardKanbanView } from "@/components/business/board/BoardKanbanView";
import { BoardCalendarView } from "@/components/business/board/BoardCalendarView";
import { TaskDetailDialog } from "@/components/business/board/TaskDetailDialog";
import { BoardOverview } from "@/components/business/board/BoardOverview";
import { getBoardOverview, type ProductOverview } from "@/lib/api/boardOverview";
import { applyOptimisticMove } from "@/lib/board/optimisticMove";
import { cn } from "@/lib/utils";

type BoardView = "table" | "kanban" | "calendar" | "overview";

const VIEW_TABS: { key: BoardView; label: string; icon: typeof Table2; ready: boolean }[] = [
  { key: "table", label: "Tabel", icon: Table2, ready: true },
  { key: "kanban", label: "Kanban", icon: KanbanSquare, ready: true },
  { key: "calendar", label: "Calendar", icon: Calendar, ready: true },
  { key: "overview", label: "Prezentare", icon: BarChart3, ready: true },
];

const UUID_IN_PATH = /\/board\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function BoardDetailPage() {
  const { path } = useRouter();
  const boardId = path.match(UUID_IN_PATH)?.[1] ?? "";

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<BoardList[]>([]);
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<BoardView>("table");
  /** TB-005: cardul deschis în dialogul de detalii. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /** TB-006: datele tab-ului Prezentare (scoped pe produsul boardului, dacă are). */
  const [overview, setOverview] = useState<ProductOverview[] | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!boardId) return;
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const [boardRes, tasksRes] = await Promise.all([
          getBoard(boardId),
          listTasks({ boardId }),
        ]);
        setBoard(boardRes.board);
        setLists(boardRes.lists);
        setLabels(boardRes.labels);
        setTasks(tasksRes.tasks);
      } catch {
        setError("Eroare la încărcarea boardului. Încearcă din nou.");
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [boardId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // TB-006: încarcă prezentarea când tab-ul devine activ (scoped pe produsul boardului).
  useEffect(() => {
    if (view !== "overview" || !board) return;
    let cancelled = false;
    getBoardOverview(board.productId ?? undefined)
      .then((res) => {
        if (!cancelled) setOverview(res.overview);
      })
      .catch(() => {
        if (!cancelled) setError("Eroare la încărcarea prezentării.");
      });
    return () => {
      cancelled = true;
    };
  }, [view, board, tasks]);

  /** Editare inline optimistă: update local imediat, PATCH pe server, re-sync silent. */
  const handlePatch = useCallback(
    async (taskId: string, patch: TaskPatch) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } as BoardTask : t)));
      try {
        await patchTask(taskId, patch);
      } catch {
        setError("Nu am putut salva modificarea — reîncarc datele.");
      } finally {
        void load({ silent: true });
      }
    },
    [load]
  );

  const handleCreate = useCallback(
    async (title: string) => {
      await createTask({ boardId, title });
      await load({ silent: true });
    },
    [boardId, load]
  );

  const handleArchive = useCallback(
    async (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      try {
        await archiveTask(taskId);
      } finally {
        void load({ silent: true });
      }
    },
    [load]
  );

  /** TB-002: mutarea Kanban — optimist local (aceeași logică de sync ca serverul), apoi API. */
  const handleMove = useCallback(
    async (taskId: string, listId: string | null, position: number) => {
      setTasks((prev) => applyOptimisticMove(prev, taskId, listId, position, lists));
      try {
        await moveTask(taskId, { listId, position });
      } catch {
        setError("Nu am putut muta taskul — reîncarc datele.");
      } finally {
        void load({ silent: true });
      }
    },
    [lists, load]
  );

  if (!boardId) {
    return (
      <BusinessShell pageTitle="Task Board" pageDescription="">
        <p className="flex items-center gap-2 py-8 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Board inexistent.{" "}
          <Link to="/business/board" className="underline text-foreground">
            Înapoi la boarduri
          </Link>
        </p>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell
      pageTitle={board?.name ?? "Task Board"}
      pageDescription={board?.description ?? "Planifică în Tabel, vizualizează în Kanban și Calendar."}
      actions={
        <nav aria-label="Mod de vizualizare" className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => tab.ready && setView(tab.key)}
                disabled={!tab.ready}
                aria-pressed={view === tab.key}
                title={tab.ready ? tab.label : `${tab.label} — în curând`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[40px]",
                  view === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  !tab.ready && "opacity-40 cursor-not-allowed hover:bg-transparent"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : error && !board ? (
        <p className="flex items-center gap-2 py-8 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : board ? (
        <>
          {board.productId && (
            <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Board legat de produs — taskurile contribuie la progresul produsului.
            </p>
          )}
          {error && (
            <p className="mb-4 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {view === "table" && (
            <BoardTableView
              boardId={board.id}
              lists={lists}
              tasks={tasks}
              onPatch={handlePatch}
              onCreate={handleCreate}
              onArchive={handleArchive}
              onRefresh={() => load({ silent: true })}
            />
          )}
          {view === "kanban" && (
            <BoardKanbanView
              lists={lists}
              labels={labels}
              tasks={tasks}
              onMove={handleMove}
              onCardClick={setOpenTaskId}
            />
          )}
          {view === "calendar" && (
            <BoardCalendarView tasks={tasks} onPatch={handlePatch} onCardClick={setOpenTaskId} />
          )}
          {view === "overview" &&
            (overview === null ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
              </div>
            ) : (
              <BoardOverview overview={overview} />
            ))}
          <TaskDetailDialog
            taskId={openTaskId}
            boardLabels={labels}
            onClose={() => setOpenTaskId(null)}
            onChanged={() => void load({ silent: true })}
          />
        </>
      ) : null}
    </BusinessShell>
  );
}
