import { pgTable, uuid, varchar, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { userRoleEnum } from "./users";

/**
 * AUTH-002: User invitations.
 * Admin invites a team member; they receive an email with a token link.
 * Token valid for 7 days. On accept: create/activate user + delete token.
 */
export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("teacher"),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    invitedByUserId: uuid("invited_by_user_id"),
  },
  (t) => ({
    tenantIdx: index("ui_tenant_idx").on(t.tenantId),
    emailIdx: index("ui_email_idx").on(t.tenantId, t.email),
  })
);

export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;
