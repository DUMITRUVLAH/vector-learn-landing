-- SET-802: Notification preferences — per-user opt-in/out per category
-- Adds notification_category enum and notification_preferences table.

CREATE TYPE "public"."notification_category" AS ENUM('system', 'marketing', 'alerts', 'lessons');
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "np_user_category_uq" UNIQUE("user_id","category")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "np_tenant_idx" ON "notification_preferences" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "np_user_idx" ON "notification_preferences" USING btree ("user_id");
