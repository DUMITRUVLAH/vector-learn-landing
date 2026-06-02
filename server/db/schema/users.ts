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
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    role: userRoleEnum("role").notNull().default("manager"),
    /**
     * BRANCH-703: branch_scope restricts a user to a single branch.
     * null = global access (owner/admin sees all branches).
     * UUID = restricted to that branch only (branch manager).
     * FK to branches.id is enforced at the DB level via migration; we skip the TS
     * circular import (branches → users → branches) by not importing branches here.
     */
    branchScope: uuid("branch_scope"),
* SET-801: is_active = false blocks login. Soft-delete for departed staff.
     * Default true; only admins can set false; owners cannot be deactivated.
     */
    isActive: boolean("is_active").notNull().default(true),    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** BRANCH-702: If set, this user is a branch manager scoped to this branch only */
    // AUTH-003: extended profile fields
    phone: varchar("phone", { length: 50 }),
    avatarUrl: varchar("avatar_url", { length: 2048 }),
    language: varchar("language", { length: 10 }).default("ro"),
    timezone: varchar("timezone", { length: 64 }).default("Europe/Bucharest"),
    // AUTH-003: GDPR soft-delete (deleted_at = null means active)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
     * BRANCH-703: Scoped branch access.
     * NULL = access to ALL branches (owner/admin).
     * UUID = access limited to this branch only (branch manager).
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("users_tenant_idx").on(t.tenantId),
    emailUniq: uniqueIndex("users_tenant_email_uniq").on(t.tenantId, t.email),
    branchScopeIdx: index("users_branch_scope_idx").on(t.branchScope),
isActiveIdx: index("users_is_active_idx").on(t.tenantId, t.isActive),  })
    branchScopeIdx: index("users_branch_scope_idx").on(t.tenantId, t.branchScope),
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
    // AUTH-004: device + activity tracking for session management UI
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    // AUTH-004: when 2FA is required but not yet verified, session is incomplete
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
