CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"prefix" varchar(8) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "completions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");
