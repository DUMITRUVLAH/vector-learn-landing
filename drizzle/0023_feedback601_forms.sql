CREATE TYPE "public"."feedback_invitation_status" AS ENUM('pending', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."feedback_question_type" AS ENUM('rating', 'nps', 'text', 'yesno');--> statement-breakpoint
CREATE TABLE "feedback_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "feedback_invitation_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"type" "feedback_question_type" NOT NULL,
	"label" varchar(500) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_invitation_id_feedback_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."feedback_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_question_id_feedback_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."feedback_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_invitations" ADD CONSTRAINT "feedback_invitations_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_invitations" ADD CONSTRAINT "feedback_invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_questions" ADD CONSTRAINT "feedback_questions_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_answers_invitation_idx" ON "feedback_answers" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "feedback_answers_question_idx" ON "feedback_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "feedback_forms_tenant_idx" ON "feedback_forms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_form_idx" ON "feedback_invitations" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_student_idx" ON "feedback_invitations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_token_idx" ON "feedback_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "feedback_questions_form_idx" ON "feedback_questions" USING btree ("form_id");