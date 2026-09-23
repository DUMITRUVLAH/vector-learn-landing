ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_path" text;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_name" varchar(500);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_mime" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_size" integer;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_uploaded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_path" text;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_name" varchar(500);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_mime" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_size" integer;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_uploaded_at" timestamp with time zone;
