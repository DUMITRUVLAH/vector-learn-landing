CREATE TABLE IF NOT EXISTS "two_factor_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_encrypted" text NOT NULL,
	"recovery_codes_json" text DEFAULT '[]' NOT NULL,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "two_factor_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "two_factor_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "two_factor_settings" ADD CONSTRAINT "two_factor_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "two_factor_settings_user_idx" ON "two_factor_settings" USING btree ("user_id");