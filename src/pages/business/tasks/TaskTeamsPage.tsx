// Echipele workspace-ului — aceleași pe care le folosește PAR.
//
// O echipă deschide boardurile ei tuturor membrilor: un board cu vizibilitatea
// „O echipă" nu mai cere adăugarea fiecărui om pe rând, iar cine intră în echipă
// le vede imediat. Echipele le administrează doar administratorul organizației —
// ele decid și cine vede cererile cui în PAR —, ceilalți văd cine e în ce echipă
// și ce boarduri deschide fiecare.
//
// Sursa din HR365 avea echipele în baza de date, dar nu și în interfață. Pagina e
// nouă, în limbajul vizual al listei de boarduri: același antet, aceeași grilă de
// carduri cu accent pastel, aceleași dialoguri.

import { useMemo, useState } from "react";
import {
  Check,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "@/router/HashRouter";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import { TaskLoadError } from "@/components/tasks/TaskLoadError";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/tasks/ui";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useAssignableUsers, useBoards, useTasksAuth, useTeamMutations, useTeams } from "@/hooks/useTaskBoards";
import { searchKey } from "@/lib/tasks/filters";
import { BOARD_COLORS, avatarClass, boardColorClass, boardDotClass, initialsOf } from "@/lib/tasks/meta";
import { TASKS_BOARDS } from "@/lib/tasks/router";
import { toast } from "@/lib/tasks/toast";
import { useTasksT, type TasksT } from "@/lib/tasks/useTasksT";
import type { AssignableUser, TaskBoard, WorkspaceTeam } from "@/lib/tasks/types";

/** Aceeași regulă ca pe server: un nume de echipă are cel puțin două caractere. */
const MIN_TEAM_NAME = 2;
const MAX_TEAM_NAME = 200;

/** Numele dublat are mesajul lui; orice alt refuz, mesajul generic. */
function teamErrorMessage(error: unknown, t: TasksT): string {
  if (error instanceof ApiError && error.status === 409 && error.code === "duplicate_name") {
    return t("board.teams.toast.duplicate");
  }
  return t("board.teams.toast.failed");
}

/** Accentul pastel al unei echipe — derivat stabil din id, ca echipa să-și păstreze culoarea. */
function teamAccent(teamId: string): string {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return boardColorClass(BOARD_COLORS[h % BOARD_COLORS.length]);
}

/** Numele de afișat al unui membru: numele, altfel emailul, altfel „Utilizator". */
function memberName(member: WorkspaceTeam["members"][number], t: TasksT): string {
  return member.name ?? member.email ?? t("board.detail.unknownUser");
}

export function TaskTeamsPage() {
  const { t } = useTasksT();
  const { user, isHRAdmin, isLoading: authLoading } = useTasksAuth();
  // Echipele decid cine vede ce în tot produsul (boarduri, cereri PAR), deci le
  // schimbă doar administratorul organizației. Ceilalți le văd, fără butoane.
  const isAdmin = isHRAdmin;

  const { data: teams = [], isLoading, isError, refetch } = useTeams();
  const { data: boards = [] } = useBoards();
  const { data: people = [] } = useAssignableUsers();
  const { create, remove } = useTeamMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<WorkspaceTeam | null>(null);

  /** Doar oamenii activi pot intra într-o echipă; ordinea alfabetică ușurează căutarea din ochi. */
  const activePeople = useMemo(
    () => people.filter((person) => person.is_active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [people],
  );

  /** Boardurile pe care le deschide fiecare echipă (din cele pe care le văd eu). */
  const boardsByTeam = useMemo(() => {
    const out: Record<string, TaskBoard[]> = {};
    for (const board of boards) {
      if (board.visibility !== "team" || !board.team_id) continue;
      (out[board.team_id] ??= []).push(board);
    }
    return out;
  }, [boards]);

  // Echipele active întâi; în fiecare grup rămâne ordinea alfabetică de la server.
  const ordered = useMemo(() => [...teams].sort((a, b) => Number(b.active) - Number(a.active)), [teams]);

  const openCreate = () => {
    setNewName("");
    setNewMembers([]);
    setCreateOpen(true);
  };

  const toggleNewMember = (userId: string) => {
    setNewMembers((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (name.length < MIN_TEAM_NAME || create.isPending) return;
    create.mutate(
      { name, userIds: newMembers },
      {
        onSuccess: () => {
          toast.success(t("board.teams.toast.created"));
          setCreateOpen(false);
        },
        onError: (error) => {
          console.error("[tasks] create team", error);
          toast.error(teamErrorMessage(error, t));
        },
      },
    );
  };

  return (
    <TasksLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.teams.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("board.teams.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("board.teams.new")}
          </Button>
        )}
      </div>

      <div className="mb-6 flex items-start gap-2.5 rounded-xl pastel-sky px-4 py-3 text-xs leading-relaxed text-pastel-sky-fg">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>{t("board.teams.sharedNote")}</p>
          {/* Cât se încarcă identitatea nu știm încă dacă omul e administrator. */}
          {!isAdmin && !authLoading && <p className="font-medium">{t("board.teams.readOnly")}</p>}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <TaskLoadError onRetry={() => refetch()} />
      ) : teams.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-2xl pastel-lavender p-3">
              <Users className="h-6 w-6 text-pastel-lavender-fg" aria-hidden="true" />
            </div>
            <p className="font-medium">{t("board.teams.empty.title")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("board.teams.empty.description")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              boards={boardsByTeam[team.id] ?? []}
              people={activePeople}
              currentUserId={user?.id}
              isAdmin={isAdmin}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("board.teams.new")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">{t("board.teams.name")}</Label>
              <Input
                id="team-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
                placeholder={t("board.teams.namePlaceholder")}
                maxLength={MAX_TEAM_NAME}
                autoFocus
              />
            </div>

            {/* Opțional: echipa poate porni direct cu oamenii ei, fără un al doilea pas. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p id="team-initial-members" className="text-sm font-medium leading-none">
                  {t("board.teams.initialMembers")}
                </p>
                {newMembers.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{newMembers.length}</span>
                )}
              </div>
              <div role="group" aria-labelledby="team-initial-members" className="overflow-hidden rounded-md border">
                <PeopleSearchList
                  people={activePeople}
                  allAlreadyIn={false}
                  selected={newMembers}
                  onPick={toggleNewMember}
                  listClassName="max-h-48"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("board.teams.cancel")}
            </Button>
            <Button onClick={submitCreate} disabled={create.isPending || newName.trim().length < MIN_TEAM_NAME}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("board.teams.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Ștergerea nu atinge boardurile și nici oamenii: boardurile echipei rămân, doar
        că nu se mai deschid singure membrilor. Dialogul se închide abia după răspunsul
        serverului, ca un refuz să se vadă lângă gestul care l-a produs.
      */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("board.teams.deleteTitle", { name: deleting?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("board.teams.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("board.teams.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                const target = deleting;
                if (!target) return;
                remove.mutate(target.id, {
                  onSuccess: () => {
                    setDeleting(null);
                    toast.success(t("board.teams.toast.deleted"));
                  },
                  onError: (error) => {
                    console.error("[tasks] delete team", error);
                    toast.error(teamErrorMessage(error, t));
                  },
                });
              }}
            >
              {remove.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("board.teams.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TasksLayout>
  );
}

interface TeamCardProps {
  team: WorkspaceTeam;
  /** Boardurile deschise de echipă (`visibility = 'team'`), dintre cele vizibile mie. */
  boards: TaskBoard[];
  /** Oamenii activi ai workspace-ului — candidații la „Adaugă membru". */
  people: AssignableUser[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  onDelete: (team: WorkspaceTeam) => void;
}

function TeamCard({ team, boards, people, currentUserId, isAdmin, onDelete }: TeamCardProps) {
  const { t } = useTasksT();
  const { update, addMember, removeMember } = useTeamMutations();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(team.name);

  const startRename = () => {
    setDraft(team.name);
    setRenaming(true);
  };

  const saveName = () => {
    const name = draft.trim();
    if (name.length < MIN_TEAM_NAME || update.isPending) return;
    if (name === team.name) {
      setRenaming(false);
      return;
    }
    update.mutate(
      { id: team.id, patch: { name } },
      {
        onSuccess: () => {
          toast.success(t("board.teams.toast.updated"));
          setRenaming(false);
        },
        onError: (error) => {
          console.error("[tasks] rename team", error);
          toast.error(teamErrorMessage(error, t));
        },
      },
    );
  };

  // O echipă inactivă nu mai deschide boardurile ei și dispare din selectoare —
  // reversibil, spre deosebire de ștergere.
  const toggleActive = () => {
    update.mutate(
      { id: team.id, patch: { active: !team.active } },
      {
        onSuccess: () => toast.success(t("board.teams.toast.updated")),
        onError: (error) => {
          console.error("[tasks] toggle team", error);
          toast.error(teamErrorMessage(error, t));
        },
      },
    );
  };

  const handleRemove = (userId: string) => {
    removeMember.mutate(
      { teamId: team.id, userId },
      {
        onSuccess: () => toast.success(t("board.teams.toast.memberRemoved")),
        onError: (error) => {
          console.error("[tasks] remove team member", error);
          toast.error(teamErrorMessage(error, t));
        },
      },
    );
  };

  const handleAdd = (userId: string, onFailed: () => void) => {
    addMember.mutate(
      { teamId: team.id, userId },
      {
        onSuccess: () => toast.success(t("board.teams.toast.memberAdded")),
        onError: (error) => {
          console.error("[tasks] add team member", error);
          onFailed();
          toast.error(teamErrorMessage(error, t));
        },
      },
    );
  };

  return (
    <Card className="group relative flex flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-md">
      <div className={cn("h-1.5 w-full", team.active ? teamAccent(team.id) : "bg-muted")} />
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          {renaming ? (
            <form
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                saveName();
              }}
            >
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setRenaming(false);
                  }
                }}
                maxLength={MAX_TEAM_NAME}
                aria-label={t("board.teams.name")}
                className="h-8 min-w-0 flex-1 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8"
                disabled={draft.trim().length < MIN_TEAM_NAME || update.isPending}
              >
                {t("board.teams.save")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setRenaming(false)}>
                {t("board.teams.cancel")}
              </Button>
            </form>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-semibold leading-tight">{team.name}</h2>
                {!team.active && (
                  <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("board.teams.inactive")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("board.teams.members", { count: team.members.length })}
                {" · "}
                {t("board.teams.boards", { count: boards.length })}
              </p>
            </div>
          )}

          {isAdmin && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={t("board.teams.menu", {
                    name: team.name,
                  })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={startRename}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {t("board.teams.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleActive}>
                  {team.active ? <PowerOff className="mr-2 h-3.5 w-3.5" /> : <Power className="mr-2 h-3.5 w-3.5" />}
                  {team.active ? t("board.teams.deactivate") : t("board.teams.activate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(team)}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {t("board.teams.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Textul, nu un tooltip: pe telefon n-ai peste ce să treci cu mouse-ul. */}
        {!team.active && (
          <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
            {t("board.teams.inactiveHint")}
          </p>
        )}

        <ul
          className="mt-3 max-h-56 space-y-0.5 overflow-y-auto"
          aria-label={t("board.teams.members", { count: team.members.length })}
        >
          {team.members.length === 0 && (
            <li className="py-2 text-xs text-muted-foreground">{t("board.teams.noMembers")}</li>
          )}
          {team.members.map((member) => {
            const name = memberName(member, t);
            const isMe = member.user_id === currentUserId;
            const removing = removeMember.isPending && removeMember.variables?.userId === member.user_id;
            return (
              <li key={member.user_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    avatarClass(member.user_id),
                  )}
                >
                  {initialsOf(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {name}
                    {isMe && <span className="text-muted-foreground"> · {t("board.teams.you")}</span>}
                  </p>
                  {member.name && member.email && (
                    <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  )}
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(member.user_id)}
                    disabled={removing}
                    aria-label={t("board.teams.removeMember", { name })}
                  >
                    {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {boards.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("board.teams.openBoards")}
            </p>
            <ul className="space-y-0.5">
              {boards.map((board) => (
                <li key={board.id}>
                  <Link
                    to={`${TASKS_BOARDS}/${board.id}`}
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs transition-colors hover:bg-muted"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded", boardDotClass(board.id))} aria-hidden="true" />
                    <span className="truncate">{board.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdmin && (
          <div className="mt-auto pt-3">
            <AddMemberPicker team={team} people={people} onAdd={handleAdd} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AddMemberPickerProps {
  team: WorkspaceTeam;
  people: AssignableUser[];
  /** Adaugă omul; `onFailed` îl readuce în listă dacă serverul refuză. */
  onAdd: (userId: string, onFailed: () => void) => void;
}

/**
 * „Adaugă membru": o listă cu căutare, ca selectorul de responsabili. Rămâne deschisă
 * după o alegere — o echipă se compune din mai mulți oameni deodată —, iar cine tocmai
 * a fost adăugat dispare din listă imediat, nu abia după reîncărcare, ca un al doilea
 * clic să nu-l trimită de două ori.
 */
function AddMemberPicker({ team, people, onAdd }: AddMemberPickerProps) {
  const { t } = useTasksT();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const candidates = useMemo(() => {
    const inTeam = new Set(team.members.map((member) => member.user_id));
    return people.filter((person) => !inTeam.has(person.user_id) && !justAdded.includes(person.user_id));
  }, [people, team.members, justAdded]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setJustAdded([]);
  };

  const pick = (userId: string) => {
    setJustAdded((ids) => [...ids, userId]);
    onAdd(userId, () => setJustAdded((ids) => ids.filter((id) => id !== userId)));
  };

  const trigger = (
    <Button variant="outline" size="sm" className="w-full gap-1.5">
      <UserPlus className="h-3.5 w-3.5" />
      {t("board.teams.addMember")}
    </Button>
  );

  const body = (
    <PeopleSearchList
      people={candidates}
      allAlreadyIn={people.length > 0}
      onPick={pick}
      autoFocus={!isPhone}
      listClassName={isPhone ? "min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]" : "max-h-64"}
    />
  );

  /*
    Pe telefon lista nu e popover: sub buton nu are loc, iar tastatura deschisă de
    câmpul de căutare ar acoperi restul. Într-un panou de jos, căutarea rămâne sus și
    vizibilă, iar lista are înălțimea ei — aceeași soluție ca selectorul de responsabili.
  */
  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="z-[80] flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetTitle className="sr-only">{t("board.teams.addMember")}</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" collisionPadding={8}>
        {body}
      </PopoverContent>
    </Popover>
  );
}

interface PeopleSearchListProps {
  /** Oamenii din care se alege. */
  people: AssignableUser[];
  /**
   * Lista e goală fiindcă toți colegii sunt deja în echipă (nu fiindcă n-ar exista
   * colegi) — schimbă mesajul, ca omul să nu caute degeaba.
   */
  allAlreadyIn: boolean;
  /** Cu `selected`, rândurile devin comutatoare (bifă + `aria-pressed`). */
  selected?: string[];
  onPick: (userId: string) => void;
  autoFocus?: boolean;
  listClassName?: string;
}

/** Căutarea + lista de colegi, comună pentru „Adaugă membru" și dialogul de echipă nouă. */
function PeopleSearchList({
  people,
  allAlreadyIn,
  selected,
  onPick,
  autoFocus = false,
  listClassName,
}: PeopleSearchListProps) {
  const { t } = useTasksT();
  const [query, setQuery] = useState("");

  // Fără diacritice: „stefan" îl găsește și pe „Ștefan".
  const filtered = useMemo(() => {
    const needle = searchKey(query.trim());
    if (!needle) return people;
    return people.filter((person) =>
      searchKey(`${person.full_name} ${person.email ?? ""} ${person.job_title ?? ""}`).includes(needle),
    );
  }, [people, query]);

  return (
    <>
      <div className="border-b p-2">
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("board.teams.searchPeople")}
          aria-label={t("board.teams.searchPeople")}
          className="h-8 text-sm"
        />
      </div>
      <div className={cn("overflow-y-auto overscroll-contain p-1", listClassName)}>
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {people.length === 0 && allAlreadyIn ? t("board.teams.alreadyAll") : t("board.teams.noPeople")}
          </p>
        )}
        {filtered.map((person) => {
          const isSelected = selected?.includes(person.user_id) ?? false;
          const detail = person.job_title ?? person.email;
          return (
            <button
              key={person.user_id}
              type="button"
              onClick={() => onPick(person.user_id)}
              aria-pressed={selected ? isSelected : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                isSelected && "bg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  avatarClass(person.user_id),
                )}
              >
                {initialsOf(person.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{person.full_name}</span>
                {detail && <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>}
              </span>
              {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
