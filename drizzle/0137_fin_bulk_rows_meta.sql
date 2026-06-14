-- MASS-003: Adaugă coloana meta (JSONB) la fin_bulk_rows
-- Necesară pentru a stoca csv_line + csv_headers per rând CSV în joburile de import.

ALTER TABLE "fin_bulk_rows"
  ADD COLUMN IF NOT EXISTS "meta" jsonb DEFAULT '{}';
