-- Linia de buget își ține moneda (grantul poate fi în EUR/USD, nu doar MDL).
-- Rândurile existente rămân MDL; conversia lor este o decizie de date, nu de schemă.
ALTER TABLE "par_budget_codes" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'MDL' NOT NULL;
