-- INST-001: institution type on tenants (gradinita | scoala | mixt)
-- varchar (not enum) + NOT NULL DEFAULT 'mixt' so existing tenants keep seeing all modules.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "institution_type" varchar(20) NOT NULL DEFAULT 'mixt';
