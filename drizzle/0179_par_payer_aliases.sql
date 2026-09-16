-- Aliasurile unei organizații plătitoare: acronimul și denumirile sub care apare pe documente.
--
-- De ce (măsurat pe producție, 16.09.2026): entitatea plătitoare a clientului ATIC avea
-- name = legal_name = "ATIC", fără IDNO și fără IBAN. Documentele o numesc "ASOCIAȚIA NAȚIONALĂ
-- A COMPANIILOR DIN DOMENIUL TIC", deci verificarea „plătitorul e altul" nu avea pe ce se sprijini
-- și raporta nepotrivire pe 17 din cele 59 de neconcordanțe ale ultimelor 10 zile — toate false.
-- Acronimele care nu se deduc din inițiale se scriu aici, o singură dată, de către administrator.
-- Vezi server/lib/par/sameParty.ts (partyAliases) și server/db/schema/par.ts (parPayers.aliases).
ALTER TABLE "par_payers" ADD COLUMN IF NOT EXISTS "aliases" text;
