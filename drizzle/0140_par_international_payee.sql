-- PAR: plăți internaționale — codul fiscal al beneficiarului nu mai e limitat la formatul MD.
-- „Exact 13 cifre" e regula moldovenească (IDNO/IDNP). Un beneficiar estonian are un cod de 11
-- cifre, unul german un VAT de tip DE123456789 — nu încap în varchar(13) și inserarea pica cu
-- „value too long for type character varying(13)". Lărgim la 50; validarea per-țară se face în
-- cod (src/lib/par/iban.ts → validateFiscalId).
ALTER TABLE "par_vendors" ALTER COLUMN "idnp" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "par_requests" ALTER COLUMN "payee_idnp" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "par_purchase_orders" ALTER COLUMN "vendor_idnp" TYPE varchar(50);
