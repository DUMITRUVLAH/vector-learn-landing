/**
 * CRM-134: Lead mentions — tracks @mentions in lead note interactions.
 * When a note with "@Prenume Nume" is saved, a row is created here
 * and a notification_queue entry (channel='in_app') is queued for the mentioned user.
 */
import {
  pgTable,
  uuid,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { leadInteractions } from "./leads";
import { users } from "./users";

export const leadMentions = pgTable(
  "lead_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    interactionId: uuid("interaction_id")
      .notNull()
      .references(() => leadInteractions.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lm_tenant_idx").on(t.tenantId),
    leadIdx: index("lm_lead_idx").on(t.leadId),
    interactionIdx: index("lm_interaction_idx").on(t.interactionId),
    userIdx: index("lm_user_idx").on(t.mentionedUserId),
  })
);

export type LeadMention = typeof leadMentions.$inferSelect;
export type NewLeadMention = typeof leadMentions.$inferInsert;
