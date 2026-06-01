CREATE TYPE "public"."kinder_message_direction" AS ENUM('staff_to_parent', 'parent_to_staff');--> statement-breakpoint
CREATE TABLE "kinder_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"direction" "kinder_message_direction" NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kinder_messages" ADD CONSTRAINT "kinder_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kinder_messages" ADD CONSTRAINT "kinder_messages_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kinder_messages" ADD CONSTRAINT "kinder_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kinder_messages_tenant_idx" ON "kinder_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kinder_messages_student_idx" ON "kinder_messages" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "kinder_messages_sent_at_idx" ON "kinder_messages" USING btree ("sent_at");
