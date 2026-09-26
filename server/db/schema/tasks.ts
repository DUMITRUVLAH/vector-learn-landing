/**
 * TASKS — managerul de task-uri (boarduri, coloane, task-uri), portat din HR365 „Task Boards".
 *
 * Modelul, ca în sursă (și ca în Asana): workspace → board → coloană → task, cu subtaskuri prin
 * `parent_task_id`. Principiul care ține tot: `board_tasks` e SURSA UNICĂ. Lista, Kanbanul,
 * Calendarul, Gantt-ul și „Task-urile mele" sunt citiri filtrate ale aceleiași tabele, nu
 * tabele paralele — o bifă într-o vedere e bifa din toate.
 *
 * Diferențele față de sursă, toate din cauza stack-ului:
 * - **Autorizarea e în cod, nu în RLS/triggere.** Sursa ținea regulile în funcții SQL
 *   (`hr_task_board_access`, `hr_task_validate_write`…). Aici toate trec printr-un singur loc,
 *   `server/lib/tasks/access.ts`, folosit de citire ȘI de scriere — ca butoanele să nu mintă.
 * - **Izolarea pe workspace e explicită**: fiecare tabel are `tenant_id` și fiecare interogare îl
 *   filtrează. Nu există RLS care să prindă o scăpare.
 * - **Listele (responsabili, etichete, stele, aprobatori) sunt `jsonb`, nu `uuid[]`**: repo-ul nu
 *   folosește array-uri Postgres nicăieri, iar `sync-schema` știe să vindece coloane jsonb.
 * - **Echipele sunt cele existente** (`par_teams` / `par_team_members`), nu un al doilea concept
 *   de „echipă" în produs — exact decizia din sursa v10 („în ce echipă sunt?" are un singur
 *   răspuns). Un board cu `visibility = 'team'` e deschis membrilor echipei lui.
 *
 * Indecșii PARȚIALI (un singur board implicit per workspace, regulile de grup unice) stau doar în
 * SQL — migrarea și `server/db/ensure/tasks.ts` —, nu aici: `sync-schema` nu știe să-i refacă.
 *
 * Migrare: drizzle/0197_tasks_module.sql
 */
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { parTeams } from "./par";

// ─── task_boards ──────────────────────────────────────────────────────────────

/**
 * Un board = un proiect / un departament. Cel implicit (`is_default`, „General") e spațiul comun al
 * workspace-ului: se creează singur la prima intrare în modul (`ensureDefaultBoard`), e deschis
 * întregii organizații și nu se șterge. Task-urile FĂRĂ board nu ajung pe el — rămân personale.
 *
 * `visibility`: `private` — doar membrii din `task_board_members` · `team` — plus membrii echipei
 * `team_id` · `company` — oricine din workspace. Membrul nominal bate mereu grantul de echipă,
 * ca să poți da `admin` cuiva din afara echipei sau `viewer` cuiva din ea.
 */
export const taskBoards = pgTable(
  "task_boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    /** Tonul pastel din `index.css` (`pastel-sky`, `pastel-mint`…), nu un hex. */
    color: varchar("color", { length: 40 }).notNull().default("pastel-sky"),
    isDefault: boolean("is_default").notNull().default(false),
    /** Steaua e per om: cine a fixat boardul în bara lui. */
    starredBy: jsonb("starred_by").$type<string[]>().notNull().default([]),
    visibility: varchar("visibility", { length: 20 }).notNull().default("private"),
    teamId: uuid("team_id").references(() => parTeams.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_boards_tenant_idx").on(t.tenantId),
    index("task_boards_team_idx").on(t.teamId),
  ],
);

export type TaskBoardRow = typeof taskBoards.$inferSelect;
export type NewTaskBoardRow = typeof taskBoards.$inferInsert;

// ─── task_lists ───────────────────────────────────────────────────────────────

/**
 * Coloanele unui board. Poziții fracționate (patternul Trello): o mutare = un singur UPDATE.
 *
 * `maps_to_status` e statusul pe care coloana îl impune cardului mutat în ea — dată structurată,
 * separată de nume. Numele e text liber și traductibil; ghicitul statusului din nume mergea doar
 * în limbile pe care le știa codul. `is_done_list` rămâne autoritar pentru „gata".
 */
export const taskLists = pgTable(
  "task_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => taskBoards.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    position: doublePrecision("position").notNull().default(1024),
    isDoneList: boolean("is_done_list").notNull().default(false),
    color: varchar("color", { length: 40 }).notNull().default("pastel-sky"),
    mapsToStatus: varchar("maps_to_status", { length: 20 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_lists_board_idx").on(t.boardId, t.position)],
);

export type TaskListRow = typeof taskLists.$inferSelect;
export type NewTaskListRow = typeof taskLists.$inferInsert;

// ─── task_board_members ───────────────────────────────────────────────────────

/** Cine e pe un board și cu ce rol: `viewer` · `editor` · `admin`. */
export const taskBoardMembers = pgTable(
  "task_board_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => taskBoards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("editor"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_board_members_board_user_uniq").on(t.boardId, t.userId),
    index("task_board_members_user_idx").on(t.tenantId, t.userId),
  ],
);

export type TaskBoardMemberRow = typeof taskBoardMembers.$inferSelect;

// ─── board_tasks ──────────────────────────────────────────────────────────────

/**
 * Task-ul. `board_id` NULL = task personal (fără board), vizibil doar creatorului și
 * responsabililor. `assignees` e lista de responsabili; `assigned_to` rămâne sincronizat cu
 * primul, pentru filtrele simple și pentru integrările care știu un singur responsabil.
 *
 * Termenele sunt `timestamptz` ancorate la prânz local (vezi `toDueDateIso` în client), ca ziua
 * să nu alunece la citirea în alt fus orar.
 *
 * Recurența: rândul-serie poartă `is_recurring` + `recurrence_rule`; o ocurență viitoare devine
 * rând real doar când cineva lucrează pe ea (`recurrence_parent_id` + `occurrence_date`, unică
 * per serie și zi — a doua materializare a aceleiași zile întoarce același rând).
 */
export const boardTasks = pgTable(
  "board_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").references(() => taskBoards.id, { onDelete: "set null" }),
    listId: uuid("list_id").references(() => taskLists.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => boardTasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    /** `todo` · `in_progress` · `pending` · `done` — varchar, nu enum: stările pot crește fără migrare. */
    status: varchar("status", { length: 20 }).notNull().default("todo"),
    /** `low` · `medium` · `high` · `urgent`. */
    priority: varchar("priority", { length: 20 }).notNull().default("medium"),
    position: doublePrecision("position").notNull().default(0),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    assignees: jsonb("assignees").$type<string[]>().notNull().default([]),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    actualMinutes: integer("actual_minutes"),
    /** De unde vine task-ul: `manual` sau un modul (`crm`, `par`…), cu `source_id` al rândului de acolo. */
    sourceModule: varchar("source_module", { length: 40 }).notNull().default("manual"),
    sourceId: uuid("source_id"),
    isPrivate: boolean("is_private").notNull().default(false),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceRule: varchar("recurrence_rule", { length: 300 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Sub-inițiativa din interiorul boardului (ex. „Lansare"), afișată ca set cu progres. */
    taskSet: varchar("task_set", { length: 200 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isMilestone: boolean("is_milestone").notNull().default(false),
    /** Cine trebuie să aprobe închiderea. Listă goală = nu are nevoie de aprobare. */
    approverIds: jsonb("approver_ids").$type<string[]>().notNull().default([]),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * `SET NULL`, ca în sursă: ștergerea seriei (doar odată cu boardul ei) nu ia cu ea zilele deja
     * lucrate — o ocurență mutată pe alt board rămâne acolo, desprinsă (ADV-TASKS-04).
     */
    recurrenceParentId: uuid("recurrence_parent_id").references((): AnyPgColumn => boardTasks.id, {
      onDelete: "set null",
    }),
    occurrenceDate: date("occurrence_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("board_tasks_tenant_idx").on(t.tenantId),
    index("board_tasks_board_list_pos_idx").on(t.boardId, t.listId, t.position),
    index("board_tasks_parent_idx").on(t.parentTaskId),
    index("board_tasks_assigned_idx").on(t.tenantId, t.assignedTo),
    index("board_tasks_due_idx").on(t.tenantId, t.dueDate),
    // `board_tasks_occurrence_uniq` (o zi per serie, doar între rândurile VII) e parțial, deci stă
    // în SQL (`server/db/ensure/tasks.ts`): o ocurență ștearsă nu mai ține ziua ocupată.
  ],
);

export type BoardTaskRow = typeof boardTasks.$inferSelect;
export type NewBoardTaskRow = typeof boardTasks.$inferInsert;

// ─── task_activity ────────────────────────────────────────────────────────────

/** Istoricul unui task, append-only: cine a schimbat ce, din ce în ce. */
export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => boardTasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 40 }).notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
);

export type TaskActivityRow = typeof taskActivity.$inferSelect;

// ─── task_comments ────────────────────────────────────────────────────────────

export interface TaskCommentAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Comentariile unui task. `mentions` se DERIVĂ din text la scriere (cine e @menționat primește
 * notificare), nu se ține separat în editor: cine șterge „@Ana" înainte de trimitere nu trebuie
 * să-i trimită Anei o notificare despre un comentariu în care nu mai apare.
 */
export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => boardTasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    attachments: jsonb("attachments").$type<TaskCommentAttachment[]>().notNull().default([]),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

export type TaskCommentRow = typeof taskComments.$inferSelect;

// ─── task_dependencies ────────────────────────────────────────────────────────

/** „A depinde de B": A nu se poate închide cât B nu e gata. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => boardTasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => boardTasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_dependencies_pair_uniq").on(t.taskId, t.dependsOnTaskId),
    index("task_dependencies_depends_on_idx").on(t.dependsOnTaskId),
  ],
);

export type TaskDependencyRow = typeof taskDependencies.$inferSelect;

// ─── task_view_prefs ──────────────────────────────────────────────────────────

/** Filtrele / vederea salvate ale unui om pe o pagină a modulului. */
export const taskViewPrefs = pgTable(
  "task_view_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewKey: varchar("view_key", { length: 100 }).notNull(),
    config: jsonb("config").$type<unknown>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("task_view_prefs_user_key_uniq").on(t.userId, t.viewKey)],
);

// ─── task_visibility_rules ────────────────────────────────────────────────────

/**
 * Ce task-uri ale ALTORA vede cineva, în plus față de ale lui și de boardurile pe care e.
 *
 * `subject_type`: `user` (excepție pe o persoană) · `managers` · `all_employees`.
 * `scope`: `own` · `team` (coechipierii din `par_teams`) · `company`.
 * Precedența: excepția pe persoană bate regula de manageri, care bate regula pentru toți.
 * Un singur rând per (workspace, subiect) — indecșii unici parțiali stau în SQL.
 */
export const taskVisibilityRules = pgTable(
  "task_visibility_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 20 }).notNull(),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 20 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_visibility_rules_tenant_idx").on(t.tenantId)],
);

export type TaskVisibilityRuleRow = typeof taskVisibilityRules.$inferSelect;
