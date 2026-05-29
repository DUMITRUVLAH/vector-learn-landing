/**
 * CRM-108: Message templates (email/WhatsApp/SMS)
 */
import { pgTable, uuid, varchar, timestamp, pgEnum, index, text } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const templateChannelEnum = pgEnum("template_channel", ["email", "whatsapp", "sms"]);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    channel: templateChannelEnum("channel").notNull(),
    subject: varchar("subject", { length: 500 }),  // email only
    body: text("body").notNull(),
    // Variables detected from body: e.g. ["first_name", "course", "trial_date", "center_name"]
    variables: varchar("variables", { length: 1000 }).notNull().default("[]"), // JSON array stored as string
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("mt_tenant_idx").on(t.tenantId),
    channelIdx: index("mt_channel_idx").on(t.tenantId, t.channel),
  })
);

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

/** Known variables with sample data for preview */
export const KNOWN_VARIABLES: Record<string, string> = {
  first_name: "Maria",
  course: "Engleză B2",
  trial_date: "sâmbătă, 1 iunie, ora 10:00",
  center_name: "Vector Learn",
  full_name: "Maria Popescu",
  phone: "+40 771 234 567",
};

/** Extract variable names from template body */
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  const unique = [...new Set(matches.map((m) => m.slice(2, -2)))];
  return unique;
}

/** Render template with sample data or provided context */
export function renderTemplate(body: string, context: Record<string, string> = KNOWN_VARIABLES): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => context[key] ?? `{{${key}}}`);
}
