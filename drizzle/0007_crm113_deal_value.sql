ALTER TABLE "leads" ADD COLUMN "value_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "debt_cents" integer DEFAULT 0 NOT NULL;