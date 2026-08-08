/**
 * PLATFORM-002 — telemetrie de erori + semnale de creștere.
 *
 * De ce există: până acum, când un client dădea peste o eroare, singurul loc unde se
 * vedea ceva era `console.error` de pe server — adică nicăieri, practic. Proprietarul
 * afla de bug-uri doar dacă îl suna clientul. Tabelele astea fac ca fiecare eroare,
 * din browser sau de pe server, să ajungă într-un loc pe care îl poate deschide.
 *
 * Două tabele, nu unul:
 *   • `error_events` — fiecare apariție, cu contextul ei (cine, unde, ce rută)
 *   • `error_groups` — o linie per tip de eroare (amprentă), cu numărătoare și stare
 *     (deschis / rezolvat / ignorat). Fără gruparea asta, 400 de apariții ale
 *     aceleiași erori arată ca 400 de probleme.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Tipul erorii — determină cât de tare doare:
 *   client_crash        — pagina a murit în browser (ecran alb / card de eroare)
 *   client_unhandled    — excepție necapturată sau promise respinsă în browser
 *   client_api_error    — clientul a primit 5xx de la API (a văzut un mesaj roșu)
 *   server_exception    — excepție aruncată în handler (app.onError)
 *   server_5xx          — răspuns 5xx returnat de o rută
 *   api_route_missing   — 404 pe /api/* → rută nemontată, clasa de bug-uri #1 din repo
 */
export const ERROR_KINDS = [
  "client_crash",
  "client_unhandled",
  "client_api_error",
  "server_exception",
  "server_5xx",
  "api_route_missing",
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const errorGroups = pgTable(
  "error_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Amprenta stabilă: kind + rută + mesaj normalizat. Vezi lib/errorTelemetry. */
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 30 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    /** Ruta sau calea unde apare — „unde mă uit ca să repar". */
    location: varchar("location", { length: 300 }),
    occurrences: integer("occurrences").notNull().default(1),
    /** Câte workspace-uri distincte au lovit-o — separă „un client ghinionist" de „toți". */
    affectedTenants: integer("affected_tenants").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** "open" | "resolved" | "ignored" */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Când a plecat ultima alertă pe email — ca să nu spamăm la fiecare apariție. */
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fingerprintUniq: uniqueIndex("error_groups_fingerprint_uniq").on(t.fingerprint),
    lastSeenIdx: index("error_groups_last_seen_idx").on(t.lastSeenAt),
    statusIdx: index("error_groups_status_idx").on(t.status, t.lastSeenAt),
  })
);

export type ErrorGroup = typeof errorGroups.$inferSelect;

export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").references(() => errorGroups.id, { onDelete: "cascade" }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 30 }).notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    /** Ruta API (`/api/par/:id`) sau ruta din SPA (`#/business/par`). */
    location: varchar("location", { length: 300 }),
    method: varchar("method", { length: 10 }),
    statusCode: integer("status_code"),
    /** URL-ul complet din browser, când eroarea vine din client. */
    url: varchar("url", { length: 1000 }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: varchar("user_email", { length: 255 }),
    userAgent: varchar("user_agent", { length: 512 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("error_events_group_idx").on(t.groupId, t.createdAt),
    createdIdx: index("error_events_created_idx").on(t.createdAt),
    tenantIdx: index("error_events_tenant_idx").on(t.tenantId, t.createdAt),
  })
);

export type ErrorEvent = typeof errorEvents.$inferSelect;
