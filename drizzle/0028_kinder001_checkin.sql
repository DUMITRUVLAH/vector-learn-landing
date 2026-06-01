-- KINDER-001: Kindergarten check-in / sign-out
-- authorized_pickups: persons authorized to pick up a child (with optional PIN)
-- checkin_log: daily check-in/out records with e-signature

CREATE TABLE "authorized_pickups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"relation" varchar(100),
	"phone" varchar(32),
	"pin_hash" varchar(64),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"pickup_person_name" varchar(200),
	"signature_data_url" text,
	"staff_user_id" uuid,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorized_pickups" ADD CONSTRAINT "authorized_pickups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorized_pickups" ADD CONSTRAINT "authorized_pickups_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_log" ADD CONSTRAINT "checkin_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_log" ADD CONSTRAINT "checkin_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_log" ADD CONSTRAINT "checkin_log_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authorized_pickups_tenant_idx" ON "authorized_pickups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "authorized_pickups_student_idx" ON "authorized_pickups" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "checkin_log_tenant_idx" ON "checkin_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "checkin_log_student_date_idx" ON "checkin_log" USING btree ("student_id","log_date");--> statement-breakpoint
CREATE INDEX "checkin_log_tenant_date_idx" ON "checkin_log" USING btree ("tenant_id","log_date");
