/**
 * COMM-201 — Messaging providers.
 *
 * EmailProvider: real Resend implementation. Requires RESEND_API_KEY env var.
 * Falls back to console-warn stub when key is absent (local dev without key).
 *
 * SmsProvider / WhatsAppProvider: stubs — replace with Twilio / Meta Cloud API.
 */
import { Resend } from "resend";

export interface ProviderSendResult {
  messageId: string;
  /** "sent" on success; "failed" on provider error */
  status: "sent" | "failed";
  errorMessage?: string;
}

// ─── Email provider ───────────────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  /** File bytes (Resend accepts a Buffer or a base64 string). */
  content: Buffer;
}

export interface EmailSendOptions {
  to: string;
  subject: string;
  /** Plain-text body — rendered as <pre>-style inside a simple HTML wrapper. */
  body: string;
  /** Optional file attachments (e.g. the invoice PDF). Ignored by the console stub. */
  attachments?: EmailAttachment[];
}

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "noreply@notifications.vectorlearn.md";

/**
 * Absolute base URL for assets referenced from an email (the logo).
 * Email clients cannot resolve relative paths, and a localhost `APP_URL` (dev)
 * would render as a broken image in the recipient's inbox — so only an https
 * origin is trusted; otherwise fall back to the public production domain.
 */
function publicAssetOrigin(): string {
  const appUrl = process.env.APP_URL;
  return appUrl?.startsWith("https://") ? appUrl.replace(/\/+$/, "") : "https://finflow.best";
}

export class EmailProvider {
  private client: Resend | null;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      this.client = new Resend(key);
    } else {
      this.client = null;
      console.warn("[EmailProvider] RESEND_API_KEY not set — email will be logged only");
    }
  }

  async send(opts: EmailSendOptions): Promise<ProviderSendResult> {
    if (!this.client) {
      const att = opts.attachments?.length ? ` +${opts.attachments.length} attachment(s)` : "";
      console.warn(
        `[EMAIL STUB] to="${opts.to}" subject="${opts.subject}"${att} body="${opts.body.slice(0, 80)}…"`
      );
      return { messageId: crypto.randomUUID(), status: "sent" };
    }

    const html = buildHtml(opts.subject, opts.body);

    try {
      const { data, error } = await this.client.emails.send({
        from: FROM_ADDRESS,
        to: opts.to,
        subject: opts.subject,
        html,
        text: opts.body,
        ...(opts.attachments?.length
          ? { attachments: opts.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
          : {}),
      });

      if (error || !data) {
        const msg = error?.message ?? "unknown Resend error";
        console.error(`[EmailProvider] send failed to="${opts.to}": ${msg}`);
        return { messageId: crypto.randomUUID(), status: "failed", errorMessage: msg };
      }

      return { messageId: data.id ?? crypto.randomUUID(), status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[EmailProvider] unexpected error to="${opts.to}": ${msg}`);
      return { messageId: crypto.randomUUID(), status: "failed", errorMessage: msg };
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Minimal HTML email wrapper — plain-text body inside a clean card, under the
 * FinFlow lockup used in the app shell (square mark + wordmark).
 *
 * The mark is a hosted PNG (email clients don't render SVG, and Gmail strips
 * `onerror`), and the "FinFlow" wordmark next to it is real HTML text with an
 * empty `alt` on the image — so a blocked or missing image degrades to the
 * wordmark alone instead of a broken-image icon.
 */
export function buildHtml(subject: string, body: string): string {
  const escaped = escapeHtml(body).replace(/\n/g, "<br>");
  const logoUrl = `${publicAssetOrigin()}/finflow-mark.png`;

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding-right:10px;vertical-align:middle;line-height:0">
          <img src="${logoUrl}" alt="" width="36" height="36" style="display:block;border:0;width:36px;height:36px;border-radius:8px">
        </td>
        <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;letter-spacing:-.3px;color:#1a1aff">FinFlow</td>
      </tr>
    </table>
    <p style="font-size:15px;line-height:1.6;color:#333">${escaped}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999">FinFlow · Notificare automată · Nu răspunde la acest email</p>
  </div>
</body>
</html>`;
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
