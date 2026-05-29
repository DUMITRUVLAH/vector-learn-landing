CREATE TABLE "lead_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" varchar(100),
	"phone" varchar(32),
	"email" varchar(255),
	"is_primary" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "value_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company" varchar(300);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deal_name" varchar(300);--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lc_tenant_idx" ON "lead_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lc_lead_idx" ON "lead_contacts" USING btree ("lead_id");