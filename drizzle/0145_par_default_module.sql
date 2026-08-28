-- PAR devine modulul implicit al produsului (decizie owner, 2026-08-28).
-- Orice organizație are PAR fără nicio setare; FinDesk / ITPark / Document Merge se aprind
-- din Consola Platformă, per client sau ca implicit pentru clienții noi.
--
-- 0138 pornise totul activat (ca activarea consolei să nu ia acces nimănui) și a scris rânduri
-- explicite `enabled = true` pentru fiecare workspace existent. Acele rânduri automate ar fi
-- învins de-acum implicitul din cod, deci le corectăm aici.
UPDATE "platform_module_defaults" SET "enabled" = ("module_key" = 'par'), "updated_at" = now();
--> statement-breakpoint
INSERT INTO "platform_module_defaults" ("module_key", "enabled")
SELECT v.k, v.e FROM (VALUES ('findesk', false), ('par', true), ('itpark', false), ('docmerge', false)) AS v(k, e)
ON CONFLICT ("module_key") DO NOTHING;
--> statement-breakpoint
-- Doar rândurile scrise AUTOMAT (backfill 0138 / signup) se rescriu. O alegere făcută de
-- proprietar din consolă are `updated_by_user_id` = un superadmin și rămâne neatinsă: nu luăm
-- înapoi un modul pe care l-a activat el intenționat pentru un client.
UPDATE "tenant_modules"
SET "enabled" = ("module_key" = 'par'), "updated_at" = now()
WHERE "updated_by_user_id" IS NULL
   OR "updated_by_user_id" NOT IN (SELECT "user_id" FROM "platform_admins");
--> statement-breakpoint
-- Aceeași corecție la nivel de entitate juridică — `requireModuleEntitlement` citește de aici
-- pentru PAR/FinDesk, iar două surse de adevăr care se contrazic înseamnă 403-uri inexplicabile.
UPDATE "par_payer_modules"
SET "enabled" = ("module_key" = 'par'), "updated_at" = now()
WHERE "module_key" <> 'par'
  AND ("updated_by_user_id" IS NULL
       OR "updated_by_user_id" NOT IN (SELECT "user_id" FROM "platform_admins"));
--> statement-breakpoint
-- Excepția care contează: un workspace care are DEJA date într-un modul îl folosește — nu i-l
-- luăm. „Implicit oprit" e o regulă pentru organizațiile neconfigurate, nu un motiv să rupem
-- accesul cuiva la propriile facturi. Verificăm existența tabelei ca migrarea să nu cadă pe
-- un mediu unde modulul n-a fost instalat.
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['findesk', 'fin_invoices'],
    ['findesk', 'fin_expenses'],
    ['itpark', 'itpark_engagements'],
    ['docmerge', 'docmerge_templates']
  ];
  i int;
  mod text;
  rel text;
BEGIN
  FOR i IN 1..array_length(pairs, 1) LOOP
    mod := pairs[i][1];
    rel := pairs[i][2];
    IF to_regclass('public.' || rel) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE tenant_modules SET enabled = true, updated_at = now()
         WHERE module_key = %L AND tenant_id IN (SELECT DISTINCT tenant_id FROM %I)',
        mod, rel);
      EXECUTE format(
        'UPDATE par_payer_modules SET enabled = true, updated_at = now()
         WHERE module_key = %L AND tenant_id IN (SELECT DISTINCT tenant_id FROM %I)',
        mod, rel);
    END IF;
  END LOOP;
END $$;
