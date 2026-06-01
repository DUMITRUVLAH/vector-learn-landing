-- GAP-014: Stripe Checkout fields on invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_session_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paid_online" boolean DEFAULT false;
