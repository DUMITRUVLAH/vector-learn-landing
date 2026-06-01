-- FORMS-005: Embed snippet + analytics per formular
-- Adaugă contoare de views/starts/completions pe tabelul forms.
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS (suportat pe Postgres 9.6+).

ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "views" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "starts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "completions" INTEGER NOT NULL DEFAULT 0;
