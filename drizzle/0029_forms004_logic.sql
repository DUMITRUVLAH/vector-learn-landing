CREATE TABLE IF NOT EXISTS form_logic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  from_field_id UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  condition JSONB NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('jump_to_field', 'jump_to_end')),
  target_field_id UUID REFERENCES form_fields(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_logic_form_idx ON form_logic(form_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_logic_tenant_idx ON form_logic(tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_logic_from_field_idx ON form_logic(from_field_id);
