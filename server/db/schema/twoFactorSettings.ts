import { pgTable, uuid, timestamp, text, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * AUTH-004: Two-factor authentication settings per user.
 * Secret is stored AES-256-GCM encrypted (encrypt/decrypt helpers in server/auth/twoFactor.ts).
 * Recovery codes are stored as a JSON array of {code: string, usedAt: string|null} objects.
 */
export const twoFactorSettings = pgTable(
  "two_factor_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    secretEncrypted: text("secret_encrypted").notNull(), // AES-256-GCM encrypted base32 TOTP secret
    recoveryCodesJson: text("recovery_codes_json").notNull().default("[]"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("two_factor_settings_user_idx").on(t.userId),
  })
);

export type TwoFactorSettings = typeof twoFactorSettings.$inferSelect;
export type NewTwoFactorSettings = typeof twoFactorSettings.$inferInsert;
