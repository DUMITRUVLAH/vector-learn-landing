/**
 * Stratul de date al modulului de task-uri.
 *
 * Aceleași funcții, cu aceleași semnături, ca `src/lib/tasks/api.ts` din HR365 — acolo scriau
 * direct în Supabase, aici trec prin `/api/tasks`. Regulile care în sursă stăteau în triggere
 * (sincronizarea status ↔ coloană, `completed_at`, istoricul, cine are voie ce) le aplică
 * serverul, într-un singur loc; clientul trimite intenția, nu calculează drepturi.
 *
 * Valorile întoarse sunt obiecte simple (`Record`, nu `Map`): cache-ul React Query le poate
 * compara și clona fără surprize.
 */
import { api } from "@/lib/api";
import type {
  AssignableUser,
  BoardMember,
  BoardRole,
  BoardTask,
  BoardVisibility,
  SelectableTeam,
  TaskActivity,
  TaskBoard,
  TaskList,
  TaskPriority,
  TaskStatus,
  VisibilityRule,
  VisibilityScope,
  VisibilitySubject,
  WorkspaceTeam,
} from "./types";

const BASE = "/api/tasks";

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

// ─── Boarduri ────────────────────────────────────────────────────────────────

/** Toate boardurile vizibile, inclusiv cele arhivate — vederile transversale au nevoie de
 *  nume și pentru task-urile rămase pe un board arhivat. */
export async function listAllBoardsForNames(): Promise<TaskBoard[]> {
  return (await api<{ boards: TaskBoard[] }>(`${BASE}/boards?archived=all`)).boards;
}

export async function listBoards(): Promise<TaskBoard[]> {
  return (await api<{ boards: TaskBoard[] }>(`${BASE}/boards?archived=false`)).boards;
}

export async function listArchivedBoards(): Promise<TaskBoard[]> {
  return (await api<{ boards: TaskBoard[] }>(`${BASE}/boards?archived=true`)).boards;
}

export async function getBoard(boardId: string): Promise<TaskBoard | null> {
  const { boards } = await api<{ boards: TaskBoard[] }>(`${BASE}/boards?archived=all&boardId=${encodeURIComponent(boardId)}`);
  return boards[0] ?? null;
}

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  color?: string;
  visibility?: BoardVisibility;
  team_id?: string | null;
  /**
   * Coloanele implicite, traduse în limba interfeței. Numele coloanei e text liber;
   * statusul pe care îl impune e dată structurată și merge în `maps_to_status`.
   */
  lists?: Array<{
    name: string;
    is_done_list?: boolean;
    color?: string;
    maps_to_status?: TaskStatus | null;
  }>;
}

/** Board nou + coloanele implicite + creatorul ca admin — atomic, pe server. */
export async function createBoard(input: CreateBoardInput): Promise<TaskBoard> {
  return (await api<{ board: TaskBoard }>(`${BASE}/boards`, json("POST", input))).board;
}

export type BoardPatch = Partial<Pick<TaskBoard, "name" | "description" | "color" | "visibility" | "team_id">>;

export async function updateBoard(id: string, patch: BoardPatch): Promise<void> {
  await api(`${BASE}/boards/${id}`, json("PATCH", patch));
}

/** Câte task-uri active ar dispărea odată cu boardul — pentru dialogul de confirmare. */
export async function countBoardTasks(boardId: string): Promise<number> {
  return (await api<{ count: number }>(`${BASE}/boards/${boardId}/task-count`)).count;
}

/** Șterge boardul CU TOT CU task-uri (nu le mută tăcut în „personal"). Întoarce câte au plecat. */
export async function deleteBoard(boardId: string): Promise<number> {
  return (await api<{ deleted: number }>(`${BASE}/boards/${boardId}`, json("DELETE"))).deleted;
}

export async function archiveBoard(id: string): Promise<void> {
  await api(`${BASE}/boards/${id}`, json("PATCH", { archived: true }));
}

export async function unarchiveBoard(id: string): Promise<void> {
  await api(`${BASE}/boards/${id}`, json("PATCH", { archived: false }));
}

/** Steaua e per utilizator — nu dezlipește boardul din bara altcuiva. */
export async function toggleBoardStar(board: Pick<TaskBoard, "id" | "starred_by">, _userId?: string): Promise<void> {
  await api(`${BASE}/boards/${board.id}/star`, json("POST"));
}

// ─── Coloane ─────────────────────────────────────────────────────────────────

export async function listBoardLists(boardId: string): Promise<TaskList[]> {
  return (await api<{ lists: TaskList[] }>(`${BASE}/boards/${boardId}/lists`)).lists;
}

/** Coloanele arhivate — ca task-urile ascunse de arhivare să aibă drum de întoarcere. */
export async function listArchivedLists(boardId: string): Promise<TaskList[]> {
  return (await api<{ lists: TaskList[] }>(`${BASE}/boards/${boardId}/lists?archived=1`)).lists;
}

export async function createList(
  boardId: string,
  name: string,
  opts: { is_done_list?: boolean; color?: string; maps_to_status?: TaskStatus | null } = {},
): Promise<TaskList> {
  return (
    await api<{ list: TaskList }>(
      `${BASE}/boards/${boardId}/lists`,
      json("POST", { name, is_done_list: opts.is_done_list, color: opts.color, maps_to_status: opts.maps_to_status }),
    )
  ).list;
}

export async function updateList(
  id: string,
  patch: Partial<Pick<TaskList, "name" | "position" | "is_done_list" | "color" | "maps_to_status">>,
): Promise<void> {
  await api(`${BASE}/lists/${id}`, json("PATCH", patch));
}

/** Arhivare soft: task-urile rămân în coloană și revin odată cu ea. */
export async function archiveList(id: string): Promise<void> {
  await api(`${BASE}/lists/${id}`, json("PATCH", { archived: true }));
}

export async function countListTasks(listId: string): Promise<number> {
  return (await api<{ count: number }>(`${BASE}/lists/${listId}/task-count`)).count;
}

export async function unarchiveList(id: string): Promise<void> {
  await api(`${BASE}/lists/${id}`, json("PATCH", { archived: false }));
}

// ─── Membri ──────────────────────────────────────────────────────────────────

export async function listBoardMembers(boardId: string): Promise<BoardMember[]> {
  return (await api<{ members: BoardMember[] }>(`${BASE}/boards/${boardId}/members`)).members;
}

export async function addBoardMember(boardId: string, userId: string, role: BoardRole, _addedBy?: string): Promise<void> {
  await api(`${BASE}/boards/${boardId}/members/${userId}`, json("PUT", { role }));
}

export async function removeBoardMember(boardId: string, userId: string): Promise<void> {
  await api(`${BASE}/boards/${boardId}/members/${userId}`, json("DELETE"));
}

/** O echipă întreagă devine membră a boardului; cei deja pe board își păstrează rolul. Întoarce câți au intrat. */
export async function addTeamToBoard(boardId: string, teamId: string, role: BoardRole = "editor"): Promise<number> {
  return (await api<{ added: number }>(`${BASE}/boards/${boardId}/members/team`, json("POST", { team_id: teamId, role }))).added;
}

/**
 * Toți oamenii workspace-ului, pentru AFIȘARE (avatare, autori, actori din istoric) — inclusiv
 * cei dezactivați: un task atribuit cuiva plecat trebuie să-i arate numele, nu o bulină anonimă.
 */
export async function listCompanyPeople(): Promise<AssignableUser[]> {
  return (await api<{ people: AssignableUser[] }>(`${BASE}/people`)).people;
}

/** Cui i se poate atribui un task (oameni activi), cu relația față de cel care caută. */
export async function listAssignableUsers(boardId?: string | null): Promise<AssignableUser[]> {
  const q = boardId ? `?boardId=${encodeURIComponent(boardId)}` : "";
  return (await api<{ people: AssignableUser[] }>(`${BASE}/assignable${q}`)).people;
}

// ─── Echipe (aceleași ca în PAR) ─────────────────────────────────────────────

/** Echipele din selectorul de board, cu numărul de membri (consecința alegerii). */
export async function listSelectableTeams(): Promise<SelectableTeam[]> {
  return (await api<{ teams: SelectableTeam[] }>(`${BASE}/teams/selectable`)).teams;
}

export async function listTeams(): Promise<WorkspaceTeam[]> {
  return (await api<{ teams: WorkspaceTeam[] }>(`${BASE}/teams`)).teams;
}

export async function createTeam(name: string, userIds: string[] = []): Promise<WorkspaceTeam> {
  return (await api<{ team: WorkspaceTeam }>(`${BASE}/teams`, json("POST", { name, user_ids: userIds }))).team;
}

export async function updateTeam(id: string, patch: { name?: string; active?: boolean }): Promise<void> {
  await api(`${BASE}/teams/${id}`, json("PATCH", patch));
}

export async function deleteTeam(id: string): Promise<void> {
  await api(`${BASE}/teams/${id}`, json("DELETE"));
}

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await api(`${BASE}/teams/${teamId}/members`, json("POST", { user_id: userId }));
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await api(`${BASE}/teams/${teamId}/members/${userId}`, json("DELETE"));
}

// ─── Task-uri ────────────────────────────────────────────────────────────────

/** Task-urile unui board (fără cele din coloane arhivate — ascunse, nu șterse). */
export async function listBoardTasks(boardId: string): Promise<BoardTask[]> {
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/boards/${boardId}/tasks`)).tasks;
}

/** Rândul complet pentru panoul deschis; `null` dacă nu (mai) e vizibil. */
export async function getTask(taskId: string): Promise<BoardTask | null> {
  try {
    return (await api<{ task: BoardTask }>(`${BASE}/tasks/${taskId}`)).task;
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

/** Toate task-urile vizibile apelantului (boarduri + personale + reguli de vizibilitate). */
export async function listAllTasks(): Promise<BoardTask[]> {
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/tasks?scope=all`)).tasks;
}

/** Task-urile mele: unde sunt responsabil (inclusiv co-responsabil). */
export async function listMyTasks(_userId?: string): Promise<BoardTask[]> {
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/tasks?scope=mine`)).tasks;
}

export async function listSubtasks(parentId: string): Promise<BoardTask[]> {
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/tasks/${parentId}/subtasks`)).tasks;
}

export interface CreateTaskInput {
  title: string;
  board_id?: string | null;
  list_id?: string | null;
  parent_task_id?: string | null;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignees?: string[];
  start_date?: string | null;
  due_date?: string | null;
  estimated_minutes?: number | null;
  tags?: string[];
  task_set?: string | null;
  is_private?: boolean;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  source_module?: string;
  /** 0 = „pune-l la coada coloanei" (serverul calculează poziția). */
  position?: number;
}

export async function createTask(input: CreateTaskInput): Promise<BoardTask> {
  return (await api<{ task: BoardTask }>(`${BASE}/tasks`, json("POST", input))).task;
}

/** Creare în masă din titluri (o linie = un task), în ordinea scrisă. */
export async function bulkCreateTasks(base: Omit<CreateTaskInput, "title">, titles: string[]): Promise<BoardTask[]> {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/tasks/bulk`, json("POST", { ...base, titles: clean }))).tasks;
}

export type TaskPatch = Partial<
  Pick<
    BoardTask,
    | "title"
    | "description"
    | "list_id"
    | "status"
    | "priority"
    | "assignees"
    | "start_date"
    | "due_date"
    | "estimated_minutes"
    | "actual_minutes"
    | "tags"
    | "task_set"
    | "position"
    | "is_private"
    | "is_recurring"
    | "recurrence_rule"
    | "board_id"
    | "is_milestone"
  > & { approver_ids?: string[] }
>;

/**
 * Update-ul central. Sincronizarea status ↔ coloană, `completed_at` și istoricul le face
 * serverul — inclusiv din vederile globale, care nu știu coloanele boardului.
 * `lists` rămâne în semnătură pentru compatibilitate cu apelanții portați.
 */
export async function updateTask(id: string, patch: TaskPatch, _actorId?: string, _lists: TaskList[] = []): Promise<BoardTask> {
  return (await api<{ task: BoardTask }>(`${BASE}/tasks/${id}`, json("PATCH", patch))).task;
}

/** Mutarea Kanban: coloană + poziție; statusul îl aliniază serverul la coloana-țintă. */
export async function moveTask(
  taskId: string,
  toListId: string | null,
  position: number,
  _currentStatus?: TaskStatus,
  _targetList?: TaskList | null,
  _actorId?: string,
): Promise<BoardTask> {
  return (await api<{ task: BoardTask }>(`${BASE}/tasks/${taskId}/move`, json("POST", { list_id: toListId, position }))).task;
}

/** Ștergere soft, cu subtaskurile pe orice adâncime. */
export async function deleteTask(id: string, _actorId?: string): Promise<void> {
  await api(`${BASE}/tasks/${id}`, json("DELETE"));
}

/** Anulează o ștergere, împreună cu subtaskurile plecate în aceeași cascadă. */
export async function restoreTask(taskId: string): Promise<number> {
  return (await api<{ restored: number }>(`${BASE}/tasks/${taskId}/restore`, json("POST"))).restored;
}

/**
 * Transformă o ocurență VIITOARE a unei serii recurente într-un task real — o singură dată per
 * (serie, zi): al doilea apel pe aceeași zi întoarce același id.
 */
export async function materializeOccurrence(taskId: string, isoDate: string): Promise<string> {
  return (await api<{ id: string }>(`${BASE}/tasks/${taskId}/occurrences`, json("POST", { date: isoDate }))).id;
}

/** Perechile (serie, zi) deja materializate, pentru seriile date. */
export async function listMaterializedOccurrences(
  seriesIds: string[],
): Promise<{ recurrence_parent_id: string; occurrence_date: string }[]> {
  if (seriesIds.length === 0) return [];
  return (
    await api<{ occurrences: { recurrence_parent_id: string; occurrence_date: string }[] }>(
      `${BASE}/occurrences`,
      json("POST", { series_ids: seriesIds }),
    )
  ).occurrences;
}

// ─── Istoric ─────────────────────────────────────────────────────────────────

export async function listTaskActivity(taskId: string): Promise<TaskActivity[]> {
  return (await api<{ activity: TaskActivity[] }>(`${BASE}/tasks/${taskId}/activity`)).activity;
}

// ─── Comentarii ──────────────────────────────────────────────────────────────

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string | null;
  content: string;
  attachments?: CommentAttachment[];
  mentions?: string[];
  created_at: string;
}

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  return (await api<{ comments: TaskComment[] }>(`${BASE}/tasks/${taskId}/comments`)).comments;
}

/** Mențiunile le derivă serverul din text — cine e @menționat primește notificare. */
export async function addTaskComment(taskId: string, _userId: string | undefined, content: string): Promise<void> {
  await api(`${BASE}/tasks/${taskId}/comments`, json("POST", { content: content.trim() }));
}

export async function deleteTaskComment(id: string): Promise<void> {
  await api(`${BASE}/comments/${id}`, json("DELETE"));
}

/** Câte comentarii are fiecare task. */
export async function countCommentsFor(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  return (await api<{ counts: Record<string, number> }>(`${BASE}/comment-counts`, json("POST", { task_ids: taskIds }))).counts;
}

// ─── Dependențe ──────────────────────────────────────────────────────────────

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

/** Dependențele task-urilor date (ce le blochează). */
export async function listDependenciesFor(taskIds: string[]): Promise<TaskDependency[]> {
  if (taskIds.length === 0) return [];
  return (await api<{ dependencies: TaskDependency[] }>(`${BASE}/dependencies/query`, json("POST", { task_ids: taskIds, direction: "blocked_by" }))).dependencies;
}

/** Sensul INVERS: cine așteaptă după task-urile date. */
export async function listDependentsOf(taskIds: string[]): Promise<TaskDependency[]> {
  if (taskIds.length === 0) return [];
  return (await api<{ dependencies: TaskDependency[] }>(`${BASE}/dependencies/query`, json("POST", { task_ids: taskIds, direction: "blocking" }))).dependencies;
}

export async function addDependency(taskId: string, dependsOnId: string): Promise<void> {
  if (taskId === dependsOnId) return;
  await api(`${BASE}/dependencies`, json("POST", { task_id: taskId, depends_on_task_id: dependsOnId }));
}

export async function removeDependency(id: string): Promise<void> {
  await api(`${BASE}/dependencies/${id}`, json("DELETE"));
}

// ─── Aprobări ────────────────────────────────────────────────────────────────

export async function setApprovers(taskId: string, approverIds: string[]): Promise<void> {
  await api(`${BASE}/tasks/${taskId}`, json("PATCH", { approver_ids: approverIds }));
}

/** Aprobarea închide task-ul; serverul refuză oricum închiderea dacă apelantul nu e aprobator. */
export async function approveTask(taskId: string, _actorId?: string): Promise<void> {
  await api(`${BASE}/tasks/${taskId}/approve`, json("POST"));
}

/** Respingerea nu șterge nimic — trimite task-ul înapoi în lucru, cu motivul ca comentariu. */
export async function rejectTask(taskId: string, _actorId: string | undefined, reason: string): Promise<void> {
  await api(`${BASE}/tasks/${taskId}/reject`, json("POST", { reason: reason.trim() }));
}

/** Câte task-uri îmi așteaptă aprobarea — numărat pe server, pentru badge. */
export async function countPendingApprovals(): Promise<number> {
  return (await api<{ count: number }>(`${BASE}/approvals/count`)).count;
}

// ─── Atașamente pe comentarii ────────────────────────────────────────────────

export interface CommentAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Tipurile acceptate — aceeași listă ca pe server; interfața le filtrează înainte de încărcare. */
export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

/**
 * Încărcarea unui fișier în trei pași (tiparul atașamentelor PAR/CRM): serverul verifică dreptul
 * și dă un URL semnat, browserul urcă octeții direct în Storage (nu prin funcția serverless,
 * plafonată la ~4,5 MB), iar serverul verifică octeții reali înainte să accepte calea.
 */
export async function uploadAttachment(_tenantId: string | null | undefined, taskId: string, file: File): Promise<CommentAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Fișierul depășește limita de 10 MB");
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) throw new Error("Tipul fișierului nu este permis");
  const { path, signedUrl } = await api<{ path: string; signedUrl: string }>(
    `${BASE}/tasks/${taskId}/attachments/sign`,
    json("POST", { fileName: file.name, mime: file.type, sizeBytes: file.size }),
  );
  const put = await fetch(signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("Încărcarea fișierului a eșuat");
  return (
    await api<{ attachment: CommentAttachment }>(
      `${BASE}/tasks/${taskId}/attachments/finalize`,
      json("POST", { path, fileName: file.name, mime: file.type }),
    )
  ).attachment;
}

/** Adresa de deschidere a unui atașament — mereu prin server, care verifică accesul la task. */
export function attachmentUrl(taskId: string, path: string): string {
  return `${BASE}/tasks/${taskId}/attachments/file?path=${encodeURIComponent(path)}`;
}

export async function addTaskCommentWithAttachments(
  taskId: string,
  _userId: string | undefined,
  content: string,
  attachments: CommentAttachment[],
): Promise<void> {
  if (attachments.length > MAX_ATTACHMENT_COUNT) throw new Error("Maximum 10 fișiere per comentariu");
  await api(`${BASE}/tasks/${taskId}/comments`, json("POST", { content: content.trim(), attachments }));
}

// ─── Vederi salvate ──────────────────────────────────────────────────────────

export async function loadViewPref<T>(_userId: string | undefined, viewKey: string): Promise<T | null> {
  try {
    return (await api<{ config: T | null }>(`${BASE}/view-prefs/${encodeURIComponent(viewKey)}`)).config;
  } catch {
    return null;
  }
}

export async function saveViewPref(_userId: string | undefined, viewKey: string, config: unknown): Promise<void> {
  await api(`${BASE}/view-prefs/${encodeURIComponent(viewKey)}`, json("PUT", { config }));
}

// ─── Căutare globală ─────────────────────────────────────────────────────────

/** Caută în titluri peste tot ce vede apelantul. */
export async function searchTasks(query: string): Promise<BoardTask[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/search?q=${encodeURIComponent(clean)}`)).tasks;
}

// ─── Mutarea unui task pe alt board ──────────────────────────────────────────

/**
 * Cardul aterizează „neîncadrat" pe boardul nou (coloanele diferă), iar subtaskurile îl
 * urmează. `toBoardId = null` = task personal (fără board).
 */
export async function moveTaskToBoard(taskId: string, toBoardId: string | null, _actorId?: string): Promise<void> {
  await api(`${BASE}/tasks/${taskId}/move-board`, json("POST", { board_id: toBoardId }));
}

// ─── Operații pe coloane ─────────────────────────────────────────────────────

/** Duplică o coloană împreună cu task-urile ei de nivel principal. */
export async function duplicateList(listId: string, copySuffix: string, _actorId?: string): Promise<void> {
  await api(`${BASE}/lists/${listId}/duplicate`, json("POST", { copy_suffix: copySuffix }));
}

/** Mută toate task-urile dintr-o coloană în alta, păstrând ordinea — un singur drum la server. */
export async function moveAllTasksToList(fromListId: string, toListId: string): Promise<number> {
  return (await api<{ moved: number }>(`${BASE}/lists/${fromListId}/move-all`, json("POST", { to_list_id: toListId }))).moved;
}

export type ListSortKey = "title" | "due_date" | "priority" | "created_at";

/** Reordonează persistent task-urile unei coloane după cheia dată. */
export async function sortListTasks(listId: string, key: ListSortKey): Promise<void> {
  await api(`${BASE}/lists/${listId}/sort`, json("POST", { key }));
}

/** Mută o coloană la stânga/dreapta (poziție fracționată între vecini, calculată pe server). */
export async function reorderList(lists: TaskList[], listId: string, direction: -1 | 1): Promise<void> {
  const index = lists.findIndex((l) => l.id === listId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= lists.length) return;
  await api(`${BASE}/lists/${listId}/reorder`, json("POST", { direction }));
}

// ─── Ia în lucru ─────────────────────────────────────────────────────────────

/** Task-urile libere (fără responsabil) — coada din care echipa își ia de lucru. */
export async function listAvailableTasks(): Promise<BoardTask[]> {
  return (await api<{ tasks: BoardTask[] }>(`${BASE}/tasks?scope=available`)).tasks;
}

export async function claimTask(taskId: string, _actorId?: string): Promise<BoardTask> {
  return (await api<{ task: BoardTask }>(`${BASE}/tasks/${taskId}/claim`, json("POST"))).task;
}

// ─── Reguli de vizibilitate (administratorul workspace-ului) ─────────────────

export async function listVisibilityRules(): Promise<VisibilityRule[]> {
  return (await api<{ rules: VisibilityRule[] }>(`${BASE}/visibility-rules`)).rules;
}

export async function upsertVisibilityRule(input: {
  subject_type: VisibilitySubject;
  subject_user_id?: string | null;
  scope: VisibilityScope;
}): Promise<void> {
  await api(
    `${BASE}/visibility-rules`,
    json("PUT", {
      subject_type: input.subject_type,
      subject_user_id: input.subject_type === "user" ? input.subject_user_id ?? null : null,
      scope: input.scope,
    }),
  );
}

export async function deleteVisibilityRule(id: string): Promise<void> {
  await api(`${BASE}/visibility-rules/${id}`, json("DELETE"));
}

// ─── Identitatea în modul ────────────────────────────────────────────────────

/** Cine sunt în modul: id, nume, dacă administrez workspace-ul, dacă sunt manager. */
export interface TasksMe {
  user_id: string;
  full_name: string;
  is_admin: boolean;
  is_manager: boolean;
  /** Echipele sunt comune cu PAR: adminul, managerul sau un administrator PAR le administrează. */
  can_manage_teams: boolean;
  tenant_id: string;
}

export async function getMe(): Promise<TasksMe> {
  return (await api<{ me: TasksMe }>(`${BASE}/me`)).me;
}
