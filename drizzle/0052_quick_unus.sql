CREATE TYPE "public"."course_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "form_logic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"from_field_id" uuid NOT NULL,
	"condition" jsonb NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_field_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"note_type" varchar(32) DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "status" "course_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "completions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_from_field_id_form_fields_id_fk" FOREIGN KEY ("from_field_id") REFERENCES "public"."form_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_target_field_id_form_fields_id_fk" FOREIGN KEY ("target_field_id") REFERENCES "public"."form_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_logic_form_idx" ON "form_logic" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_logic_tenant_idx" ON "form_logic" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_logic_from_field_idx" ON "form_logic" USING btree ("from_field_id");--> statement-breakpoint
CREATE INDEX "sn_tenant_student_idx" ON "student_notes" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "sn_created_at_idx" ON "student_notes" USING btree ("tenant_id","student_id","created_at");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");