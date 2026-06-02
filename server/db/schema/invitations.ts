/**
 * SET-801 — Team invitations
 *
 * An invitation allows an existing admin to invite a new team member by email.
 * The invitee receives a link with the token and completes signup.
 */
import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { userRoleEnum } from "./users";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The email address being invited */
    email: varchar("email", { length: 255 }).notNull(),
    /** Role to assign to the new user on acceptance */
    role: userRoleEnum("role").notNull().default("manager"),
    /** Opaque random token sent in the invite URL */
    token: varchar("token", { length: 128 }).notNull().unique(),
    /** Who sent this invite */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** TTL: 48 hours from creation */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when the invite is accepted */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("invitations_tenant_idx").on(t.tenantId),
    tokenIdx: index("invitations_token_idx").on(t.token),
    emailTenantIdx: index("invitations_email_tenant_idx").on(t.tenantId, t.email),
  })
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
