-- STMT-005: statement lines carry the partner's fiscal code + bank account so a valid
-- e-Factura (buyer IDNO) can be generated straight from an imported bank statement.
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "counterparty_idno" varchar(13);--> statement-breakpoint
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "counterparty_iban" varchar(34);
