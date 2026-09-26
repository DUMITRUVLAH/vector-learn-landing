-- CRM-U04 (renumerotată 0191→0193: chaturi paralele au luat 0191 și 0192): taskul poate avea și oră. false = „toată ziua" (cum erau toate taskurile până acum).
ALTER TABLE "crm_lead_tasks" ADD COLUMN IF NOT EXISTS "due_has_time" boolean DEFAULT false NOT NULL;
