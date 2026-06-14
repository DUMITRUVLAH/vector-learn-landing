/**
 * INSIGHT-001 (FIN): Schema FinDesk Insights — fin_saved_views + fin_narratives
 *
 * fin_saved_views: vederi salvate per tenant/user pentru dashboard financiar.
 * fin_narratives: narativele textuale lunare (generate manual sau AI).
 *
 * FIN-CORE §1.13 — calculele sunt DETERMINISTE; narativele pot fi AI sau manuale.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const finMetricEnum = pgEnum("fin_metric", [
  "revenue",
  "expenses",
  "profit",
  "vat",
  "cashflow",
]);

export const finPeriodEnum = pgEnum("fin_period", [
  "this_month",
  "last_month",
  "last_3m",
  "last_6m",
  "ytd",
  "custom",
]);

export const finGroupByEnum = pgEnum("fin_group_by", [
  "day",
  "week",
  "month",
  "category",
]);

export const finNarrativeGeneratedByEnum = pgEnum("fin_narrative_generated_by", [
  "manual",
  "ai",
]);

export const finNarrativeSentimentEnum = pgEnum("fin_narrative_sentiment", [
  "positive",
  "neutral",
  "negative",
]);

// ─── fin_saved_views ──────────────────────────────────────────────────────────

/**
 * Vederi salvate per tenant/user pentru FinDesk dashboard.
 * Permite salvarea combinațiilor de metrică + interval + grupare + filtre.
 */
export const finSavedViews = pgTable(
  "fin_saved_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Numele vizualizat al vederii salvate (ex: „Cheltuieli IT Q4"). */
    name: varchar("name", { length: 200 }).notNull(),

    /** Metrica principală afișată. */
    metric: finMetricEnum("metric").notNull(),

    /** Intervalul de timp implicit. */
    period: finPeriodEnum("period").notNull().default("this_month"),

    /** Granularitatea grupării (agregare pe zi/săptămână/lună/categorie). */
    groupBy: finGroupByEnum("group_by").notNull().default("month"),

    /**
     * Filtre suplimentare JSONB:
     * { accountType?: string, category?: string }
     */
    filters: jsonb("filters")
      .$type<FinSavedViewFilters>()
      .notNull()
      .default({}),

    /** True = vederea default pentru utilizator+metrică (max 1 per user per metric). */
    isDefault: boolean("is_default").notNull().default(false),

    /** True = vizibilă tuturor utilizatorilor din tenant. */
    isPublic: boolean("is_public").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fsv_tenant_idx").on(t.tenantId),
    userIdx: index("fsv_user_idx").on(t.userId),
  })
);

// ─── fin_narratives ───────────────────────────────────────────────────────────

/**
 * Narativele textuale lunare ale directorului / AI.
 * Principiu FIN-CORE: calculele = DETERMINISTE; narativele = AI sau manuale.
 * O singură narativă publicată per lună per tenant (UPSERT semantics).
 */
export const finNarratives = pgTable(
  "fin_narratives",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Autorul narativei; null = sistem/AI fără user asociat. */
    authorId: uuid("author_id")
      .references(() => users.id, { onDelete: "set null" }),

    /** Luna narativei (YYYY-MM). */
    month: varchar("month", { length: 7 }).notNull(),

    /** Titlul narativei (ex: „Performanță Ianuarie 2026"). */
    title: varchar("title", { length: 300 }).notNull(),

    /** Corpul narativei (markdown). */
    body: text("body").notNull(),

    /** Sursa: manual = director; ai = generat AI. */
    generatedBy: finNarrativeGeneratedByEnum("generated_by").notNull().default("manual"),

    /** Tonalitatea narativei (pentru filtrare + UI). */
    sentiment: finNarrativeSentimentEnum("sentiment").notNull().default("neutral"),

    /** null = ciornă; non-null = publicată. */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fn_tenant_idx").on(t.tenantId),
    /** O singură narativă publicată per lună per tenant (UPSERT). */
    tenantMonthIdx: uniqueIndex("fn_tenant_month_uidx").on(t.tenantId, t.month),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finSavedViewsRelations = relations(finSavedViews, ({ one }) => ({
  tenant: one(tenants, {
    fields: [finSavedViews.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [finSavedViews.userId],
    references: [users.id],
  }),
}));

export const finNarrativesRelations = relations(finNarratives, ({ one }) => ({
  tenant: one(tenants, {
    fields: [finNarratives.tenantId],
    references: [tenants.id],
  }),
  author: one(users, {
    fields: [finNarratives.authorId],
    references: [users.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinSavedViewFilters {
  accountType?: string;
  category?: string;
}

export type FinMetric = (typeof finMetricEnum.enumValues)[number];
export type FinPeriod = (typeof finPeriodEnum.enumValues)[number];
export type FinGroupBy = (typeof finGroupByEnum.enumValues)[number];

export type FinSavedView = typeof finSavedViews.$inferSelect;
export type InsertFinSavedView = typeof finSavedViews.$inferInsert;

export type FinNarrative = typeof finNarratives.$inferSelect;
export type InsertFinNarrative = typeof finNarratives.$inferInsert;

/** Labels pentru UI */
export const FIN_METRIC_LABELS: Record<FinMetric, string> = {
  revenue: "Venituri",
  expenses: "Cheltuieli",
  profit: "Profit",
  vat: "TVA",
  cashflow: "Cashflow",
};

export const FIN_PERIOD_LABELS: Record<FinPeriod, string> = {
  this_month: "Luna curentă",
  last_month: "Luna trecută",
  last_3m: "Ultimele 3 luni",
  last_6m: "Ultimele 6 luni",
  ytd: "De la început de an",
  custom: "Personalizat",
};
