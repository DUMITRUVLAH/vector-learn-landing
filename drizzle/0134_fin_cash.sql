-- CASH-001: FinDesk — Încasări și reconciliere bancară
-- Tables: fin_bank_transactions, fin_payments, fin_payment_allocations
--
-- Prefix 0120 > max(origin/main)=0114 și > toate ramurile paralele FIN (max 0119).
-- FK externe (fin_parties, fin_invoices) sunt comentate — acele tabele sunt pe
-- ramuri nemergate. Se vor activa la mergeul tuturor ramurilor FIN.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_tx_direction') THEN
    CREATE TYPE fin_tx_direction AS ENUM ('in', 'out');
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_tx_match_status') THEN
    CREATE TYPE fin_tx_match_status AS ENUM ('unmatched', 'matched', 'duplicate', 'ignored');
  END IF;
END $$;
--> statement-breakpoint

-- ─── fin_bank_transactions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_bank_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_label    VARCHAR(200) NOT NULL,
  tx_date          DATE NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'MDL',
  reference        VARCHAR(500),
  counterparty     VARCHAR(500),
  direction        fin_tx_direction NOT NULL,
  import_batch_id  UUID NOT NULL,
  match_status     fin_tx_match_status NOT NULL DEFAULT 'unmatched',
  match_score_bp   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fin_bank_tx_tenant_idx        ON fin_bank_transactions (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_bank_tx_tenant_status_idx ON fin_bank_transactions (tenant_id, match_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_bank_tx_batch_idx         ON fin_bank_transactions (import_batch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_bank_tx_date_idx          ON fin_bank_transactions (tenant_id, tx_date);
--> statement-breakpoint

-- ─── fin_payments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id         UUID,
  -- FK: REFERENCES fin_parties(id) ON DELETE SET NULL (activat post-merge)
  received_date    DATE NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'MDL',
  account_label    VARCHAR(200),
  allocated_cents  INTEGER NOT NULL DEFAULT 0,
  bank_tx_id       UUID,
  -- FK: REFERENCES fin_bank_transactions(id) ON DELETE SET NULL (activat post-merge)
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fin_payments_tenant_idx   ON fin_payments (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_payments_party_idx    ON fin_payments (tenant_id, party_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_payments_date_idx     ON fin_payments (tenant_id, received_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_payments_bank_tx_idx  ON fin_payments (bank_tx_id);
--> statement-breakpoint

-- ─── fin_payment_allocations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_payment_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id   UUID NOT NULL REFERENCES fin_payments(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL,
  -- FK: REFERENCES fin_invoices(id) (activat post-merge cu feat/FIN-bill)
  amount_cents INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fin_pay_alloc_tenant_idx  ON fin_payment_allocations (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_pay_alloc_payment_idx ON fin_payment_allocations (payment_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_pay_alloc_invoice_idx ON fin_payment_allocations (invoice_id);
