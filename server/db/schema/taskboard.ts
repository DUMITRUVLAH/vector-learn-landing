/**
 * TB-001: TaskBoard — Trello-analog cu planificare per produs/curs.
 *
 * Un singur domeniu, un singur fișier (ca leads.ts / par.ts):
 *   board_products → boards → board_lists → tasks (+ labels, checklist, comments,
 *   attachments) + board_task_templates / board_task_template_items.
 *
 * Design-decizii cheie (plan aprobat 2026-07-07):
 *  - `tasks` e SURSA UNICĂ — Tabel / Kanban / Calendar sunt citiri filtrate ale ei.
 *  - `tasks.listId` NULL = task de planificare (plan-first, fără coloană încă).
 *  - `tasks.status` = enum fix cross-board (todo|in_progress|blocked|done), separat de
 *    coloana Kanban (board_lists) ca rollup-urile manager să meargă pe orice board.
 *  - `position` doublePrecision = indexare fracționată stil Trello (reorder ieftin).
 *  - Enum-urile sunt varchar + validare în aplicație (portabilitate PGlite↔Postgres,
 *    același pattern ca finCalendar.ts / tenants.appKind).
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  date,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { courses } from "./courses";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const BOARD_PRODUCT_STATUSES = ["active", "archived"] as const;
export type BoardProductStatus = (typeof BOARD_PRODUCT_STATUSES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TEMPLATE_OFFSET_ANCHORS = ["start", "end"] as const;
export type TemplateOffsetAnchor = (typeof TEMPLATE_OFFSET_ANCHORS)[number];

/** Dimensiunea de planificare: un produs/curs pe care se planifică taskuri. */
export const boardProducts = pgTable(
  "board_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** Etichetă liberă: course | product | cohort | … */
    kind: varchar("kind", { length: 32 }).notNull().default("course"),
    /** Link opțional către cursul real din CRM. */
    courseId: uuid("course_id").references((): AnyPgColumn => courses.id, {
      onDelete: "set null",
    }),
    /** Ancorele pentru offset-urile din șabloane (data de start/end a ediției). */
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    colorToken: varchar("color_token", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("board_products_tenant_idx").on(t.tenantId),
    statusIdx: index("board_products_status_idx").on(t.tenantId, t.status),
    courseIdx: index("board_products_course_idx").on(t.courseId),
  })
);

/** Containerul de liste/carduri — un board per produs, sau generic (productId null). */
export const boards = pgTable(
  "boards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => boardProducts.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("boards_tenant_idx").on(t.tenantId),
    productIdx: index("boards_product_idx").on(t.tenantId, t.productId),
  })
);

/** Coloanele Kanban ale unui board (user-defined, ordonate fracționat). */
export const boardLists = pgTable(
  "board_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    position: doublePrecision("position").notNull(),
    wipLimit: integer("wip_limit"),
    /** Coloana terminală: mutarea aici setează tasks.status="done" (sync în /move). */
    isDoneList: boolean("is_done_list").notNull().default(false),
    colorToken: varchar("color_token", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("board_lists_tenant_idx").on(t.tenantId),
    boardPosIdx: index("board_lists_board_pos_idx").on(t.boardId, t.position),
  })
);

/**
 * SURSA UNICĂ de taskuri. listId NULL = backlog de planificare (plan-first);
 * dueDate NULL = neprogramat. Tabel/Kanban/Calendar sunt view-uri peste ea.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => boardLists.id, { onDelete: "set null" }),
    /** Denormalizat din board la creare, pt. rollup per produs cross-board. */
    productId: uuid("product_id").references(() => boardProducts.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    position: doublePrecision("position").notNull().default(0),
    /** Enum fix cross-board: todo | in_progress | blocked | done. */
    status: varchar("status", { length: 24 }).notNull().default("todo"),
    priority: varchar("priority", { length: 16 }).notNull().default("normal"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Rolul planificat înainte de a alege persoana ("marketing", "content", …). */
    assigneeRole: varchar("assignee_role", { length: 48 }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Proveniență: ce rând de șablon a generat taskul (dacă e generat). */
    templateItemId: uuid("template_item_id").references(
      (): AnyPgColumn => boardTaskTemplateItems.id,
      { onDelete: "set null" }
    ),
    sourceTemplateId: uuid("source_template_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tasks_tenant_idx").on(t.tenantId),
    boardListPosIdx: index("tasks_board_list_pos_idx").on(t.boardId, t.listId, t.position),
    productIdx: index("tasks_product_idx").on(t.tenantId, t.productId),
    dueDateIdx: index("tasks_due_date_idx").on(t.tenantId, t.dueDate),
    assigneeIdx: index("tasks_assignee_idx").on(t.tenantId, t.assigneeUserId),
    statusIdx: index("tasks_status_idx").on(t.tenantId, t.status),
  })
);

/** Etichete per board (culoare = token semantic, nu hex). */
export const boardLabels = pgTable(
  "board_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    colorToken: varchar("color_token", { length: 32 }).notNull().default("muted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boardIdx: index("board_labels_board_idx").on(t.boardId),
    tenantIdx: index("board_labels_tenant_idx").on(t.tenantId),
  })
);

/** Join many-to-many task ↔ label. */
export const taskLabels = pgTable(
  "task_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => boardLabels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_labels_task_idx").on(t.taskId),
    taskLabelUniq: uniqueIndex("task_labels_task_label_uniq").on(t.taskId, t.labelId),
  })
);

/** Checklist plat per task (MVP — fără grupuri). */
export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 500 }).notNull(),
    done: boolean("done").notNull().default(false),
    position: doublePrecision("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskPosIdx: index("task_checklist_task_pos_idx").on(t.taskId, t.position),
  })
);

/** Comentarii / activitate per task. */
export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskCreatedIdx: index("task_comments_task_created_idx").on(t.taskId, t.createdAt),
  })
);

/** Atașamente per task — doar metadata în MVP (upload real refolosește infra existentă mai târziu). */
export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 300 }).notNull(),
    url: varchar("url", { length: 1000 }).notNull(),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_attachments_task_idx").on(t.taskId),
  })
);

/** Set reutilizabil de taskuri pentru un tip de produs (feature-cheie). */
export const boardTaskTemplates = pgTable(
  "board_task_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    /** Ce tip de produs țintește (filtrare) — corespunde board_products.kind. */
    productKind: varchar("product_kind", { length: 32 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("board_task_templates_tenant_idx").on(t.tenantId),
  })
);

/** Rândurile șablonului: offset relativ de zile față de startul/finalul produsului. */
export const boardTaskTemplateItems = pgTable(
  "board_task_template_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => boardTaskTemplates.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    assigneeRole: varchar("assignee_role", { length: 48 }),
    defaultPriority: varchar("default_priority", { length: 16 }).notNull().default("normal"),
    /** Care dată de produs e ancora: start | end. */
    offsetAnchor: varchar("offset_anchor", { length: 12 }).notNull().default("start"),
    /** Cu semn: -30 = 30 zile ÎNAINTE de ancoră; +7 = 7 zile după. */
    offsetDays: integer("offset_days").notNull().default(0),
    /** În ce coloană cade la generare (potrivit după nume, case-insensitive). */
    defaultListName: varchar("default_list_name", { length: 120 }),
    position: doublePrecision("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templatePosIdx: index("board_tpl_items_template_pos_idx").on(t.templateId, t.position),
  })
);

export type BoardProduct = typeof boardProducts.$inferSelect;
export type NewBoardProduct = typeof boardProducts.$inferInsert;
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type BoardList = typeof boardLists.$inferSelect;
export type NewBoardList = typeof boardLists.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type BoardLabel = typeof boardLabels.$inferSelect;
export type TaskLabel = typeof taskLabels.$inferSelect;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type BoardTaskTemplate = typeof boardTaskTemplates.$inferSelect;
export type NewBoardTaskTemplate = typeof boardTaskTemplates.$inferInsert;
export type BoardTaskTemplateItem = typeof boardTaskTemplateItems.$inferSelect;
export type NewBoardTaskTemplateItem = typeof boardTaskTemplateItems.$inferInsert;
