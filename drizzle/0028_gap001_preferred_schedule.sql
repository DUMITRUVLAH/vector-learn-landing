CREATE TYPE "public"."notification_type" AS ENUM('task_due', 'lead_converted', 'lead_created', 'system');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."beneficiary_type" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TYPE "public"."contract_currency" AS ENUM('MDL', 'EUR', 'RON');--> statement-breakpoint
CREATE TYPE "public"."contract_format" AS ENUM('fizic', 'online');--> statement-breakpoint
CREATE TYPE "public"."feedback_invitation_status" AS ENUM('pending', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."feedback_question_type" AS ENUM('rating', 'nps', 'text', 'yesno');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."participant_payment_status" AS ENUM('full', 'half', 'pending', 'free');--> statement-breakpoint
CREATE TYPE "public"."participant_source" AS ENUM('crm', 'manual');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(500),
	"link" varchar(500),
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"filters" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"trigger_stage" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_cadence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"cadence_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"next_fire_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity_type" varchar(64) DEFAULT 'lead' NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" varchar(64) NOT NULL,
	"prefix" varchar(10) DEFAULT 'VL' NOT NULL,
	"daily_seq" integer DEFAULT 1 NOT NULL,
	"contract_date" date NOT NULL,
	"beneficiary_type" "beneficiary_type" DEFAULT 'pf' NOT NULL,
	"beneficiary_name" varchar(300),
	"idn" varchar(20),
	"company_name" varchar(300),
	"company_idno" varchar(20),
	"rep_name" varchar(200),
	"rep_role" varchar(100),
	"course" varchar(200),
	"hours" integer,
	"schedule_text" varchar(500),
	"language" varchar(100),
	"format" "contract_format",
	"location" varchar(200),
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" "contract_currency" DEFAULT 'MDL' NOT NULL,
	"persons" integer DEFAULT 1 NOT NULL,
	"lead_id" uuid,
	"student_id" uuid,
	"pdf_url" varchar(1000),
	"data" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payment_id" uuid,
	"series" varchar(20) DEFAULT 'VECT' NOT NULL,
	"number" integer NOT NULL,
	"invoice_number" varchar(30) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'RON' NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"pdf_key" varchar(500),
	"efactura_status" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'RON' NOT NULL,
	"billing_day" smallint NOT NULL,
	"description" varchar(200),
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"next_billing_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"label" varchar(300) NOT NULL,
	"start_date" date NOT NULL,
	"total_hours" integer DEFAULT 32 NOT NULL,
	"hours_per_session" integer DEFAULT 2 NOT NULL,
	"schedule_days" jsonb,
	"is_online" boolean DEFAULT false NOT NULL,
	"manual_end_date" date,
	"mentor_cost_cents" integer DEFAULT 0 NOT NULL,
	"room_cost_cents" integer DEFAULT 0 NOT NULL,
	"drive_folder_url" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"student_id" uuid,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255),
	"phone" varchar(32),
	"notes" varchar(1000),
	"whatsapp_joined" boolean DEFAULT false NOT NULL,
	"payment_status" "participant_payment_status",
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"source" "participant_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid,
	"cohort_id" uuid,
	"name" varchar(200) NOT NULL,
	"background_url" varchar(1000),
	"fields_config" jsonb,
	"is_global" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issued_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"certificate_id" varchar(100) NOT NULL,
	"cohort_id" uuid,
	"template_id" uuid,
	"participant_name" varchar(300) NOT NULL,
	"course_name" varchar(300) NOT NULL,
	"edition" varchar(100),
	"mentor_name" varchar(200),
	"completion_date" date,
	"verification_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pdf_url" varchar(1000),
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_certificates_verification_token_unique" UNIQUE("verification_token"),
	CONSTRAINT "issued_cert_tenant_certid_uniq" UNIQUE("tenant_id","certificate_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sla_hot_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sla_default_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "rot_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "preferred_days" jsonb;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "preferred_time_start" time;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "preferred_time_end" time;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "preferred_days" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "preferred_time_start" time;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "preferred_time_end" time;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "probability_pct" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadences" ADD CONSTRAINT "cadences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_cadence_id_cadences_id_fk" FOREIGN KEY ("cadence_id") REFERENCES "public"."cadences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_invitation_id_feedback_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."feedback_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_question_id_feedback_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."feedback_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_invitations" ADD CONSTRAINT "feedback_invitations_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_invitations" ADD CONSTRAINT "feedback_invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_questions" ADD CONSTRAINT "feedback_questions_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_template_id_certificate_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."certificate_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notif_tenant_idx" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "sv_tenant_idx" ON "saved_views" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sv_user_idx" ON "saved_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cad_tenant_idx" ON "cadences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cad_enabled_idx" ON "cadences" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE INDEX "lce_tenant_idx" ON "lead_cadence_enrollments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lce_lead_idx" ON "lead_cadence_enrollments" USING btree ("lead_id","status");--> statement-breakpoint
CREATE INDEX "lce_fire_idx" ON "lead_cadence_enrollments" USING btree ("status","next_fire_at");--> statement-breakpoint
CREATE INDEX "lce_cadence_idx" ON "lead_cadence_enrollments" USING btree ("cadence_id");--> statement-breakpoint
CREATE INDEX "cal_tenant_time_idx" ON "crm_audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "cal_entity_idx" ON "crm_audit_log" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "cal_actor_idx" ON "crm_audit_log" USING btree ("tenant_id","actor_id");--> statement-breakpoint
CREATE INDEX "contracts_tenant_idx" ON "contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contracts_tenant_date_idx" ON "contracts" USING btree ("tenant_id","contract_date");--> statement-breakpoint
CREATE INDEX "contracts_number_idx" ON "contracts" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "contracts_lead_idx" ON "contracts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "contracts_student_idx" ON "contracts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "feedback_answers_invitation_idx" ON "feedback_answers" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "feedback_answers_question_idx" ON "feedback_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "feedback_forms_tenant_idx" ON "feedback_forms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_form_idx" ON "feedback_invitations" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_student_idx" ON "feedback_invitations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "feedback_invitations_token_idx" ON "feedback_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "feedback_questions_form_idx" ON "feedback_questions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "invoices" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "invoices_number_idx" ON "invoices" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_student_idx" ON "subscriptions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_billing_idx" ON "subscriptions" USING btree ("tenant_id","next_billing_date");--> statement-breakpoint
CREATE INDEX "cohorts_tenant_course_idx" ON "cohorts" USING btree ("tenant_id","course_id");--> statement-breakpoint
CREATE INDEX "cohorts_tenant_start_idx" ON "cohorts" USING btree ("tenant_id","start_date");--> statement-breakpoint
CREATE INDEX "cohort_participants_tenant_cohort_idx" ON "cohort_participants" USING btree ("tenant_id","cohort_id");--> statement-breakpoint
CREATE INDEX "cohort_participants_cohort_idx" ON "cohort_participants" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "cert_tmpl_tenant_global_idx" ON "certificate_templates" USING btree ("tenant_id","is_global");--> statement-breakpoint
CREATE INDEX "cert_tmpl_tenant_course_idx" ON "certificate_templates" USING btree ("tenant_id","course_id");--> statement-breakpoint
CREATE INDEX "issued_cert_tenant_idx" ON "issued_certificates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "students_debt_idx" ON "students" USING btree ("tenant_id","debt_cents");