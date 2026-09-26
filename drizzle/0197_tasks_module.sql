-- 0197_tasks_module: managerul de task-uri (TASKS-001) — boarduri, coloane, membri, task-uri,
-- istoric, comentarii, dependențe, preferințe de vedere și reguli de vizibilitate.
-- Portat din HR365 „Task Boards"; autorizarea e în cod (server/lib/tasks/access.ts), nu în RLS.
-- Aceleași instrucțiuni ca heal-ul din server/db/ensure/tasks.ts (sursa lor unică).
CREATE TABLE IF NOT EXISTS "task_boards" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "description" text,
    "color" varchar(40) DEFAULT 'pastel-sky' NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "starred_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "visibility" varchar(20) DEFAULT 'private' NOT NULL,
    "team_id" uuid REFERENCES "par_teams"("id") ON DELETE set null,
    "archived_at" timestamp with time zone,
    "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_boards_tenant_idx" ON "task_boards" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_boards_team_idx" ON "task_boards" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_boards_one_default_uniq" ON "task_boards" ("tenant_id") WHERE "is_default";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_lists" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "board_id" uuid NOT NULL REFERENCES "task_boards"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "position" double precision DEFAULT 1024 NOT NULL,
    "is_done_list" boolean DEFAULT false NOT NULL,
    "color" varchar(40) DEFAULT 'pastel-sky' NOT NULL,
    "maps_to_status" varchar(20),
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_lists_board_idx" ON "task_lists" ("board_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_board_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "board_id" uuid NOT NULL REFERENCES "task_boards"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "role" varchar(20) DEFAULT 'editor' NOT NULL,
    "added_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_board_members_board_user_uniq" ON "task_board_members" ("board_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_board_members_user_idx" ON "task_board_members" ("tenant_id","user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_tasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "board_id" uuid REFERENCES "task_boards"("id") ON DELETE set null,
    "list_id" uuid REFERENCES "task_lists"("id") ON DELETE set null,
    "parent_task_id" uuid REFERENCES "board_tasks"("id") ON DELETE cascade,
    "title" varchar(500) NOT NULL,
    "description" text,
    "status" varchar(20) DEFAULT 'todo' NOT NULL,
    "priority" varchar(20) DEFAULT 'medium' NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    "assigned_to" uuid REFERENCES "users"("id") ON DELETE set null,
    "assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "assigned_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "start_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "estimated_minutes" integer,
    "actual_minutes" integer,
    "source_module" varchar(40) DEFAULT 'manual' NOT NULL,
    "source_id" uuid,
    "is_private" boolean DEFAULT false NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_rule" varchar(300),
    "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "task_set" varchar(200),
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_milestone" boolean DEFAULT false NOT NULL,
    "approver_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "recurrence_parent_id" uuid REFERENCES "board_tasks"("id") ON DELETE set null,
    "occurrence_date" date,
    "completed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tasks_tenant_idx" ON "board_tasks" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tasks_board_list_pos_idx" ON "board_tasks" ("board_id","list_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tasks_parent_idx" ON "board_tasks" ("parent_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tasks_assigned_idx" ON "board_tasks" ("tenant_id","assigned_to");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tasks_due_idx" ON "board_tasks" ("tenant_id","due_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_tasks_occurrence_uniq" ON "board_tasks" ("recurrence_parent_id","occurrence_date") WHERE "recurrence_parent_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_activity" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "task_id" uuid NOT NULL REFERENCES "board_tasks"("id") ON DELETE cascade,
    "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "action" varchar(40) NOT NULL,
    "from_value" jsonb,
    "to_value" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activity_task_idx" ON "task_activity" ("task_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "task_id" uuid NOT NULL REFERENCES "board_tasks"("id") ON DELETE cascade,
    "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "content" text NOT NULL,
    "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" ("task_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_dependencies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "task_id" uuid NOT NULL REFERENCES "board_tasks"("id") ON DELETE cascade,
    "depends_on_task_id" uuid NOT NULL REFERENCES "board_tasks"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_dependencies_pair_uniq" ON "task_dependencies" ("task_id","depends_on_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dependencies_depends_on_idx" ON "task_dependencies" ("depends_on_task_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_view_prefs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "view_key" varchar(100) NOT NULL,
    "config" jsonb,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_view_prefs_user_key_uniq" ON "task_view_prefs" ("user_id","view_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_visibility_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "subject_type" varchar(20) NOT NULL,
    "subject_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
    "scope" varchar(20) NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_visibility_rules_tenant_idx" ON "task_visibility_rules" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_visibility_rules_group_uniq" ON "task_visibility_rules" ("tenant_id","subject_type") WHERE "subject_user_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_visibility_rules_user_uniq" ON "task_visibility_rules" ("tenant_id","subject_user_id") WHERE "subject_user_id" IS NOT NULL;
