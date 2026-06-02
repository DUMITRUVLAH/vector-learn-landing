CREATE TABLE "student_churn_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trend" varchar(16) DEFAULT 'stable' NOT NULL,
	"suggested_action" text,
	"audit_id" uuid,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_churn_scores" ADD CONSTRAINT "student_churn_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_churn_scores" ADD CONSTRAINT "student_churn_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "churn_tenant_idx" ON "student_churn_scores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "churn_student_idx" ON "student_churn_scores" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "churn_score_idx" ON "student_churn_scores" USING btree ("tenant_id","score");