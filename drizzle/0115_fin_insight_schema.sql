-- INSIGHT-001 (FIN): Schema FinDesk Insights
-- fin_saved_views: vederi salvate per tenant/user
-- fin_narratives: narativele textuale lunare (manual sau AI)
-- FIN-CORE §1.13

-- Enums
CREATE TYPE "fin_metric" AS ENUM ('revenue', 'expenses', 'profit', 'vat', 'cashflow');
--> statement-breakpoint
CREATE TYPE "fin_period" AS ENUM ('this_month', 'last_month', 'last_3m', 'last_6m', 'ytd', 'custom');
--> statement-breakpoint
CREATE TYPE "fin_group_by" AS ENUM ('day', 'week', 'month', 'category');
--> statement-breakpoint
CREATE TYPE "fin_narrative_generated_by" AS ENUM ('manual', 'ai');
--> statement-breakpoint
CREATE TYPE "fin_narrative_sentiment" AS ENUM ('positive', 'neutral', 'negative');
--> statement-breakpoint

-- fin_saved_views
CREATE TABLE "fin_saved_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" varchar(200) NOT NULL,
    "metric" "fin_metric" NOT NULL,
    "period" "fin_period" NOT NULL DEFAULT 'this_month',
    "group_by" "fin_group_by" NOT NULL DEFAULT 'month',
    "filters" jsonb NOT NULL DEFAULT '{}',
    "is_default" boolean NOT NULL DEFAULT false,
    "is_public" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "fsv_tenant_idx" ON "fin_saved_views" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fsv_user_idx" ON "fin_saved_views" ("user_id");
--> statement-breakpoint

-- fin_narratives
CREATE TABLE "fin_narratives" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "month" varchar(7) NOT NULL,
    "title" varchar(300) NOT NULL,
    "body" text NOT NULL,
    "generated_by" "fin_narrative_generated_by" NOT NULL DEFAULT 'manual',
    "sentiment" "fin_narrative_sentiment" NOT NULL DEFAULT 'neutral',
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "fn_tenant_idx" ON "fin_narratives" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "fn_tenant_month_uidx" ON "fin_narratives" ("tenant_id", "month");
