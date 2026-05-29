/**
 * COMM-201 — MessagingService
 *
 * Orchestrates sending a message through the correct provider stub, inserts a
 * row in `messages`, and updates delivery status. Enforces GDPR consent check
 * for leads.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { messages, leads } from "../../db/schema";
import type { Message } from "../../db/schema/messages";
import {
  EmailProvider,
  SmsProvider,
  WhatsAppProvider,
} from "./providers";

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown when `consent_revoked_at` is set on the target lead. */
export class ConsentRevokedError extends Error {
  constructor() {
    super("Trimiterea a fost blocată: consimțământul a fost retras.");
    this.name = "ConsentRevokedError";
  }
}

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SendMessagePayload {
  channel: "email" | "sms" | "whatsapp";
  toAddress: string;
  body: string;
  /** Required for email channel */
  subject?: string;
  templateId?: string;
  leadId?: string;
  studentId?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MessagingService {
  private emailProvider = new EmailProvider();
  private smsProvider = new SmsProvider();
  private whatsAppProvider = new WhatsAppProvider();

  constructor(private readonly db: DB) {}

  /**
   * Send a message via the appropriate provider stub.
   *
   * Steps:
   *  1. If `leadId` provided, check `consent_revoked_at` → throw ConsentRevokedError.
   *  2. Insert `messages` row with status=queued.
   *  3. Call the provider stub.
   *  4. Update row with sent_at + status=sent (or failed + error_message).
   *  5. Return the final row.
   */
  async sendMessage(
    tenantId: string,
    payload: SendMessagePayload
  ): Promise<Message> {
    // ── 1. GDPR consent check ──
    if (payload.leadId) {
      const lead = await this.db.query.leads.findFirst({
        where: and(
          eq(leads.id, payload.leadId),
          eq(leads.tenantId, tenantId)
        ),
        columns: { consentRevokedAt: true },
      });
      if (lead?.consentRevokedAt) {
        throw new ConsentRevokedError();
      }
    }

    // ── 2. Insert queued row ──
    const [queued] = await this.db
      .insert(messages)
      .values({
        tenantId,
        leadId: payload.leadId ?? null,
        studentId: payload.studentId ?? null,
        direction: "outbound",
        channel: payload.channel,
        toAddress: payload.toAddress,
        body: payload.body,
        subject: payload.subject ?? null,
        templateId: payload.templateId ?? null,
        status: "queued",
      })
      .returning();

    // ── 3. Dispatch to provider ──
    let providerMessageId: string | undefined;
    let errorMessage: string | undefined;
    let success = false;

    try {
      let result;
      if (payload.channel === "email") {
        result = await this.emailProvider.send({
          to: payload.toAddress,
          subject: payload.subject ?? "(bez subiect)",
          body: payload.body,
        });
      } else if (payload.channel === "sms") {
        result = await this.smsProvider.send({
          to: payload.toAddress,
          body: payload.body,
        });
      } else {
        result = await this.whatsAppProvider.send({
          to: payload.toAddress,
          body: payload.body,
        });
      }
      providerMessageId = result.messageId;
      success = result.status === "sent";
      if (!success) errorMessage = result.errorMessage ?? "Provider a returnat failed";
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : "Eroare necunoscută provider";
    }

    // ── 4. Update row ──
    const now = new Date();
    const [updated] = await this.db
      .update(messages)
      .set(
        success
          ? {
              status: "sent",
              providerMessageId: providerMessageId ?? null,
              sentAt: now,
            }
          : {
              status: "failed",
              errorMessage: errorMessage ?? null,
              failedAt: now,
            }
      )
      .where(eq(messages.id, queued.id))
      .returning();

    return updated;
  }
}
