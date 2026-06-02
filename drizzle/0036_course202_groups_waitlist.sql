CREATE TYPE "public"."group_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"teacher_id" uuid,
	"max_students" integer DEFAULT 20 NOT NULL,
	"status" "group_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_enrollments" ADD CONSTRAINT "group_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_waitlist" ADD CONSTRAINT "group_waitlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_waitlist" ADD CONSTRAINT "group_waitlist_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_waitlist" ADD CONSTRAINT "group_waitlist_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_tenant_idx" ON "groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "groups_course_idx" ON "groups" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "groups_tenant_course_idx" ON "groups" USING btree ("tenant_id","course_id");--> statement-breakpoint
CREATE INDEX "ge_group_idx" ON "group_enrollments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "ge_student_idx" ON "group_enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "ge_tenant_idx" ON "group_enrollments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gw_group_idx" ON "group_waitlist" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "gw_student_idx" ON "group_waitlist" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "gw_tenant_idx" ON "group_waitlist" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gw_fifo_idx" ON "group_waitlist" USING btree ("group_id","created_at");
