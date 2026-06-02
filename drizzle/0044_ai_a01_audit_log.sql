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
CREATE TABLE "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(64) DEFAULT 'system' NOT NULL,
	"model" varchar(100) DEFAULT 'stub' NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micro" integer DEFAULT 0 NOT NULL,
	"pseudonymized" boolean DEFAULT true NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "completions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_from_field_id_form_fields_id_fk" FOREIGN KEY ("from_field_id") REFERENCES "public"."form_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_target_field_id_form_fields_id_fk" FOREIGN KEY ("target_field_id") REFERENCES "public"."form_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_logic_form_idx" ON "form_logic" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_logic_tenant_idx" ON "form_logic" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_logic_from_field_idx" ON "form_logic" USING btree ("from_field_id");--> statement-breakpoint
CREATE INDEX "ai_al_tenant_idx" ON "ai_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ai_al_user_idx" ON "ai_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_al_action_idx" ON "ai_audit_log" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "ai_al_created_idx" ON "ai_audit_log" USING btree ("tenant_id","created_at");