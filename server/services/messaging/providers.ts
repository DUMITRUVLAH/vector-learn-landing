/**
 * COMM-201 — Provider stubs for email, SMS, WhatsApp.
 *
 * These are intentional stubs that log to console. Replace with real
 * SendGrid / Twilio / Meta Cloud API implementations without changing
 * the interface or call sites.
 */

export interface ProviderSendResult {
  messageId: string;
  /** "sent" on stub success; "failed" on provider error */
  status: "sent" | "failed";
  errorMessage?: string;
}

// ─── Email provider ───────────────────────────────────────────────────────────

export interface EmailSendOptions {
  to: string;
  subject: string;
  body: string;
}

export class EmailProvider {
  /** Stub: logs and returns success. Replace body for real SendGrid/Resend. */
  async send(opts: EmailSendOptions): Promise<ProviderSendResult> {
    console.warn(
      `[EMAIL STUB] to="${opts.to}" subject="${opts.subject}" body="${opts.body.slice(0, 60)}…"`
    );
    return { messageId: crypto.randomUUID(), status: "sent" };
  }
}

// ─── SMS provider ─────────────────────────────────────────────────────────────

export interface SmsSendOptions {
  to: string;
  body: string;
}

export class SmsProvider {
  /** Stub: logs and returns success. Replace body for real Twilio/vonage. */
  async send(opts: SmsSendOptions): Promise<ProviderSendResult> {
    console.warn(`[SMS STUB] to="${opts.to}" body="${opts.body.slice(0, 60)}…"`);
    return { messageId: crypto.randomUUID(), status: "sent" };
  }
}

// ─── WhatsApp provider ────────────────────────────────────────────────────────

export interface WhatsAppSendOptions {
  to: string;
  body: string;
}

export class WhatsAppProvider {
  /** Stub: logs and returns success. Replace body for real Meta Cloud API. */
  async send(opts: WhatsAppSendOptions): Promise<ProviderSendResult> {
    console.warn(
      `[WHATSAPP STUB] to="${opts.to}" body="${opts.body.slice(0, 60)}…"`
    );
    return { messageId: crypto.randomUUID(), status: "sent" };
  }
}
