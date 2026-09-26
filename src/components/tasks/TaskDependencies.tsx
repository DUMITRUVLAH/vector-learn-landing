// Dependențele unui task: „nu pot închide asta până nu e gata aia".
//
// Blocarea reală e pe server, nu aici — o verificare doar în client ar fi
// ocolită de orice apel direct la API, iar proiectul de referință exact așa o
// făcea. Componenta asta doar arată starea și explică de ce butonul de
// finalizare nu merge.

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Link2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { toast } from "@/lib/tasks/toast";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { useDependencies, useDependencyMutations, useDependents } from "@/hooks/useTaskBoards";
import type { BoardTask } from "@/lib/tasks/types";

interface TaskDependenciesProps {
  /**
   * Randat în dialogul de task. Popoverul devine `modal`, ca la `AssigneePicker`:
   * altfel `react-remove-scroll` (scroll lock-ul dialogului) blochează rotița pe
   * conținutul portalat în afara dialogului, iar lista de task-uri candidate nu se
   * derulează — se vedeau doar primele opt (raportat 10-09-2026).
   */
  inDialog?: boolean;
  task: BoardTask;
  /** Candidații pentru dependență — task-urile aceluiași board. */
  candidates: BoardTask[];
  canEdit: boolean;
  /** Deschide task-ul legat în același cartonaș. Fără el, rândurile rămân text. */
  onOpenTask?: (taskId: string) => void;
}

export function TaskDependencies({ task, candidates, canEdit, onOpenTask, inDialog = false }: TaskDependenciesProps) {
  const { t } = useTasksT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: deps = [] } = useDependencies([task.id]);
  // Aceeași legătură, citită din partea cealaltă. Vezi `listDependentsOf`.
  const { data: inverse = [] } = useDependents([task.id]);
  const { add, remove } = useDependencyMutations();

  const byId = useMemo(() => {
    const map: Record<string, BoardTask> = {};
    for (const candidate of candidates) map[candidate.id] = candidate;
    return map;
  }, [candidates]);

  const blockers = deps.map((dep) => ({ dep, task: byId[dep.depends_on_task_id] })).filter((row) => !!row.task);
  const unresolved = blockers.filter((row) => row.task.status !== "done");

  /** Cine așteaptă după task-ul ăsta. Aceleași rânduri, celălalt capăt. */
  const dependents = inverse.map((dep) => ({ dep, task: byId[dep.task_id] })).filter((row) => !!row.task);

  const options = useMemo(() => {
    const taken = new Set(deps.map((d) => d.depends_on_task_id));
    const needle = query.trim().toLowerCase();
    return candidates
      .filter(
        (candidate) =>
          candidate.id !== task.id &&
          candidate.parent_task_id !== task.id &&
          !taken.has(candidate.id) &&
          (!needle || candidate.title.toLowerCase().includes(needle)),
      )
      .slice(0, 40);
  }, [candidates, deps, task.id, query]);

  /** Un rând de legătură: stare, titlu (clicabil dacă se poate) și desfacere. */
  const renderRow = (dep: { id: string }, linked: BoardTask) => (
    <div key={dep.id} className="group flex items-center gap-2 text-sm">
      {linked.status === "done" ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <button
        type="button"
        onClick={() => onOpenTask?.(linked.id)}
        disabled={!onOpenTask}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-xs transition-colors",
          onOpenTask && "hover:text-primary hover:underline underline-offset-2",
          linked.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {linked.title}
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={() => remove.mutate(dep.id)}
          // Vizibil și la focus din tastatură, nu doar la hover — altfel Tab ajunge pe un buton invizibil.
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={t("board.deps.remove")}
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-1.5">
      {blockers.length === 0 && <p className="text-xs leading-relaxed text-muted-foreground">{t("board.deps.none")}</p>}

      {blockers.map(({ dep, task: blocker }) => renderRow(dep, blocker))}

      {unresolved.length > 0 && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {t("board.deps.blocked", { count: unresolved.length })}
        </p>
      )}

      {canEdit && (
        <Popover open={open} onOpenChange={setOpen} modal={inDialog}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              {t("board.deps.addDependent")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start" collisionPadding={8}>
            <div className="border-b p-2">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("board.deps.search")}
                aria-label={t("board.deps.search")}
                className="h-8 text-sm"
              />
            </div>
            <div className="max-h-56 overflow-y-auto overscroll-contain p-1">
              {options.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("board.deps.noCandidates")}</p>
              )}
              {options.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    add.mutate(
                      { taskId: task.id, dependsOnId: candidate.id },
                      {
                        onError: (error) => {
                          // Ciclurile le respinge serverul, cu un cod propriu; tradus,
                          // e mai precis decât orice text generic de aici.
                          console.error("[tasks] add dependency", error);
                          toast.error(taskErrorMessage(error, t));
                        },
                      },
                    );
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/10"
                >
                  <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{candidate.title}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/*
        Celălalt capăt al aceleiași legături. Fără el, cine deschidea task-ul
        BLOCANT vedea „niciun task blocator" și nu avea de unde ști că ține pe
        cineva pe loc — legătura exista, dar se vedea doar dintr-o parte.
      */}
      {dependents.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("board.deps.blocksLabel")}
          </p>
          {dependents.map(({ dep, task: dependent }) => renderRow(dep, dependent))}
        </div>
      )}
    </div>
  );
}
