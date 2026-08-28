-- PAR: organizația plătitoare capătă identitate completă, nu doar denumire + IDNO.
-- Un workspace poate avea MAI MULTE entități juridice care plătesc (par_payers), așa că
-- datele de identitate nu pot sta în par_settings (care e una singură pe tenant): fiecare
-- plătitor își ține propriile rechizite, contact, semnatar și logo. Sunt folosite pe fișa
-- aprobărilor din PDF și la excluderea propriei organizații din candidații de beneficiar (AI).
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "vat_code" varchar(50);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "address" varchar(500);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "bank_name" varchar(300);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "iban" varchar(64);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "bank_code" varchar(32);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "contact_email" varchar(200);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "director_name" varchar(200);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "director_role" varchar(200);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "logo_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "notes" text;
