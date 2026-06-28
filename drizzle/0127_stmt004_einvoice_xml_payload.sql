-- STMT-004: Add xml_payload to fin_einvoices for ZIP download of submitted XML e-facturi.
ALTER TABLE fin_einvoices
  ADD COLUMN IF NOT EXISTS xml_payload text;
