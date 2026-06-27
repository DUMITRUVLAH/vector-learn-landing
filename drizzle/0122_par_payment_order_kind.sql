-- VM1-12: Add 'payment_order' attachment kind to par_attachment_kind enum
-- Finance can upload the signed payment order after PAR is paid, so it is
-- included in the combined dosar PDF.
ALTER TYPE "public"."par_attachment_kind" ADD VALUE 'payment_order';
