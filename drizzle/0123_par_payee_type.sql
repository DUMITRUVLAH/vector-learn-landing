-- PAR FEATURE 1: add payee_type column ("fizic" | "juridic") to par_requests
-- Prefix 0123 (> 0122_par_attachment_url_text, the current last migration on main).
ALTER TABLE "par_requests" ADD COLUMN "payee_type" varchar(10);
