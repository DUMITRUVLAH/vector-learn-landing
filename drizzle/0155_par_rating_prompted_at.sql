-- PAR-VENDOR360 — întrebarea „cum a prestat furnizorul?" se pune o SINGURĂ dată per cerere.
--
-- Până acum urma stătea doar în localStorage, deci o autentificare nouă (alt calculator, fereastră
-- privată, stocare curățată) reîncepea aceeași conversație. Coloana ține minte momentul în care
-- solicitantul a fost întrebat; `pending-ratings` sare peste cererile care au deja o valoare aici.
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "rating_prompted_at" timestamp with time zone;
