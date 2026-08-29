ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "is_patent_holder" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_series" varchar(50);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_valid_until" varchar(10);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_is_patent_holder" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_series" varchar(50);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_valid_until" varchar(10);
