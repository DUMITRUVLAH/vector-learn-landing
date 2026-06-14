-- TRUST-003: Adaugă câmpul retention_days_students în fin_data_settings
-- GDPR Art. 5(1)(e) — limitarea stocării datelor personale ale elevilor
-- Default: 1825 zile (5 ani) — perioadă rezonabilă pentru un centru educațional

ALTER TABLE "fin_data_settings" ADD COLUMN "retention_days_students" integer NOT NULL DEFAULT 1825;
