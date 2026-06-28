-- STMT-003: Add linked_fin_invoice_id to fin_capture_lines
-- Links a statement transaction line to the fin_invoice created when submitting to e-Factura SFS.
ALTER TABLE fin_capture_lines
  ADD COLUMN IF NOT EXISTS linked_fin_invoice_id uuid
  REFERENCES fin_invoices(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fin_cap_lines_linked_inv_idx
  ON fin_capture_lines(linked_fin_invoice_id);
