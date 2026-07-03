-- Fix: par_attachments.file_url + par_payments.proof_url stored base64 data URLs (megabytes) but
-- were varchar(2000) → every real file upload failed with
-- "value too long for type character varying(2000)". Widen to text (no-rewrite metadata change).
-- Migration prefix: 0122 (> 0121 on origin/main)
ALTER TABLE "par_attachments" ALTER COLUMN "file_url" TYPE text;
--> statement-breakpoint
ALTER TABLE "par_payments" ALTER COLUMN "proof_url" TYPE text;
