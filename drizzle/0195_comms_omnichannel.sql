-- COMMS-301: modulul de comunicare omnicanal (WhatsApp, Telegram, Viber, Gmail). Vezi docs/comms/.
-- Același conținut ca server/db/ensure/comms.ts (heal-ul de pe prod).
ALTER TYPE "public"."interaction_type" ADD VALUE IF NOT EXISTS 'telegram';
--> statement-breakpoint
ALTER TYPE "public"."interaction_type" ADD VALUE IF NOT EXISTS 'viber';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_channels" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "kind" varchar(20) NOT NULL,
    "name" varchar(120) NOT NULL,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "external_id" varchar(255),
    "credentials_enc" text,
    "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "webhook_secret" varchar(64) NOT NULL,
    "connected_by" uuid REFERENCES "users"("id") ON DELETE set null,
    "last_error" varchar(1000),
    "last_event_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_channels_tenant_idx" ON "comm_channels" ("tenant_id","kind");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_channels_kind_external_uniq" ON "comm_channels" ("kind","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_channels_webhook_secret_uniq" ON "comm_channels" ("webhook_secret");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_contacts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "channel_id" uuid NOT NULL REFERENCES "comm_channels"("id") ON DELETE cascade,
    "external_user_id" varchar(255) NOT NULL,
    "display_name" varchar(200),
    "phone" varchar(32),
    "email" varchar(255),
    "username" varchar(120),
    "avatar_url" varchar(1000),
    "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
    "blocked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_contacts_channel_user_uniq" ON "comm_contacts" ("channel_id","external_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_contacts_lead_idx" ON "comm_contacts" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_contacts_tenant_idx" ON "comm_contacts" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_conversations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "channel_id" uuid NOT NULL REFERENCES "comm_channels"("id") ON DELETE cascade,
    "contact_id" uuid NOT NULL REFERENCES "comm_contacts"("id") ON DELETE cascade,
    "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
    "external_thread_id" varchar(255) DEFAULT '' NOT NULL,
    "subject" varchar(500),
    "status" varchar(20) DEFAULT 'open' NOT NULL,
    "assigned_to" uuid REFERENCES "users"("id") ON DELETE set null,
    "unread_count" integer DEFAULT 0 NOT NULL,
    "last_message_at" timestamp with time zone,
    "last_message_preview" varchar(300),
    "last_message_direction" varchar(10),
    "last_inbound_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_conversations_thread_uniq" ON "comm_conversations" ("channel_id","contact_id","external_thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_conversations_tenant_last_idx" ON "comm_conversations" ("tenant_id","last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_conversations_lead_idx" ON "comm_conversations" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_conversations_assigned_idx" ON "comm_conversations" ("tenant_id","assigned_to");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "conversation_id" uuid NOT NULL REFERENCES "comm_conversations"("id") ON DELETE cascade,
    "channel_id" uuid NOT NULL REFERENCES "comm_channels"("id") ON DELETE cascade,
    "direction" varchar(10) NOT NULL,
    "kind" varchar(20) DEFAULT 'text' NOT NULL,
    "body" text,
    "subject" varchar(500),
    "media" jsonb,
    "external_id" varchar(255),
    "status" varchar(20) DEFAULT 'queued' NOT NULL,
    "error_code" varchar(40),
    "error_message" varchar(1000),
    "sender_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "template_name" varchar(200),
    "meta" jsonb,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_messages_conv_idx" ON "comm_messages" ("conversation_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comm_messages_channel_external_uniq" ON "comm_messages" ("channel_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_messages_tenant_idx" ON "comm_messages" ("tenant_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comm_webhook_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "channel_id" uuid REFERENCES "comm_channels"("id") ON DELETE cascade,
    "kind" varchar(20) NOT NULL,
    "signature_ok" boolean DEFAULT false NOT NULL,
    "payload" jsonb,
    "error" varchar(1000),
    "processed_at" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comm_webhook_events_channel_idx" ON "comm_webhook_events" ("channel_id","received_at");
