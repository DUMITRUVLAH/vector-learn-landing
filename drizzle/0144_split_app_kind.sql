-- SPLIT-001: Add app_kind to tenants to separate CRM Educational (learn) from Business Suite (business)
-- Uses ADD COLUMN IF NOT EXISTS + default 'learn' so existing tenants are backfilled automatically
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "app_kind" varchar(20) NOT NULL DEFAULT 'learn';
