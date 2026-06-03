import { pgTable, uuid, varchar, timestamp, pgEnum, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "teacher",
  "receptionist",
  "student",
  "parent",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    // Nullable: users who sign in only via Google (auth_provider = "google")
    // have no local password. Password login guards against a null hash.
    passwordHash: varchar("password_hash", { length: 255 }),
    name: varchar("name", { length: 200 }).notNull(),
    role: userRoleEnum("role").notNull().default("manager"),
    // OAuth: Google's stable subject id ("sub"). Null for password-only accounts.
    googleId: varchar("google_id", { length: 64 }),
    // How the account authenticates: "password" (default) or "google".
    authProvider: varchar("auth_provider", { length: 20 }).notNull().default("password"),
    branchScope: uuid("branch_scope"),
    isActive: boolean("is_active").notNull().default(true),
    phone: varchar("phone", { length: 50 }),
    avatarUrl: varchar("avatar_url", { length: 2048 }),
    language: varchar("language", { length: 10 }).default("ro"),
    timezone: varchar("timezone", { length: 64 }).default("Europe/Bucharest"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("users_tenant_idx").on(t.tenantId),
    emailUniq: uniqueIndex("users_tenant_email_uniq").on(t.tenantId, t.email),
    googleIdUniq: uniqueIndex("users_google_id_uniq").on(t.googleId),
    branchScopeIdx: index("users_branch_scope_idx").on(t.tenantId, t.branchScope),
    isActiveIdx: index("users_is_active_idx").on(t.tenantId, t.isActive),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    twoFactorPending: boolean("two_factor_pending").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    tokenIdx: index("sessions_token_idx").on(t.token),
  })
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
