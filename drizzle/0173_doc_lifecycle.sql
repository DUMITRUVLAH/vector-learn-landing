-- Actele: ciclul de viață complet (cerințele 42 și 45 din caietul de sarcini Ecosolar).
--
-- Interfața avea de mult etichete pentru „Trimis", „Semnat" și „Refuzat", dar nimic nu le scria:
-- motorul cunoștea doar ciornă → finalizat → anulat. Adică nimeni nu putea răspunde la
-- întrebarea de bază a unei vânzări: „a acceptat clientul oferta?".
--
-- `sent_at` se scrie singur la trimiterea pe e-mail — singurul semnal adevărat că actul a plecat.
-- `outcome_at`/`outcome_reason` le marchează omul: ele descriu ce a făcut clientul.

-- `IF EXISTS` pe tabelă, nu doar pe coloană: pe o bază unde modulul de acte n-a ajuns încă
-- (migrarea 0151 lipsă, tabela creată abia de heal), un ALTER pe o tabelă inexistentă ar opri
-- tot lanțul de migrări. Coloanele ajung acolo oricum, din `ensure/docgen.ts`.
ALTER TABLE IF EXISTS "doc_documents" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE IF EXISTS "doc_documents" ADD COLUMN IF NOT EXISTS "outcome_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE IF EXISTS "doc_documents" ADD COLUMN IF NOT EXISTS "outcome_reason" varchar(500);
