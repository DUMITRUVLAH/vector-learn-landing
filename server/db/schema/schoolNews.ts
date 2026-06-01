/**
 * SCHOOL-007 — Schema știri/alerte școală (school_news_posts)
 *
 * Entități:
 *   school_news_posts — știri/alerte postate de administratori, vizibile părinților
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── school_news_posts ────────────────────────────────────────────────────────

export const schoolNewsPosts = pgTable(
  "school_news_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /**
     * null = draft (nepublicat); not null = data publicării
     * Doar postările cu publishedAt ≤ now() sunt vizibile părinților.
     */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantPublishedIdx: index("school_news_posts_tenant_published_idx").on(
      t.tenantId,
      t.publishedAt
    ),
  })
);

export type SchoolNewsPost = typeof schoolNewsPosts.$inferSelect;
export type NewSchoolNewsPost = typeof schoolNewsPosts.$inferInsert;
