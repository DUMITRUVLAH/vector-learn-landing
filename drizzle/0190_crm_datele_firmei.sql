-- CRM-D04: rechizitele firmei tale, scrise o singură dată, tipărite pe fiecare act (noi.*).
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "iban" varchar(34);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "bank_name" varchar(200);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "bic" varchar(11);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "administrator_name" varchar(200);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "administrator_title" varchar(100);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "phone" varchar(40);
--> statement-breakpoint
ALTER TABLE "fin_org_profile" ADD COLUMN IF NOT EXISTS "email" varchar(255);
