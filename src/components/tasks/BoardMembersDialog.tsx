// Membrii unui board.
//
// Accesul nominal e explicit pe ORICE board: viewer (citește), editor (scrie),
// admin (schimbă membrii). Membrul nominal bate mereu accesul primit prin echipa
// boardului sau prin vizibilitatea lui — așa poți da `admin` cuiva din afara
// echipei, sau `viewer` cuiva din ea.

import { useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { toast } from "@/lib/tasks/toast";
import { AssigneePicker } from "@/components/tasks/AssigneePicker";
import {
  useAddBoardMember,
  useAddTeamToBoard,
  useAssignableIndex,
  useAssignableUsers,
  useBoardMembers,
  useRemoveBoardMember,
  useSelectableTeams,
} from "@/hooks/useTaskBoards";
import { BOARD_ROLES, type BoardMember, type BoardRole } from "@/lib/tasks/types";
import { avatarClass, initialsOf } from "@/lib/tasks/meta";

interface BoardMembersDialogProps {
  boardId: string;
  /**
   * Membrii, așa cum îi are deja pagina boardului (`useBoardMembers`). Lipsă ⇒
   * dialogul îi citește singur, cu aceeași cheie de cache — deci fără o cerere în plus.
   */
  members?: BoardMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardMembersDialog({ boardId, members: membersProp, open, onOpenChange }: BoardMembersDialogProps) {
  const { t } = useTasksT();
  const index = useAssignableIndex(boardId);
  const { data: fetchedMembers = [] } = useBoardMembers(membersProp ? undefined : boardId);
  const members = membersProp ?? fetchedMembers;
  // Candidații sunt cei ai selectorului de mai jos (aceeași cerere, deduplicată).
  const { data: candidates = [] } = useAssignableUsers(boardId);
  const addMember = useAddBoardMember(boardId);
  const removeMember = useRemoveBoardMember(boardId);
  // Echipele workspace-ului (aceleași ca în PAR): o echipă întreagă intră pe board dintr-un clic.
  const { data: teams = [] } = useSelectableTeams(open);
  const addTeam = useAddTeamToBoard(boardId);
  const [teamId, setTeamId] = useState("");

  const handleAddTeam = () => {
    if (!teamId) return;
    addTeam.mutate(
      { teamId },
      {
        onSuccess: (added) => {
          setTeamId("");
          toast.success(added > 0 ? t("board.members.teamAdded", { count: added }) : t("board.members.teamAddedNone"));
        },
        onError: (error) => {
          console.error("[tasks] add team", error);
          toast.error(t("board.toast.saveFailed"));
        },
      },
    );
  };

  const handleAdd = (userIds: string[]) => {
    const userId = userIds[0];
    if (!userId || members.some((m) => m.user_id === userId)) return;
    // Un cont dezactivat nu primește acces nou; rămâne în index doar ca să i se vadă numele.
    if (candidates.find((person) => person.user_id === userId)?.is_active === false) return;
    addMember.mutate(
      { userId, role: "editor" },
      {
        onSuccess: () => toast.success(t("board.members.added")),
        onError: (error) => {
          console.error("[tasks] add member", error);
          toast.error(t("board.toast.saveFailed"));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("board.members.title")}</DialogTitle>
          <DialogDescription>{t("board.members.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" />
            {t("board.members.add")}
          </div>
          <AssigneePicker boardId={boardId} mode="single" value={[]} onChange={handleAdd} inDialog />
        </div>

        {teams.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {t("board.members.addTeam")}
            </div>
            <div className="flex items-center gap-2">
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="h-9 flex-1 text-sm" aria-label={t("board.members.pickTeam")}>
                  <SelectValue placeholder={t("board.members.pickTeam")} />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.team_id} value={team.team_id}>
                      {team.name} · {t("board.form.teamMembers", { count: team.member_count })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!teamId || addTeam.isPending} onClick={handleAddTeam}>
                {t("board.members.addTeamButton")}
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {members.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">{t("board.members.empty")}</p>
          )}
          {members.map((member) => {
            const person = index[member.user_id];
            return (
              <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    avatarClass(member.user_id),
                  )}
                >
                  {initialsOf(person?.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{person?.full_name ?? t("board.detail.unknownUser")}</p>
                  {(person?.job_title ?? person?.email) && (
                    <p className="truncate text-[11px] text-muted-foreground">{person?.job_title ?? person?.email}</p>
                  )}
                </div>

                <Select
                  value={member.role}
                  onValueChange={(role) => addMember.mutate({ userId: member.user_id, role: role as BoardRole })}
                >
                  <SelectTrigger className="h-7 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_ROLES.map((role) => (
                      <SelectItem key={role} value={role} className="text-xs">
                        {t(`board.members.roles.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMember.mutate(member.user_id)}
                  aria-label={t("board.actions.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
