-- CX-703: Cohort participants table
-- Two sources: 'crm' (enrolled students) and 'manual' (cash/direct adds)
-- Payment statuses mirror copy-roas: full/half/pending/free

CREATE TYPE "public"."participant_payment_status" AS ENUM('full', 'half', 'pending', 'free');--> statement-breakpoint
CREATE TYPE "public"."participant_source" AS ENUM('crm', 'manual');--> statement-breakpoint

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
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_participants" ADD CONSTRAINT "cohort_participants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cohort_participants_tenant_cohort_idx" ON "cohort_participants" USING btree ("tenant_id","cohort_id");--> statement-breakpoint
CREATE INDEX "cohort_participants_cohort_idx" ON "cohort_participants" USING btree ("cohort_id");
