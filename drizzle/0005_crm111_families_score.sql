CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payer_name" varchar(200) NOT NULL,
	"payer_phone" varchar(32),
	"payer_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "families_tenant_idx" ON "families" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;