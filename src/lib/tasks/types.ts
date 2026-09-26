// Tipurile modulului de task-uri (portat din HR365 „Task Boards").
//
// `board_tasks` e sursa unică: Lista, Kanbanul, Calendarul și „Taskurile mele" sunt
// citiri filtrate ale aceleiași tabele. Tipurile descriu forma JSON pe care o
// întoarce `/api/tasks` (snake_case, ca în sursă), nu rândurile Drizzle.

export const TASK_STATUSES = ['todo', 'in_progress', 'pending', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const BOARD_ROLES = ['viewer', 'editor', 'admin'] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_VISIBILITIES = ['private', 'team', 'company'] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export interface TaskBoard {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  starred_by: string[];
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Cine vede boardul: doar membrii, echipa lui, sau tot workspace-ul. */
  visibility: BoardVisibility;
  /** Echipa (din echipele workspace-ului) care primește acces când `visibility = 'team'`. */
  team_id: string | null;
  /**
   * Drepturile apelantului, calculate de server cu ACEEAȘI funcție care decide
   * și la scriere, ca butoanele să nu mintă.
   */
  can_edit?: boolean;
  can_delete?: boolean;
  /** Rolul efectiv al apelantului pe board (nominal, prin echipă sau prin workspace). */
  my_role?: BoardRole | null;
}

export interface TaskList {
  id: string;
  board_id: string;
  name: string;
  position: number;
  is_done_list: boolean;
  color: string;
  archived_at: string | null;
  /**
   * Statusul impus de coloană la mutarea unui card — sursa de adevăr, în DB
   * (migrația v13). Numele coloanei e text liber, traductibil: până acum
   * maparea se ghicea din nume cu liste fixe RO/EN, deci o companie care lucra
   * în rusă pierdea tăcut sincronizarea. `null` = coloană custom, păstrează
   * statusul curent. Opțional cât timp migrația nu e aplicată peste tot.
   */
  maps_to_status?: TaskStatus | null;
}

export interface BoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: BoardRole;
  added_by: string | null;
  created_at: string;
}

export interface BoardTask {
  /**
   * Seria recurentă din care s-a materializat rândul, și ziua pe care o reprezintă.
   * OPȚIONALE: frontendul poate ajunge live înaintea migrației (CLAUDE.md #3), iar
   * coloanele NU sunt în `TASK_FIELDS` — se citesc separat, tolerant.
   */
  recurrence_parent_id?: string | null;
  occurrence_date?: string | null;
  id: string;
  tenant_id: string;
  board_id: string | null;
  list_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assigned_to: string | null;
  assignees: string[];
  assigned_by: string | null;
  created_by: string | null;
  start_date: string | null;
  due_date: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  source_module: string;
  source_id: string | null;
  is_private: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
  tags: string[];
  /** Sub-inițiativa din interiorul boardului, afișată ca set cu progres. */
  task_set?: string | null;
  sort_order: number;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  is_milestone?: boolean;
  approver_ids?: string[] | null;
  approved_at?: string | null;
  approved_by?: string | null;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: TaskActivityAction;
  from_value: unknown;
  to_value: unknown;
  created_at: string;
}

export type TaskActivityAction =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignees_changed'
  | 'title_changed'
  | 'description_changed'
  | 'list_changed'
  | 'due_date_changed'
  | 'board_changed'
  | 'deleted';

export interface AssignableUser {
  user_id: string;
  full_name: string;
  /** Funcția omului, când e cunoscută; altfel UI-ul arată emailul. */
  job_title: string | null;
  email?: string | null;
  avatar_url: string | null;
  is_board_member: boolean;
  /** Contul e activ? Oamenii plecați rămân în listă doar pentru afișare. */
  is_active?: boolean;
  /** Relația față de cel care caută — decide ordinea și gruparea din selector.
   *  Organigrama de aici n-are șefi și subordonați, deci relațiile sunt eu /
   *  coechipier (aceeași echipă) / restul workspace-ului. */
  relation?: 'self' | 'teammate' | 'company';
}

/** O echipă a workspace-ului, cu oamenii ei (aceleași echipe ca în PAR). */
export interface WorkspaceTeam {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  members: { user_id: string; name: string | null; email: string | null }[];
}

/** Rândul din selectorul de echipă al unui board: „Marketing · 8 persoane". */
export interface SelectableTeam {
  team_id: string;
  name: string;
  member_count: number;
}

// Sursa avea `direct_reports` / `subtree` / `department`, construite pe organigrama
// HR (șef → subordonați). Aici structura workspace-ului sunt echipele, deci domeniul
// intermediar e `team`: task-urile coechipierilor.
export const VISIBILITY_SCOPES = ['own', 'team', 'company'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const VISIBILITY_SUBJECTS = ['user', 'managers', 'all_employees'] as const;
export type VisibilitySubject = (typeof VISIBILITY_SUBJECTS)[number];

export interface VisibilityRule {
  id: string;
  tenant_id: string;
  subject_type: VisibilitySubject;
  subject_user_id: string | null;
  scope: VisibilityScope;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
