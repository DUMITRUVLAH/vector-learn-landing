CREATE TABLE "ad_campaign_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"utm_campaign" varchar(100) NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"month" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_campaign_budgets" ADD CONSTRAINT "ad_campaign_budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acb_tenant_idx" ON "ad_campaign_budgets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "acb_campaign_idx" ON "ad_campaign_budgets" USING btree ("tenant_id","utm_campaign");