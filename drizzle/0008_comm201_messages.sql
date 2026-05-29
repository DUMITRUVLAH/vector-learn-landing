CREATE TYPE "public"."message_channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid,
	"student_id" uuid,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"channel" "message_channel" NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"subject" varchar(500),
	"template_id" uuid,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" varchar(200),
	"error_message" varchar(1000),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "msg_tenant_idx" ON "messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "msg_lead_idx" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "msg_student_idx" ON "messages" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "msg_status_idx" ON "messages" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "msg_created_idx" ON "messages" USING btree ("tenant_id","created_at");