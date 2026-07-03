-- fin_invoices.number: migration 0126 created it as varchar(50) NULLABLE, but the Drizzle
-- schema (and prod Supabase, where the table pre-existed 0126's no-op CREATE IF NOT EXISTS)
-- use INTEGER NOT NULL. On any FRESH database (PGlite, new deploys) the type mismatch makes
-- "COALESCE(MAX(number), 0)::int" 500 the whole statement→e-Factura submit flow.
-- Guarded: converts ONLY when the column is still character; a no-op on prod (already int).
-- (Prefix 0131: 0130 is reserved by the in-flight perf branch — avoids the known collision.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_invoices' AND column_name = 'number'
      AND data_type IN ('character varying', 'text')
  ) THEN
    ALTER TABLE "fin_invoices"
      ALTER COLUMN "number" TYPE integer
      USING COALESCE(NULLIF(regexp_replace(COALESCE("number", '0'), '[^0-9]', '', 'g'), ''), '0')::integer;
  END IF;
END $$;
