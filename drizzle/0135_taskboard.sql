-- TB-001: TaskBoard — Trello-analog cu planificare per produs/curs.
-- Hand-written (db:generate meta desync — see docs/solutions/database-issues/).
-- IF NOT EXISTS everywhere: sync-schema.ts may have already healed these tables on
-- prod before this migration runs (deploy-lag window), so the migration must be idempotent.
CREATE TABLE IF NOT EXISTS "board_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(32) DEFAULT 'course' NOT NULL,
	"course_id" uuid,
	"start_date" date,
	"end_date" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"color_token" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "board_products_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_products_tenant_idx" ON "board_products" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_products_status_idx" ON "board_products" ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_products_course_idx" ON "board_products" ("course_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "boards_product_id_board_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "board_products"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "boards_tenant_idx" ON "boards" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "boards_product_idx" ON "boards" ("tenant_id","product_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" double precision NOT NULL,
	"wip_limit" integer,
	"is_done_list" boolean DEFAULT false NOT NULL,
	"color_token" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "board_lists_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_lists_tenant_idx" ON "board_lists" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_lists_board_pos_idx" ON "board_lists" ("board_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"product_kind" varchar(32),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_task_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_task_templates_tenant_idx" ON "board_task_templates" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_task_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"assignee_role" varchar(48),
	"default_priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"offset_anchor" varchar(12) DEFAULT 'start' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"default_list_name" varchar(120),
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_task_template_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "board_task_template_items_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "board_task_templates"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_tpl_items_template_pos_idx" ON "board_task_template_items" ("template_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"list_id" uuid,
	"product_id" uuid,
	"title" varchar(300) NOT NULL,
	"description" text,
	"position" double precision DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'todo' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"assignee_user_id" uuid,
	"assignee_role" varchar(48),
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"template_item_id" uuid,
	"source_template_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "tasks_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE cascade,
	CONSTRAINT "tasks_list_id_board_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "board_lists"("id") ON DELETE set null,
	CONSTRAINT "tasks_product_id_board_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "board_products"("id") ON DELETE set null,
	CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE set null,
	CONSTRAINT "tasks_template_item_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "board_task_template_items"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_idx" ON "tasks" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_board_list_pos_idx" ON "tasks" ("board_id","list_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_product_idx" ON "tasks" ("tenant_id","product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_date_idx" ON "tasks" ("tenant_id","due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" ("tenant_id","assignee_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("tenant_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"color_token" varchar(32) DEFAULT 'muted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "board_labels_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_labels_board_idx" ON "board_labels" ("board_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_labels_tenant_idx" ON "board_labels" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "task_labels_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade,
	CONSTRAINT "task_labels_label_id_board_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "board_labels"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_labels_task_idx" ON "task_labels" ("task_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_labels_task_label_uniq" ON "task_labels" ("task_id","label_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"text" varchar(500) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_checklist_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_checklist_task_pos_idx" ON "task_checklist_items" ("task_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade,
	CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_created_idx" ON "task_comments" ("task_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"filename" varchar(300) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"size_bytes" integer,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade,
	CONSTRAINT "task_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_task_idx" ON "task_attachments" ("task_id");
