/**
 * VF-004: invite token helpers + optional email delivery.
 * The plaintext token lives only in the invite URL; the DB stores sha256(token).
 */
import { randomBytes, createHash } from "node:crypto";
import { emailSendDecision } from "../emailGuard";
import { buildHtml } from "../../services/messaging/providers";

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
  return `${appUrl()}/#/business/invite?token=${token}`;
}

/** Etichetele rolurilor PAR, ca în aplicație (BusinessShell) — invitatul trebuie să afle CE rol primește. */
const PAR_ROLE_LABELS: Record<string, string> = {
  par_admin: "Administrator PAR",
  finance: "Finanțe",
  approver: "Aprobator",
  requestor: "Solicitant",
};

/**
 * Send the invite email via Resend if RESEND_API_KEY is configured. No-op (returns false)
 * otherwise — email is just transport; the copyable link always works. Never throws: a failed
 * send must not break invite creation.
 *
 * Corpul spune workspace-ul, ROLUL primit și cine a invitat: altfel destinatarul primește un
 * link fără context și nu are cum să distingă o invitație reală de phishing. Randarea trece
 * prin `buildHtml`, deci arată ca restul emailurilor FinFlow și butonul merge și în Outlook.
 */
export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  url: string;
  /** Rolul PAR acordat de invitație (par_admin / finance / approver / requestor). */
  parRole?: string | null;
  /** Numele celui care a trimis invitația, dacă îl știm. */
  invitedByName?: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const decision = emailSendDecision(params.to);
  if (!decision.allowed) {
    console.warn(`[par-invite] email blocked to="${params.to}": ${decision.reason}`);
    return false;
  }
  // Same verified sender as the rest of the app (EMAIL_FROM). onboarding@resend.dev is a
  // sandbox address Resend only delivers to the account owner — it must stay a last resort.
  const from =
    process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? "FinFlow <onboarding@resend.dev>";
  const roleLabel = params.parRole ? PAR_ROLE_LABELS[params.parRole] ?? params.parRole : null;
  const subject = `Invitație în ${params.orgName} pe FinFlow${roleLabel ? ` — rol ${roleLabel}` : ""}`;
  const body = [
    `${params.invitedByName?.trim() || "Un administrator"} te-a invitat în workspace-ul ${params.orgName} pe FinFlow.`,
    "",
    "Detalii invitație:",
    `• Workspace: ${params.orgName}`,
    roleLabel ? `• Rolul tău: ${roleLabel}` : null,
    `• Cont invitat: ${params.to}`,
    "• Linkul expiră în 7 zile",
    "",
    `Acceptă invitația: ${params.url}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

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
        subject,
        html: buildHtml(subject, body),
        text: body,
      }),
    });
    if (!res.ok) {
      // VM1-07: a silent false here cost us the whole invite-email feature in prod — log WHY.
      const detail = await res.text().catch(() => "");
      console.error(`[par-invite] Resend send failed (${res.status}) to="${params.to}": ${detail.slice(0, 300)}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`[par-invite] Resend send error to="${params.to}":`, err instanceof Error ? err.message : err);
    return false;
  }
}
