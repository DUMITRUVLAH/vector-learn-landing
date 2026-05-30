-- CRM-130: Add wip_limit to pipeline_stages
-- Additive nullable column — safe for existing rows (NULL = no limit)
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "wip_limit" integer;
