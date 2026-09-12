-- Atașamentele PAR ies din Postgres și intră în Supabase Storage.
--
-- De ce: `par_attachments.file_url` ținea data-URL-uri base64, adică fișierele stăteau în baza de
-- date. Base64 umflă orice fișier cu +33%, planul are 500 MB de bază de date, iar listarea unui
-- dosar trăgea tot conținutul chiar dacă omul nu deschidea niciun document. De acum baza ține
-- doar calea obiectului; conținutul stă în bucket-ul privat `par-attachments`.
--
-- Migrarea NU șterge nimic: `file_url` devine doar nullable, iar rândurile vechi rămân citibile
-- până le urcă `scripts/backfill-attachments-storage.mjs`. Fără pierdere de date și fără
-- fereastră în care dosarele existente n-ar putea fi deschise.

ALTER TABLE "par_attachments" ADD COLUMN IF NOT EXISTS "storage_path" text;
--> statement-breakpoint
ALTER TABLE "par_attachments" ADD COLUMN IF NOT EXISTS "mime_type" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_attachments" ADD COLUMN IF NOT EXISTS "size_bytes" integer;
--> statement-breakpoint
-- Rândurile noi nu mai au conținut în DB, deci coloana nu mai poate fi obligatorie.
ALTER TABLE "par_attachments" ALTER COLUMN "file_url" DROP NOT NULL;
--> statement-breakpoint
-- Backfill-ul caută rândurile rămase pe base64; fără index le-ar scana tabela integral, iar
-- tabela asta e exact cea grea.
CREATE INDEX IF NOT EXISTS "par_attachments_pending_backfill_idx"
  ON "par_attachments" ("tenant_id") WHERE "storage_path" IS NULL;
--> statement-breakpoint
-- Documentele încărcate de client prin portalul financiar, aceeași poveste: `storage_path` ținea
-- base64. Steagul spune care rând e deja obiect în Storage și care e încă data-URL vechi.
ALTER TABLE "fin_client_portal_documents"
  ADD COLUMN IF NOT EXISTS "in_object_store" boolean DEFAULT false NOT NULL;
