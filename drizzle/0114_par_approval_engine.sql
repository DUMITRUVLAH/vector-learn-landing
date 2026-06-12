-- PAR-107: add body_hash to par_requests + locked to par_approvals
-- Enables immutable-body integrity and sequential-step enforcement (PAR-107/109)

ALTER TABLE "par_requests" ADD COLUMN "body_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "par_approvals" ADD COLUMN "locked" boolean NOT NULL DEFAULT false;
