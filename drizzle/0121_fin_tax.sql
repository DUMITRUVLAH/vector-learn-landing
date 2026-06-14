-- FISC-001: FinDesk — Perioade fiscale și declarații
-- Tables: fin_tax_periods, fin_tax_declarations
--
-- Prefix 0121 > max(origin/main)=0120 (fin_cash).
-- Enum-uri create idempotent cu DO $$ BEGIN IF NOT EXISTS … END $$;
-- Statement-breakpoints respectate (CLAUDE.md §3.5.1).

-- ─── Enum: fin_tax_period_type ────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_tax_period_type') THEN
    CREATE TYPE fin_tax_period_type AS ENUM ('monthly', 'quarterly', 'annual');
  END IF;
END $$;
--> statement-breakpoint

-- ─── Enum: fin_tax_period_status ─────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_tax_period_status') THEN
    CREATE TYPE fin_tax_period_status AS ENUM ('open', 'locked', 'filed');
  END IF;
END $$;
--> statement-breakpoint

-- ─── Enum: fin_declaration_type ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_declaration_type') THEN
    CREATE TYPE fin_declaration_type AS ENUM ('tva12_md', 'd394_ro', 'd301_ro', 'income_md');
  END IF;
END $$;
--> statement-breakpoint

-- ─── Enum: fin_declaration_status ────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_declaration_status') THEN
    CREATE TYPE fin_declaration_status AS ENUM ('draft', 'ready', 'filed');
  END IF;
END $$;
--> statement-breakpoint

-- ─── fin_tax_periods ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_tax_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_type  fin_tax_period_type NOT NULL,
  year         INTEGER NOT NULL,
  month        INTEGER,
  quarter      INTEGER,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       fin_tax_period_status NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fin_tax_periods_tenant_idx        ON fin_tax_periods (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_tax_periods_tenant_year_idx   ON fin_tax_periods (tenant_id, year);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_tax_periods_tenant_status_idx ON fin_tax_periods (tenant_id, status);
--> statement-breakpoint

-- ─── fin_tax_declarations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_tax_declarations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id         UUID NOT NULL REFERENCES fin_tax_periods(id) ON DELETE CASCADE,
  declaration_type  fin_declaration_type NOT NULL,
  status            fin_declaration_status NOT NULL DEFAULT 'draft',
  filed_at          TIMESTAMPTZ,
  notes             TEXT,
  payload           JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fin_tax_decl_tenant_idx  ON fin_tax_declarations (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_tax_decl_period_idx  ON fin_tax_declarations (period_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_tax_decl_type_idx    ON fin_tax_declarations (tenant_id, declaration_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_tax_decl_status_idx  ON fin_tax_declarations (tenant_id, status);
