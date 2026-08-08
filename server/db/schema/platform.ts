/**
 * PLATFORM-001 — Consola Platformă (superadmin).
 *
 * Tabelele care fac posibilă administrarea produsului de către proprietarul platformei:
 *   • `platform_module_defaults` — ce module primește un workspace NOU la înregistrare
 *   • `tenant_modules`           — comutatorul per workspace (sursa de adevăr pentru vizibilitate)
 *   • `login_events`             — istoricul de logări (succes ȘI eșec); `sessions` se șterge la
 *                                  logout/expirare, deci nu poate servi ca istoric
 *   • `platform_audit_log`       — ce a schimbat superadminul (un panou cu asemenea putere fără
 *                                  urmă de audit nu e de încredere)
 *   • `tenant_notes`             — note interne comerciale per workspace
 *
 * REGULĂ DE SIGURANȚĂ (fail-open): absența unui rând în `tenant_modules` înseamnă
 * „modul vizibil". Doar un rând explicit cu `enabled = false` ascunde ceva. Așa, dacă
 * migrarea nu ajunge pe prod (vezi docs/solutions/database-issues — migrările drizzle nu
 * se aplică fiabil pe prod), niciun client nu pierde acces la ce vedea ieri.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/** Ce module primește un workspace nou la signup. Un rând per cheie de modul. */
export const platformModuleDefaults = pgTable(
  "platform_module_defaults",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleKey: varchar("module_key", { length: 50 }).notNull(),
    /** true → modulul e activat automat pentru orice workspace nou. */
    enabled: boolean("enabled").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ moduleUniq: uniqueIndex("platform_module_defaults_key_uniq").on(t.moduleKey) })
);

export type PlatformModuleDefault = typeof platformModuleDefaults.$inferSelect;

/** Comutatorul de modul per workspace. Lipsa rândului = activ (fail-open). */
export const tenantModules = pgTable(
  "tenant_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 50 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_modules_tenant_idx").on(t.tenantId),
    tenantModuleUniq: uniqueIndex("tenant_modules_tenant_key_uniq").on(t.tenantId, t.moduleKey),
  })
);

export type TenantModule = typeof tenantModules.$inferSelect;

/**
 * Istoricul de logări. `userId`/`tenantId` sunt NULL pentru încercările eșuate pe un email
 * inexistent — exact cazul pe care vrem să-l vedem (brute-force), deci nu poate fi NOT NULL.
 */
export const loginEvents = pgTable(
  "login_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    /** Emailul introdus, normalizat lowercase — păstrat chiar dacă userul nu există. */
    email: varchar("email", { length: 255 }).notNull(),
    /** "business" | "learn" | "parent" — care aplicație a fost țintită. */
    app: varchar("app", { length: 20 }).notNull().default("business"),
    /** "password" | "google" | "invite" | "signup" | "reset" */
    method: varchar("method", { length: 20 }).notNull().default("password"),
    success: boolean("success").notNull(),
    /** Codul de eșec returnat clientului: invalid_credentials, wrong_app, workspace_suspended… */
    failureReason: varchar("failure_reason", { length: 60 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("login_events_created_idx").on(t.createdAt),
    tenantIdx: index("login_events_tenant_idx").on(t.tenantId, t.createdAt),
    userIdx: index("login_events_user_idx").on(t.userId, t.createdAt),
    emailIdx: index("login_events_email_idx").on(t.email),
  })
);

export type LoginEvent = typeof loginEvents.$inferSelect;

/** Urma acțiunilor de superadmin (module comutate, workspace suspendat, admin adăugat…). */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 255 }),
    /** ex. "module.toggle", "workspace.suspend", "defaults.update", "admin.add" */
    action: varchar("action", { length: 60 }).notNull(),
    targetType: varchar("target_type", { length: 40 }),
    targetId: varchar("target_id", { length: 100 }),
    /** Label lizibil pentru listă (numele workspace-ului), ca să nu facem join-uri la afișare. */
    targetLabel: varchar("target_label", { length: 300 }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("platform_audit_log_created_idx").on(t.createdAt),
    targetIdx: index("platform_audit_log_target_idx").on(t.targetType, t.targetId),
  })
);

export type PlatformAuditEntry = typeof platformAuditLog.$inferSelect;

/** Note interne despre un workspace — vizibile DOAR superadminului, niciodată clientului. */
export const tenantNotes = pgTable(
  "tenant_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorEmail: varchar("author_email", { length: 255 }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ tenantIdx: index("tenant_notes_tenant_idx").on(t.tenantId, t.createdAt) })
);

export type TenantNote = typeof tenantNotes.$inferSelect;
