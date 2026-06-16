/**
 * VF-004: invite token helpers + optional email delivery.
 * The plaintext token lives only in the invite URL; the DB stores sha256(token).
 */
import { randomBytes, createHash } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Generate a URL-safe random invite token (plaintext, shown once in the link). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 of a token — what we store and look up by. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/#/app/invite?token=${token}`;
}

/**
 * Send the invite email via Resend if RESEND_API_KEY is configured. No-op (returns false)
 * otherwise — email is just transport; the copyable link always works. Never throws: a failed
 * send must not break invite creation.
 */
export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  url: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.RESEND_FROM ?? "Vector Finance <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: `Invitație în ${params.orgName} — Vector Finance`,
        html: `<p>Ai fost invitat să te alături organizației <strong>${params.orgName}</strong> în Vector Finance.</p>
<p><a href="${params.url}">Acceptă invitația</a></p>
<p>Sau copiază linkul: ${params.url}</p>
<p>Linkul expiră în 7 zile.</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
