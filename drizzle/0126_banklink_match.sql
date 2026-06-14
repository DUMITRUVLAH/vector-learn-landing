-- BANKLINK-003: add matched_score_bp column to fin_bank_transactions
-- Stores auto-match confidence in basis points (0..10000 = 0..100%)
-- IF NOT EXISTS ensures idempotence (safe to re-run after partial deploy)

ALTER TABLE "fin_bank_transactions" ADD COLUMN IF NOT EXISTS "matched_score_bp" BIGINT DEFAULT 0;
