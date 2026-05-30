CREATE TYPE "public"."branch_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" varchar(500),
	"manager_user_id" uuid,
	"status" "branch_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "branches_status_idx" ON "branches" USING btree ("tenant_id","status");