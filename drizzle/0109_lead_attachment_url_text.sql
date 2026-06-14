-- FIX: lead_attachments.file_url stored the full base64 data URL of the file,
-- but the column was varchar(1000) — so every real upload was rejected/truncated
-- (the API also capped it at 1000 chars → 400 on every attach). Widen to text.
-- Safe widening conversion: no data loss, no rewrite of meaning.
ALTER TABLE "lead_attachments" ALTER COLUMN "file_url" TYPE text;
