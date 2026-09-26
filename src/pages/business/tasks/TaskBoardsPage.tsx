// Lista de boarduri — punctul de intrare al modulului.
//
// Cine vede un board o decide boardul: doar membrii adăugați (privat), toți
// membrii unei echipe, sau toată organizația. Nimeni nu vede un board privat
// doar fiindcă e din același workspace. Boardul implicit e al întregii
// organizații și nu poate fi arhivat — e casa istorică a task-urilor vechi.
// Task-urile fără board nu ajung aici: rămân personale, la creatorul lor.

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Building2,
  KanbanSquare,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/router/HashRouter";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/tasks/ui";
import {
  useAllTasks,
  useArchiveBoard,
  useArchivedBoards,
  useBoardTaskCount,
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useSelectableTeams,
  useTasksAuth,
  useToggleBoardStar,
  useUnarchiveBoard,
  useUpdateBoard,
} from "@/hooks/useTaskBoards";
import { BOARD_COLORS, boardColorClass } from "@/lib/tasks/meta";
import { progressOf } from "@/lib/tasks/grouping";
import { DEFAULT_LIST_KEYS } from "@/lib/tasks/board-status";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { TASKS_BOARDS, boardPath, useNavigate, useSearchParams } from "@/lib/tasks/router";
import { toast } from "@/lib/tasks/toast";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { BOARD_VISIBILITIES, type BoardVisibility, type TaskBoard } from "@/lib/tasks/types";

/** Câmpurile dialogului de board. `visibility` + `team_id` decid cine îl vede. */
interface BoardForm {
  name: string;
  description: string;
  color: string;
  visibility: BoardVisibility;
  team_id: string | null;
}

// Un board nou pornește privat, ca valoarea implicită din baza de date: îl deschizi
// conștient unei echipe sau organizației, nu îl expui din greșeală.
const EMPTY_FORM: BoardForm = {
  name: "",
  description: "",
  color: "pastel-sky",
  visibility: "private",
  team_id: null,
};

const VISIBILITY_ICONS: Record<BoardVisibility, typeof Lock> = {
  private: Lock,
  team: Users,
  company: Building2,
};

function isVisibility(value: string): value is BoardVisibility {
  return (BOARD_VISIBILITIES as readonly string[]).includes(value);
}

export function TaskBoardsPage() {
  const { t } = useTasksT();
  const { user } = useTasksAuth();
  // Oricine din companie poate crea un board și invita colegi în el — decizie
  // explicită din 2026-08-04, peste presetarea inițială (doar HR+manageri).
  const canCreateBoard = true;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: boards = [], isLoading, isError, refetch } = useBoards();
  const { data: allTasks = [] } = useAllTasks();
  const [showArchived, setShowArchived] = useState(false);
  const { data: archived = [] } = useArchivedBoards(showArchived);

  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const archiveBoard = useArchiveBoard();
  const unarchiveBoard = useUnarchiveBoard();
  const toggleStar = useToggleBoardStar();

  // Ștergerea unui board ia cu el TOATE task-urile lui, deci confirmarea cere
  // scrierea numelui: e singurul gest din modul care nu se poate anula.
  const [deleting, setDeleting] = useState<TaskBoard | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteBoard = useDeleteBoard();
  const { data: deletingTaskCount } = useBoardTaskCount(deleting?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskBoard | null>(null);
  const [form, setForm] = useState<BoardForm>(EMPTY_FORM);
  /** „O echipă" fără echipă aleasă: mesajul apare sub selector abia după „Salvează". */
  const [teamMissing, setTeamMissing] = useState(false);
  // Echipele se cer doar cu dialogul deschis — lista de boarduri nu are nevoie de ele.
  const { data: teams = [], isLoading: teamsLoading } = useSelectableTeams(dialogOpen);

  // Sidebarul deschide dialogul prin `?new=1` — un singur loc de creare.
  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setForm(EMPTY_FORM);
      setTeamMissing(false);
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  /** Progresul fiecărui board, calculat o dată peste tot setul de task-uri. */
  const statsByBoard = useMemo(() => {
    const grouped: Record<string, typeof allTasks> = {};
    for (const task of allTasks) {
      if (!task.board_id) continue;
      (grouped[task.board_id] ??= []).push(task);
    }
    const out: Record<string, ReturnType<typeof progressOf>> = {};
    for (const [boardId, tasks] of Object.entries(grouped)) out[boardId] = progressOf(tasks);
    return out;
  }, [allTasks]);

  const openEdit = (board: TaskBoard) => {
    setEditing(board);
    setForm({
      name: board.name,
      description: board.description ?? "",
      color: board.color ?? "pastel-sky",
      // Boardul implicit e mereu al întregii organizații — selectorul doar o arată.
      visibility: board.is_default ? "company" : (board.visibility ?? "private"),
      team_id: board.team_id ?? null,
    });
    setTeamMissing(false);
    setDialogOpen(true);
  };

  /**
   * Cine vede boardul se alege la creare și se schimbă din „Editează", doar de cine
   * are drept de editare pe el (`can_edit`, calculat de server cu aceeași funcție care
   * decide la scriere). Boardul implicit e spațiul comun al organizației: rămâne
   * `company`, deci controlul lui e doar informativ.
   */
  const showVisibility = !editing || editing.can_edit !== false;
  const visibilityLocked = !!editing?.is_default;
  const showTeamError = teamMissing && form.visibility === "team" && !form.team_id;

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error(t("board.form.nameRequired"));
      return;
    }
    // „O echipă" fără echipă ar lăsa boardul fără cei care trebuiau să-l vadă.
    if (!visibilityLocked && form.visibility === "team" && !form.team_id) {
      setTeamMissing(true);
      toast.error(t("board.form.teamRequired"));
      return;
    }
    // `team_id` are sens doar pentru un board de echipă; la orice altă vizibilitate îl
    // golim, ca o echipă aleasă și apoi abandonată să nu rămână legată de board.
    const access = visibilityLocked
      ? {}
      : { visibility: form.visibility, team_id: form.visibility === "team" ? form.team_id : null };
    try {
      if (editing) {
        await updateBoard.mutateAsync({
          id: editing.id,
          patch: {
            name,
            description: form.description.trim() || null,
            color: form.color,
            ...access,
          },
        });
        toast.success(t("board.toast.updated"));
      } else {
        const created = await createBoard.mutateAsync({
          name,
          description: form.description.trim() || null,
          color: form.color,
          ...access,
          // Coloanele implicite în limba celui care creează boardul. Numele e
          // text liber; statusul pe care îl impun călătorește separat, în
          // `maps_to_status`, ca redenumirea sau traducerea să nu rupă
          // sincronizarea Kanban ↔ status.
          lists: DEFAULT_LIST_KEYS.map((l) => ({
            name: t(l.key),
            is_done_list: l.is_done_list,
            color: l.color,
            maps_to_status: l.maps_to_status,
          })),
        });
        toast.success(t("board.toast.created"));
        setDialogOpen(false);
        // Direct pe boardul nou: primul lucru de făcut acolo e să-i adaugi
        // oamenii, iar butonul „Membri" e în antetul boardului.
        navigate(boardPath(created.id));
        return;
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("[tasks] board save", error);
      toast.error(taskErrorMessage(error, t));
    }
  };

  const handleArchive = async (board: TaskBoard) => {
    try {
      await archiveBoard.mutateAsync(board.id);
      toast.success(t("board.toast.archived"));
    } catch (error) {
      console.error("[tasks] board archive", error);
      toast.error(taskErrorMessage(error, t));
    }
  };

  return (
    <TasksLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.boardsTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("board.boardsSubtitle")}</p>
        </div>
        {canCreateBoard && (
          <Button
            onClick={() => {
              setEditing(null);
              setForm(EMPTY_FORM);
              setTeamMissing(false);
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {t("board.newBoard")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <TaskLoadError onRetry={() => refetch()} />
      ) : boards.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-2xl pastel-lavender p-3">
              <KanbanSquare className="h-6 w-6 text-violet-600" />
            </div>
            <p className="font-medium">{t("board.empty.title")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("board.empty.description")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => {
            const stats = statsByBoard[board.id] ?? { total: 0, done: 0, pct: 0, byStatus: {} };
            const isStarred = (board.starred_by ?? []).includes(user?.id ?? "");
            // Redenumirea (și cine vede boardul) cere drept de editare; `!== false`,
            // ca un răspuns fără câmp să nu ascundă gestul.
            const canEditBoard = board.can_edit !== false;
            // Boardul implicit, fără drept de editare, n-ar avea nimic în meniu.
            const hasActions = canEditBoard || !board.is_default;
            return (
              <Card
                key={board.id}
                className="group relative overflow-hidden rounded-2xl transition-shadow hover:shadow-md"
              >
                <div className={cn("h-1.5 w-full", boardColorClass(board.color))} />
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Link to={boardPath(board.id)} className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold leading-tight hover:underline">{board.name}</h2>
                      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
                        {board.description || t("board.noDescription")}
                      </p>
                    </Link>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => toggleStar.mutate(board)}
                      aria-label={t("board.star")}
                    >
                      <Star
                        className={cn("h-4 w-4", isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
                      />
                    </Button>

                    {hasActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={t("board.actions.menu", {
                              name: board.name,
                            })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditBoard && (
                            <DropdownMenuItem onClick={() => openEdit(board)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              {t("board.actions.rename")}
                            </DropdownMenuItem>
                          )}
                          {/* Boardul implicit ține istoricul task-urilor dinainte de
                              module — arhivat, ar scoate din vedere tot ce e acolo. */}
                          {!board.is_default && (
                            <DropdownMenuItem onClick={() => handleArchive(board)}>
                              <Archive className="mr-2 h-3.5 w-3.5" />
                              {t("board.actions.archive")}
                            </DropdownMenuItem>
                          )}
                          {/*
                            `can_delete` vine de la server, calculat de aceeași funcție
                            care decide și la ștergere: doar `admin` pe board, și
                            niciodată boardul implicit. `!== false` ca frontendul să nu
                            ascundă acțiunea dacă răspunsul nu aduce câmpul.
                            Arhivarea rămâne separată — ea PĂSTREAZĂ task-urile.
                          */}
                          {board.can_delete !== false && !board.is_default && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setDeleting(board);
                                  setDeleteConfirm("");
                                }}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                {t("board.deleteBoard.action")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{t("board.progress", { done: stats.done, total: stats.total })}</span>
                      <span className="font-medium tabular-nums">{stats.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${stats.pct}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? t("board.hideArchived") : t("board.showArchived")}
        </Button>

        {showArchived && (
          <div className="mt-3 space-y-2">
            {archived.length === 0 && <p className="text-sm text-muted-foreground">{t("board.noArchived")}</p>}
            {archived.map((board) => (
              <div key={board.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
                <span className="flex-1 truncate text-sm">{board.name}</span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => unarchiveBoard.mutate(board.id)}>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  {t("board.actions.restore")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("board.form.editTitle") : t("board.form.createTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="board-name">{t("board.form.name")}</Label>
              <Input
                id="board-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("board.form.namePlaceholder")}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="board-description">{t("board.form.description")}</Label>
              <Textarea
                id="board-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("board.form.descriptionPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("board.form.color")}</Label>
              <div className="flex flex-wrap gap-2">
                {BOARD_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, color })}
                    aria-label={color}
                    className={cn(
                      "h-8 w-8 rounded-lg border-2 transition-all",
                      color,
                      form.color === color ? "border-primary scale-110" : "border-transparent",
                    )}
                  />
                ))}
              </div>
            </div>

            {showVisibility && (
              <div className="space-y-1.5">
                <Label htmlFor="board-visibility">{t("board.form.visibility")}</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(value) => {
                    if (isVisibility(value)) setForm({ ...form, visibility: value });
                  }}
                  disabled={visibilityLocked}
                >
                  <SelectTrigger id="board-visibility" aria-describedby="board-visibility-hint">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_VISIBILITIES.map((option) => {
                      const Icon = VISIBILITY_ICONS[option];
                      return (
                        <SelectItem key={option} value={option}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {t(`board.form.visibilityOptions.${option}`)}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p id="board-visibility-hint" className="text-xs text-muted-foreground">
                  {t(`board.form.visibilityHints.${form.visibility}`)}
                </p>
              </div>
            )}

            {showVisibility && !visibilityLocked && form.visibility === "team" && (
              <div className="space-y-1.5">
                <Label htmlFor={teams.length > 0 ? "board-team" : undefined}>{t("board.form.team")}</Label>
                {teamsLoading ? (
                  <p className="text-xs text-muted-foreground">{t("board.loading")}</p>
                ) : teams.length === 0 ? (
                  // Fără echipe, selectorul ar fi o listă goală: spunem de ce și unde se fac.
                  <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                    {t("board.form.noTeams")}{" "}
                    <Link
                      to={`${TASKS_BOARDS}/teams`}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {t("board.nav.teams")}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </p>
                ) : (
                  <Select value={form.team_id ?? ""} onValueChange={(value) => setForm({ ...form, team_id: value })}>
                    <SelectTrigger
                      id="board-team"
                      aria-invalid={showTeamError || undefined}
                      className={cn(showTeamError && "border-destructive")}
                    >
                      <SelectValue placeholder={t("board.form.teamPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Numărul de oameni e consecința alegerii: atâția capătă acces. */}
                      {teams.map((team) => (
                        <SelectItem key={team.team_id} value={team.team_id}>
                          {team.name} · {t("board.form.teamMembers", { count: team.member_count })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {showTeamError && <p className="text-xs text-destructive">{t("board.form.teamRequired")}</p>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("board.actions.cancel")}
            </Button>
            <Button onClick={submit} disabled={createBoard.isPending || updateBoard.isPending || !form.name.trim()}>
              {(createBoard.isPending || updateBoard.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("board.actions.save") : t("board.actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/*
        Confirmarea cere numele scris de mână. Nu e ceremonie: boardul dispare cu
        tot cu task-uri, iar din interfață nu există cale de întoarcere — spre
        deosebire de ștergerea unui singur task, care are „Anulează" în toast.
      */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("board.deleteBoard.title", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {deletingTaskCount === undefined
                ? t("board.loading")
                : t("board.deleteBoard.description", { count: deletingTaskCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete-board" className="text-xs">
              {t("board.deleteBoard.confirmLabel", { name: deleting?.name ?? "" })}
            </Label>
            <Input
              id="confirm-delete-board"
              autoComplete="off"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={deleting?.name ?? ""}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("board.actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!deleting || deleteConfirm.trim() !== deleting.name || deleteBoard.isPending}
              onClick={() => {
                const target = deleting;
                if (!target) return;
                deleteBoard.mutate(target.id, {
                  onSuccess: (closed) => {
                    setDeleting(null);
                    toast.success(t("board.deleteBoard.done", { name: target.name, count: closed }));
                  },
                  onError: (error) => {
                    console.error("[tasks] delete board", error);
                    // Serverul întoarce un cod (`forbidden`…), nu o propoziție: îl traducem.
                    toast.error(taskErrorMessage(error, t));
                  },
                });
              }}
            >
              {deleteBoard.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("board.deleteBoard.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TasksLayout>
  );
}
