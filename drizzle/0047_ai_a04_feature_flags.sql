CREATE TABLE "ai_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"feature" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_ff_tenant_feature_uniq" UNIQUE("tenant_id","feature")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_monthly_budget_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "ai_feature_flags" ADD CONSTRAINT "ai_feature_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_ff_tenant_idx" ON "ai_feature_flags" USING btree ("tenant_id");