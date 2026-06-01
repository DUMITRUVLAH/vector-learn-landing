-- SCHOOL-007: Parent portal — school_news_posts table
-- Migration prefix: 0035 (follows 0034_guardian001_student_guardians)
-- No CREATE TYPE needed

CREATE TABLE IF NOT EXISTS "school_news_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "published_at" timestamp with time zone,
  "author_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "school_news_posts_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "school_news_posts_author_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_news_posts_tenant_published_idx" ON "school_news_posts" ("tenant_id", "published_at");
