/**
 * TB-001: View-ul Tabel — suprafața de PLANIFICARE (diferențiatorul față de Trello).
 *
 * Plan-first: adaugi taskuri rapid (rând de adăugare cu Enter, sau „Adaugă în masă"
 * din textarea), fără dată și fără coloană; le programezi ulterior editând inline
 * (status, rol, date, prioritate, listă). Toate editările sunt optimiste + re-sync silent.
 */
import { useState, useMemo, useRef } from "react";
import { Plus, ListPlus, Archive, ArrowUpDown, AlertCircle } from "lucide-react";
import type { BoardList } from "@/lib/api/board";
import type { BoardTask, TaskPatch, TaskStatus, TaskPriority } from "@/lib/api/boardTasks";
import { isOverdue } from "@/lib/board/dates";
import { AddTasksBulkModal } from "./AddTasksBulkModal";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "De făcut" },
  { value: "in_progress", label: "În lucru" },
  { value: "blocked", label: "Blocat" },
  { value: "done", label: "Gata" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Scăzută" },
  { value: "normal", label: "Normală" },
  { value: "high", label: "Ridicată" },
  { value: "urgent", label: "Urgentă" },
];

const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  blocked: "bg-destructive/15 text-destructive",
  done: "bg-success/15 text-success",
};

type SortKey = "position" | "title" | "status" | "dueDate" | "priority";

interface BoardTableViewProps {
  boardId: string;
  lists: BoardList[];
  tasks: BoardTask[];
  onPatch: (taskId: string, patch: TaskPatch) => Promise<void>;
  onCreate: (title: string) => Promise<void>;
  onArchive: (taskId: string) => Promise<void>;
  onRefresh: () => void;
}

export function BoardTableView({
  boardId,
  lists,
  tasks,
  onPatch,
  onCreate,
  onArchive,
  onRefresh,
}: BoardTableViewProps) {
  const [statusFilter, setStatusFilter] = useState<"" | TaskStatus>("");
  const [noDueOnly, setNoDueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortAsc, setSortAsc] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    let rows = tasks;
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter);
    if (noDueOnly) rows = rows.filter((t) => !t.dueDate);
    const dir = sortAsc ? 1 : -1;
    const priorityRank: Record<TaskPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return dir * a.title.localeCompare(b.title, "ro");
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "dueDate":
          // Taskurile fără termen la coadă indiferent de direcție.
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return dir * a.dueDate.localeCompare(b.dueDate);
        case "priority":
          return dir * (priorityRank[a.priority] - priorityRank[b.priority]);
        default:
          return dir * (a.position - b.position);
      }
    });
  }, [tasks, statusFilter, noDueOnly, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await onCreate(title);
      setQuickTitle("");
      // Enter salvează și focusul rămâne pe rândul de adăugare → input rapid ca în Excel.
      quickInputRef.current?.focus();
    } catch {
      setAddError("Nu am putut adăuga taskul. Încearcă din nou.");
    } finally {
      setAdding(false);
    }
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown
        className={cn("h-3 w-3", sortKey === key ? "text-foreground" : "opacity-40")}
        aria-hidden="true"
      />
    </button>
  );

  const inputCls =
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring";
  const selectCls =
    "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-sm text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-4">
      {/* Bara de filtre + acțiuni */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | TaskStatus)}
            aria-label="Filtrează după status"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px]"
          >
            <option value="">Toate</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={noDueOnly}
            onChange={(e) => setNoDueOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          Doar fără termen
        </label>
        <span className="text-xs text-muted-foreground">
          {visible.length} / {tasks.length} taskuri
        </span>
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[40px]"
        >
          <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          Adaugă în masă
        </button>
      </div>

      {/* Grila de planificare */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-3 py-2.5 w-[28%]">{headerBtn("title", "Task")}</th>
              <th className="px-3 py-2.5 w-[11%]">{headerBtn("status", "Status")}</th>
              <th className="px-3 py-2.5 w-[12%]">
                <span className="font-medium text-muted-foreground">Rol</span>
              </th>
              <th className="px-3 py-2.5 w-[12%]">
                <span className="font-medium text-muted-foreground">Start</span>
              </th>
              <th className="px-3 py-2.5 w-[12%]">{headerBtn("dueDate", "Termen")}</th>
              <th className="px-3 py-2.5 w-[10%]">{headerBtn("priority", "Prioritate")}</th>
              <th className="px-3 py-2.5 w-[11%]">
                <span className="font-medium text-muted-foreground">Listă</span>
              </th>
              <th className="px-3 py-2.5 w-[4%]">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-1 py-1">
                  <input
                    type="text"
                    defaultValue={t.title}
                    aria-label={`Titlu task: ${t.title}`}
                    maxLength={300}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.title) void onPatch(t.id, { title: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className={cn(inputCls, t.status === "done" && "line-through text-muted-foreground")}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={t.status}
                    aria-label="Status"
                    onChange={(e) => void onPatch(t.id, { status: e.target.value as TaskStatus })}
                    className={cn(selectCls, "rounded-full text-xs font-medium px-2", STATUS_BADGE[t.status])}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    defaultValue={t.assigneeRole ?? ""}
                    aria-label="Rol responsabil"
                    placeholder="ex. marketing"
                    maxLength={48}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (t.assigneeRole ?? "")) void onPatch(t.id, { assigneeRole: v || null });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className={inputCls}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="date"
                    value={t.startDate ?? ""}
                    aria-label="Data de start"
                    onChange={(e) => void onPatch(t.id, { startDate: e.target.value || null })}
                    className={inputCls}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="date"
                    value={t.dueDate ?? ""}
                    aria-label="Termen"
                    onChange={(e) => void onPatch(t.id, { dueDate: e.target.value || null })}
                    className={cn(inputCls, isOverdue(t.dueDate, t.status) && "text-destructive font-medium")}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={t.priority}
                    aria-label="Prioritate"
                    onChange={(e) => void onPatch(t.id, { priority: e.target.value as TaskPriority })}
                    className={selectCls}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select
                    value={t.listId ?? ""}
                    aria-label="Lista (coloana Kanban)"
                    onChange={(e) => void onPatch(t.id, { listId: e.target.value || null })}
                    className={selectCls}
                  >
                    <option value="">Neîncadrat</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => void onArchive(t.id)}
                    aria-label={`Arhivează taskul ${t.title}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {tasks.length === 0
                    ? "Niciun task încă — adaugă primul mai jos sau folosește „Adaugă în masă”."
                    : "Niciun task nu corespunde filtrelor."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={8} className="px-1 py-1">
                <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
                  <Plus className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    ref={quickInputRef}
                    type="text"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="Adaugă task — Enter salvează și rămâi aici (plan-first, fără dată)"
                    aria-label="Adaugă task nou"
                    maxLength={300}
                    disabled={adding}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring min-h-[44px]"
                  />
                </form>
                {addError && (
                  <p className="flex items-center gap-2 px-3 pb-2 text-sm text-destructive" role="alert">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {addError}
                  </p>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <AddTasksBulkModal
        open={bulkOpen}
        boardId={boardId}
        onClose={() => setBulkOpen(false)}
        onCreated={() => {
          setBulkOpen(false);
          onRefresh();
        }}
      />
    </div>
  );
}
