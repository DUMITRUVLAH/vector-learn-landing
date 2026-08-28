ALTER TABLE "par_requests" ADD COLUMN "is_urgent" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "urgent_reason" varchar(60);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "urgent_reason_note" text;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "urgent_due_date" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "par_requests_urgent_idx" ON "par_requests" ("is_urgent");
