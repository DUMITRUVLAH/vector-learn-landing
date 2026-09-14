-- PARVERIFY-001 — codul QR de pe formularul PAR tipărit.
--
-- Ana Chirița (ATIC, 14.09.2026): „am printat PAR, nu se văd aprobările pe el — la signature
-- trebuie să fie cod ceva". Rubrica `Signature` ieșea goală prin construcție, deci hârtia nu
-- dovedea nimic. Codurile de semnătură se DERIVĂ (HMAC, fără stocare); singurul lucru care
-- trebuie stocat e tokenul din QR — ca linkul public să poată fi retras dacă hârtia se pierde.
--
-- Un rând per cerere (`par_verify_tokens_par_idx` e UNIC): retipărirea refolosește tokenul,
-- altfel fiecare descărcare de PDF ar fi lăsat în urmă un link valid în plus.

CREATE TABLE IF NOT EXISTS "par_verify_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
  "token" varchar(16) NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "last_used_at" timestamp with time zone,
  "scan_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_verify_tokens_token_idx" ON "par_verify_tokens" ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_verify_tokens_par_idx" ON "par_verify_tokens" ("par_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_verify_tokens_tenant_idx" ON "par_verify_tokens" ("tenant_id");
