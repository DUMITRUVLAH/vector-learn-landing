/**
 * Hook-urile React Query ale modulului de task-uri — portate din HR365 (`useTaskBoards.ts`).
 *
 * Toate cheile pornesc cu `task-boards`, ca invalidarea să fie ieftină și previzibilă: o
 * mutație pe un task invalidează boardul lui + vederile globale („Task-urile mele", „Toate
 * task-urile"), nimic altceva.
 *
 * Diferențe față de sursă:
 * - identitatea vine din `/api/tasks/me` (`useTasksAuth`), nu dintr-un AuthContext Supabase;
 * - izolarea pe workspace o face serverul, deci filtrul de „companie" din sursă (necesar acolo
 *   doar super-adminului, care vedea toate companiile) dispare;
 * - în loc de canalele Realtime din Supabase, boardul deschis și vederile globale se
 *   reîmprospătează periodic și la revenirea în fereastră — doi colegi pe același board se
 *   văd în câteva secunde, fără o conexiune permanentă.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/tasks/api";
import { taskErrorMessage } from "@/lib/tasks/errors";
import { moveStatusPatch } from "@/lib/tasks/board-status";
import { toast } from "@/lib/tasks/toast";
import { useTasksT } from "@/lib/tasks/useTasksT";
import type { AssignableUser, BoardRole, BoardTask, TaskBoard, TaskList } from "@/lib/tasks/types";

const KEY = "task-boards";

/** Cât de des se reîmprospătează boardul deschis și listele globale, când nimeni nu scrie. */
const LIVE_REFRESH_MS = 20_000;

type QueryClient = ReturnType<typeof useQueryClient>;

/** Vederile care agregă peste boarduri — se invalidează la orice scriere pe task. */
function invalidateTaskViews(qc: QueryClient, boardId?: string | null) {
  qc.invalidateQueries({ queryKey: [KEY, "all-tasks"] });
  qc.invalidateQueries({ queryKey: [KEY, "my-tasks"] });
  qc.invalidateQueries({ queryKey: [KEY, "task-detail"] });
  // Istoricul și contorul de comentarii se schimbă odată cu task-ul; servite din cache, rămâneau
  // pe starea de acum o oră după trei mutări de status.
  qc.invalidateQueries({ queryKey: [KEY, "activity"] });
  qc.invalidateQueries({ queryKey: [KEY, "comment-counts"] });
  qc.invalidateQueries({ queryKey: [KEY, "approvals-count"] });
  qc.invalidateQueries({ queryKey: [KEY, "available"] });
  if (boardId) qc.invalidateQueries({ queryKey: [KEY, "tasks", boardId] });
  else qc.invalidateQueries({ queryKey: [KEY, "tasks"] });
}

// ─── Identitate ──────────────────────────────────────────────────────────────

export interface TasksAuth {
  user: { id: string } | null;
  profile: { full_name: string } | null;
  /** Administratorul workspace-ului — echivalentul „HR admin" din sursă: vede și poate tot. */
  isHRAdmin: boolean;
  /** Nu există super-admin în interiorul unui workspace; impersonarea intră ca omul însuși. */
  isSuperAdmin: boolean;
  isManager: boolean;
  /** Poate crea echipe și le poate schimba membrii (aceeași regulă ca în PAR). */
  canManageTeams: boolean;
  isLoading: boolean;
}

export function useTasksMe() {
  return useQuery({ queryKey: [KEY, "me"], queryFn: api.getMe, staleTime: 10 * 60 * 1000 });
}

export function useTasksAuth(): TasksAuth {
  const { data, isLoading } = useTasksMe();
  return useMemo(
    () => ({
      user: data ? { id: data.user_id } : null,
      profile: data ? { full_name: data.full_name } : null,
      isHRAdmin: data?.is_admin ?? false,
      isSuperAdmin: false,
      isManager: data?.is_manager ?? false,
      canManageTeams: data?.can_manage_teams ?? false,
      isLoading,
    }),
    [data, isLoading],
  );
}

// ─── Boarduri ────────────────────────────────────────────────────────────────

/**
 * TOATE boardurile vizibile, inclusiv cele arhivate — sursa UNICĂ. Boardurile active și numele
 * pentru vederile transversale se derivă cu `select`, fără o a doua cerere.
 */
function useAllBoardsRaw<T = TaskBoard[]>(select?: (rows: TaskBoard[]) => T) {
  return useQuery({
    queryKey: [KEY, "boards", "all-raw"],
    queryFn: api.listAllBoardsForNames,
    staleTime: 5 * 60 * 1000,
    select,
  });
}

export function useBoards() {
  return useAllBoardsRaw<TaskBoard[]>((rows) => rows.filter((board) => !board.archived_at));
}

export function useArchivedBoards(enabled: boolean) {
  return useAllBoardsRaw<TaskBoard[]>((rows) => (enabled ? rows.filter((board) => !!board.archived_at) : []));
}

export function useBoard(boardId: string | undefined) {
  const query = useAllBoardsRaw<TaskBoard | null>((rows) => rows.find((board) => board.id === boardId) ?? null);
  return { ...query, data: boardId ? query.data ?? null : null };
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateBoardInput) => api.createBoard(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "boards"] }),
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.BoardPatch }) => api.updateBoard(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "boards"] });
      // Vizibilitatea/echipa schimbă cine vede task-urile boardului.
      invalidateTaskViews(qc);
    },
  });
}

export function useBoardTaskCount(boardId: string | null) {
  return useQuery({
    queryKey: [KEY, "board-task-count", boardId],
    queryFn: () => api.countBoardTasks(boardId as string),
    enabled: !!boardId,
    staleTime: 30 * 1000,
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api.deleteBoard(boardId),
    // Dispar și task-urile, deci nu e de ajuns lista de boarduri.
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useArchiveBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveBoard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "boards"] }),
  });
}

export function useUnarchiveBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.unarchiveBoard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "boards"] }),
  });
}

export function useToggleBoardStar() {
  const qc = useQueryClient();
  const { user } = useTasksAuth();
  return useMutation({
    mutationFn: (board: Pick<TaskBoard, "id" | "starred_by">) => api.toggleBoardStar(board),
    // Steaua apare/dispare imediat în bara laterală, nu după dus-întors.
    onMutate: async (board) => {
      await qc.cancelQueries({ queryKey: [KEY, "boards"] });
      const snapshots = qc.getQueriesData({ queryKey: [KEY, "boards"] });
      if (user) {
        qc.setQueriesData({ queryKey: [KEY, "boards"] }, (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return (old as TaskBoard[]).map((row) => {
            if (row.id !== board.id) return row;
            const starred = row.starred_by ?? [];
            return {
              ...row,
              starred_by: starred.includes(user.id) ? starred.filter((u) => u !== user.id) : [...starred, user.id],
            };
          });
        });
      }
      return { snapshots };
    },
    onError: (_error, _board, context) => {
      for (const [key, data] of context?.snapshots ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [KEY, "boards"] }),
  });
}

// ─── Coloane ─────────────────────────────────────────────────────────────────

export function useBoardLists(boardId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "lists", boardId],
    queryFn: () => api.listBoardLists(boardId as string),
    enabled: !!boardId,
    staleTime: 60 * 1000,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useCreateList(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; is_done_list?: boolean; color?: string }) =>
      api.createList(boardId as string, input.name, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "lists", boardId] }),
  });
}

export function useUpdateList(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskList> }) => api.updateList(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "lists", boardId] }),
  });
}

export function useArchiveList(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveList(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "lists", boardId] });
      qc.invalidateQueries({ queryKey: [KEY, "lists-archived", boardId] });
      invalidateTaskViews(qc, boardId);
    },
  });
}

/** Coloanele arhivate — ca task-urile ascunse de arhivare să aibă drum de întoarcere. */
export function useArchivedLists(boardId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [KEY, "lists-archived", boardId],
    queryFn: () => api.listArchivedLists(boardId as string),
    enabled: !!boardId && enabled,
    staleTime: 60 * 1000,
  });
}

export function useUnarchiveList(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.unarchiveList(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "lists", boardId] });
      qc.invalidateQueries({ queryKey: [KEY, "lists-archived", boardId] });
      invalidateTaskViews(qc, boardId);
    },
  });
}

/** Câte carduri active ascunde arhivarea — pentru dialogul de confirmare. */
export function useListTaskCount(listId: string | null) {
  return useQuery({
    queryKey: [KEY, "list-count", listId],
    queryFn: () => api.countListTasks(listId as string),
    enabled: !!listId,
    staleTime: 30 * 1000,
  });
}

// ─── Membri + persoane ───────────────────────────────────────────────────────

export function useBoardMembers(boardId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "members", boardId],
    queryFn: () => api.listBoardMembers(boardId as string),
    enabled: !!boardId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddBoardMember(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
      api.addBoardMember(boardId as string, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "members", boardId] });
      qc.invalidateQueries({ queryKey: [KEY, "assignable"] });
    },
  });
}

export function useRemoveBoardMember(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeBoardMember(boardId as string, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "members", boardId] });
      qc.invalidateQueries({ queryKey: [KEY, "assignable"] });
    },
  });
}

/** Oamenii cărora li se poate atribui un task (activi, cu relația față de mine). */
export function useAssignableUsers(boardId?: string | null) {
  return useQuery({
    queryKey: [KEY, "assignable", boardId ?? "workspace"],
    queryFn: () => api.listAssignableUsers(boardId),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Nume/avatar per user_id, pentru AFIȘARE — toți oamenii workspace-ului, inclusiv cei
 * dezactivați (altfel un responsabil plecat apare ca o bulină anonimă).
 */
export function useAssignableIndex(
  _boardId?: string | null,
  options?: { enabled?: boolean },
): Record<string, AssignableUser> {
  const { data } = useQuery({
    queryKey: [KEY, "company-people"],
    enabled: options?.enabled ?? true,
    queryFn: api.listCompanyPeople,
    staleTime: 10 * 60 * 1000,
  });
  return useMemo(() => {
    const index: Record<string, AssignableUser> = {};
    for (const u of data ?? []) index[u.user_id] = u;
    return index;
  }, [data]);
}

// ─── Echipe ──────────────────────────────────────────────────────────────────

export function useSelectableTeams(enabled = true) {
  return useQuery({
    queryKey: [KEY, "teams", "selectable"],
    queryFn: api.listSelectableTeams,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeams(enabled = true) {
  return useQuery({ queryKey: [KEY, "teams", "all"], queryFn: api.listTeams, enabled, staleTime: 60 * 1000 });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [KEY, "teams"] });
    // Echipa decide cine vede boardurile ei și cine e „coechipier" în selectoare.
    qc.invalidateQueries({ queryKey: [KEY, "boards"] });
    qc.invalidateQueries({ queryKey: [KEY, "assignable"] });
    invalidateTaskViews(qc);
  };
  return {
    create: useMutation({
      mutationFn: ({ name, userIds }: { name: string; userIds?: string[] }) => api.createTeam(name, userIds),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: { name?: string; active?: boolean } }) => api.updateTeam(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteTeam(id), onSuccess: invalidate }),
    addMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) => api.addTeamMember(teamId, userId),
      onSuccess: invalidate,
    }),
    removeMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) => api.removeTeamMember(teamId, userId),
      onSuccess: invalidate,
    }),
  };
}

// ─── Task-uri ────────────────────────────────────────────────────────────────

export function useBoardTasks(boardId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "tasks", boardId],
    queryFn: () => api.listBoardTasks(boardId as string),
    enabled: !!boardId,
    staleTime: 30 * 1000,
    // Boardul deschis urmărește ce fac colegii: fără asta, un card mutat de altcineva nu se
    // vedea până la o navigare, iar pozițiile se calculau față de vecini care nu mai existau.
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useAllTasks(enabled = true) {
  return useQuery({
    queryKey: [KEY, "all-tasks"],
    queryFn: api.listAllTasks,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: enabled ? LIVE_REFRESH_MS * 3 : false,
  });
}

/** Câte task-uri îmi așteaptă aprobarea — numărat pe server, pentru badge-ul din meniu. */
export function usePendingApprovalsCount() {
  const { user } = useTasksAuth();
  return useQuery({
    queryKey: [KEY, "approvals-count", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      try {
        return await api.countPendingApprovals();
      } catch {
        return 0;
      }
    },
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "task-detail", taskId],
    queryFn: () => api.getTask(taskId as string),
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

/**
 * Task-ul deschis din `?task=<id>` — din lista paginii dacă e acolo, altfel cerut după id (un
 * subtask al altcuiva nu e în „Task-urile mele", dar trebuie să se deschidă).
 * `useTask` se cheamă NECONDIȚIONAT: un hook după un `return` schimbă numărul de hook-uri.
 */
export function useOpenTask(taskId: string | null, fromList: BoardTask[]): BoardTask | null {
  const fromPage = taskId ? fromList.find((task) => task.id === taskId) ?? null : null;
  const fetched = useTask(taskId && !fromPage ? taskId : undefined);
  return fromPage ?? fetched.data ?? null;
}

export function useMyTasks() {
  const { user } = useTasksAuth();
  return useQuery({
    queryKey: [KEY, "my-tasks", user?.id],
    queryFn: () => api.listMyTasks(),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: LIVE_REFRESH_MS * 3,
  });
}

export function useSubtasks(parentId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "subtasks", parentId],
    queryFn: () => api.listSubtasks(parentId as string),
    enabled: !!parentId,
    staleTime: 30 * 1000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateTaskInput) => api.createTask(input),
    onSuccess: (task) => {
      invalidateTaskViews(qc, task.board_id);
      if (task.parent_task_id) qc.invalidateQueries({ queryKey: [KEY, "subtasks", task.parent_task_id] });
    },
  });
}

export function useBulkCreateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ titles, ...base }: Omit<api.CreateTaskInput, "title"> & { titles: string[] }) =>
      api.bulkCreateTasks(base, titles),
    onSuccess: (tasks) => invalidateTaskViews(qc, tasks[0]?.board_id),
  });
}

/**
 * Aplică o modificare imediat în toate cache-urile care conțin task-ul, ca bifarea să se vadă
 * instantaneu. Întoarce instantaneele de dinainte, pentru revenire dacă serverul refuză.
 */
function patchTaskInCaches(qc: QueryClient, id: string, patch: Partial<BoardTask>): [readonly unknown[], unknown][] {
  const snapshots = qc.getQueriesData({ queryKey: [KEY] });
  qc.setQueriesData({ queryKey: [KEY] }, (old: unknown) => {
    if (!Array.isArray(old)) return old;
    let touched = false;
    const next = (old as BoardTask[]).map((row) => {
      if (!row || typeof row !== "object" || row.id !== id) return row;
      touched = true;
      return { ...row, ...patch };
    });
    return touched ? next : old;
  });
  return snapshots;
}

export function useUpdateTask(_lists: TaskList[] = []) {
  const qc = useQueryClient();
  const { t } = useTasksT();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.TaskPatch }) => api.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      // Oprim reîncărcările în curs: un răspuns vechi ar suprascrie modificarea optimistă.
      await qc.cancelQueries({ queryKey: [KEY] });
      const optimistic: Partial<BoardTask> = { ...(patch as Partial<BoardTask>) };
      if (patch.status !== undefined) {
        optimistic.completed_at = patch.status === "done" ? new Date().toISOString() : null;
      }
      return { snapshots: patchTaskInCaches(qc, id, optimistic) };
    },
    // Toast-ul stă AICI, nu la call-site: serverul refuză exact fluxurile normale („are nevoie
    // de aprobare", „dependențele nu sunt gata") cu motive utile. Fără el, cardul se bifa, se
    // debifa, și nimeni nu afla de ce.
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) qc.setQueryData(key, data);
      toast.error(taskErrorMessage(error, t));
    },
    onSuccess: (task) => {
      invalidateTaskViews(qc, task.board_id);
      qc.invalidateQueries({ queryKey: [KEY, "activity", task.id] });
      if (task.parent_task_id) qc.invalidateQueries({ queryKey: [KEY, "subtasks", task.parent_task_id] });
    },
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  const { t } = useTasksT();
  return useMutation({
    mutationFn: (v: {
      taskId: string;
      toListId: string | null;
      position: number;
      currentStatus: BoardTask["status"];
      targetList: TaskList | null;
    }) => api.moveTask(v.taskId, v.toListId, v.position),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: [KEY] });
      // Fără asta, cardul tras sare înapoi în coloana veche până răspunde serverul.
      const optimistic: Partial<BoardTask> = {
        list_id: v.toListId,
        position: v.position,
        ...moveStatusPatch(v.currentStatus, v.targetList),
      };
      return { snapshots: patchTaskInCaches(qc, v.taskId, optimistic) };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) qc.setQueryData(key, data);
      toast.error(taskErrorMessage(error, t));
    },
    onSuccess: (task) => invalidateTaskViews(qc, task.board_id),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; boardId?: string | null }) => api.deleteTask(id),
    onSuccess: (_d, v) => invalidateTaskViews(qc, v.boardId),
  });
}

/** Perechile (serie, zi) deja materializate — ca ocurența să nu apară de două ori. */
export function useMaterializedOccurrences(seriesIds: string[]) {
  const key = [...seriesIds].sort().join(",");
  return useQuery({
    queryKey: [KEY, "materialized-occurrences", key],
    queryFn: () => api.listMaterializedOccurrences(seriesIds),
    enabled: seriesIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export function useMaterializeOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, date }: { taskId: string; date: string; boardId?: string | null }) =>
      api.materializeOccurrence(taskId, date),
    onSuccess: (_id, v) => {
      invalidateTaskViews(qc, v.boardId);
      qc.invalidateQueries({ queryKey: [KEY, "materialized-occurrences"] });
    },
  });
}

/** Anulează o ștergere — task-ul și subtaskurile plecate în aceeași cascadă. */
export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; boardId?: string | null }) => api.restoreTask(id),
    onSuccess: (_d, v) => invalidateTaskViews(qc, v.boardId),
  });
}

// ─── Comentarii, istoric ─────────────────────────────────────────────────────

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "comments", taskId],
    queryFn: () => api.listTaskComments(taskId as string),
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

export function useAddComment(taskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => {
      if (!taskId) throw new Error("Task necunoscut");
      return api.addTaskComment(taskId, undefined, content);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "comments", taskId] });
      qc.invalidateQueries({ queryKey: [KEY, "comment-counts"] });
    },
  });
}

export function useDeleteComment(taskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTaskComment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "comments", taskId] });
      qc.invalidateQueries({ queryKey: [KEY, "comment-counts"] });
    },
  });
}

export function useCommentCounts(taskIds: string[]) {
  const key = [...taskIds].sort().join(",");
  return useQuery({
    queryKey: [KEY, "comment-counts", key],
    queryFn: () => api.countCommentsFor(taskIds),
    enabled: taskIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export function useTaskActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "activity", taskId],
    queryFn: () => api.listTaskActivity(taskId as string),
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

// ─── Dependențe ──────────────────────────────────────────────────────────────

export function useDependencies(taskIds: string[]) {
  const key = [...taskIds].sort().join(",");
  return useQuery({
    queryKey: [KEY, "deps", key],
    queryFn: () => api.listDependenciesFor(taskIds),
    enabled: taskIds.length > 0,
    staleTime: 60 * 1000,
  });
}

/** Sensul invers: task-urile care așteaptă după cele date. */
export function useDependents(taskIds: string[]) {
  const key = [...taskIds].sort().join(",");
  return useQuery({
    queryKey: [KEY, "deps", "inverse", key],
    queryFn: () => api.listDependentsOf(taskIds),
    enabled: taskIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export function useDependencyMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [KEY, "deps"] });
    invalidateTaskViews(qc);
  };
  return {
    add: useMutation({
      mutationFn: ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) =>
        api.addDependency(taskId, dependsOnId),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.removeDependency(id), onSuccess: invalidate }),
  };
}

// ─── Aprobări ────────────────────────────────────────────────────────────────

export function useSetApprovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, approverIds }: { taskId: string; approverIds: string[] }) =>
      api.setApprovers(taskId, approverIds),
    onSuccess: () => invalidateTaskViews(qc),
  });
}

export function useApproveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.approveTask(taskId),
    onSuccess: () => invalidateTaskViews(qc),
  });
}

export function useRejectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) => api.rejectTask(taskId, undefined, reason),
    onSuccess: (_d, v) => {
      invalidateTaskViews(qc);
      qc.invalidateQueries({ queryKey: [KEY, "comments", v.taskId] });
    },
  });
}

// ─── Atașamente ──────────────────────────────────────────────────────────────

export function useAddCommentWithAttachments(taskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, files }: { content: string; files: File[] }) => {
      if (!taskId) throw new Error("Task necunoscut");
      const attachments: api.CommentAttachment[] = [];
      for (const file of files) attachments.push(await api.uploadAttachment(null, taskId, file));
      return api.addTaskCommentWithAttachments(taskId, undefined, content, attachments);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "comments", taskId] });
      qc.invalidateQueries({ queryKey: [KEY, "comment-counts"] });
    },
  });
}

// ─── Vederi salvate ──────────────────────────────────────────────────────────

/**
 * Filtrele unei pagini, persistate pe server. Se încarcă o dată; scrierea e „fire and forget" —
 * dacă salvarea preferinței eșuează, vederea rămâne funcțională, doar nu se ține minte.
 */
export function useViewPref<T>(viewKey: string) {
  const { user } = useTasksAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [KEY, "view-pref", viewKey, user?.id],
    queryFn: () => api.loadViewPref<T>(user?.id, viewKey),
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
  const save = useMutation({
    mutationFn: (config: T) => api.saveViewPref(user?.id, viewKey, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "view-pref", viewKey, user?.id] }),
  });
  return { pref: query.data ?? null, isLoaded: !query.isLoading, save };
}

// ─── Căutare, mutare între boarduri, operații pe coloane, coadă liberă ───────

export function useTaskSearch(query: string) {
  return useQuery({
    queryKey: [KEY, "search", query],
    queryFn: () => api.searchTasks(query),
    // Sub două caractere căutarea ar întoarce jumătate din bază la fiecare tastă.
    enabled: query.trim().length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useMoveTaskToBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, toBoardId }: { taskId: string; toBoardId: string | null; fromBoardId?: string | null }) =>
      api.moveTaskToBoard(taskId, toBoardId),
    onSuccess: (_d, v) => {
      invalidateTaskViews(qc, v.fromBoardId);
      invalidateTaskViews(qc, v.toBoardId);
    },
  });
}

export function useListOperations(boardId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [KEY, "lists", boardId] });
    invalidateTaskViews(qc, boardId);
  };
  return {
    duplicate: useMutation({
      mutationFn: ({ listId, copySuffix }: { listId: string; copySuffix: string }) => api.duplicateList(listId, copySuffix),
      onSuccess: invalidate,
    }),
    moveAll: useMutation({
      mutationFn: ({ fromListId, toListId }: { fromListId: string; toListId: string }) =>
        api.moveAllTasksToList(fromListId, toListId),
      onSuccess: invalidate,
    }),
    sort: useMutation({
      mutationFn: ({ listId, key }: { listId: string; key: api.ListSortKey }) => api.sortListTasks(listId, key),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: ({ lists, listId, direction }: { lists: TaskList[]; listId: string; direction: -1 | 1 }) =>
        api.reorderList(lists, listId, direction),
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => api.updateList(id, { name }),
      onSuccess: invalidate,
    }),
    // „Coloana de finalizare" se poate repara oricând, nu doar la creare.
    setDoneList: useMutation({
      mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) => api.updateList(id, { is_done_list: isDone }),
      onSuccess: invalidate,
    }),
  };
}

/** Coada de task-uri libere + „ia în lucru". */
export function useAvailableTasks(enabled = true) {
  return useQuery({
    queryKey: [KEY, "available"],
    queryFn: api.listAvailableTasks,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useClaimTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: { id: string; board_id: string | null }) => api.claimTask(task.id),
    onSuccess: (task) => {
      invalidateTaskViews(qc, task.board_id);
      qc.invalidateQueries({ queryKey: [KEY, "available"] });
    },
  });
}

// ─── Reguli de vizibilitate ──────────────────────────────────────────────────

export function useVisibilityRules(enabled = true) {
  return useQuery({
    queryKey: [KEY, "visibility-rules"],
    queryFn: api.listVisibilityRules,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVisibilityRuleMutations() {
  const qc = useQueryClient();
  // O schimbare de regulă rescrie ce vede toată lumea — invalidăm și task-urile.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [KEY, "visibility-rules"] });
    invalidateTaskViews(qc);
  };
  return {
    save: useMutation({
      mutationFn: (input: Parameters<typeof api.upsertVisibilityRule>[0]) => api.upsertVisibilityRule(input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteVisibilityRule(id), onSuccess: invalidate }),
  };
}

/** Nume de board pentru vederile transversale, inclusiv cele arhivate. */
export function useBoardNames(): Record<string, string> {
  const { data } = useAllBoardsRaw();
  return useMemo(() => {
    const names: Record<string, string> = {};
    for (const board of data ?? []) names[board.id] = board.name;
    return names;
  }, [data]);
}
