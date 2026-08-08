/**
 * Outbound-email guard — the one place that decides whether a real email may leave the app.
 *
 * WHY (2026-08-08 incident): the PAR e2e/QA sweeps run against the seeded ATIC demo tenant, whose
 * users live at `@atic.demo.io` — a domain with no MX record. `.env` carries a REAL `RESEND_API_KEY`,
 * and the providers only stubbed when that key was MISSING, so every local sweep pushed dozens of
 * `[PAR] … aprobare necesară` mails through Resend that hard-bounced. Hard bounces are charged to the
 * sending domain's reputation (`noreply@finflow.best`) and Resend suspends accounts over ~5% bounce
 * rate — i.e. test traffic was burning the product's real deliverability.
 *
 * Rules, in order:
 *   1. `EMAIL_SEND_MODE=off`            → never send (kill switch).
 *   2. recipient domain is undeliverable (reserved TLD / known demo domain) → never send, anywhere.
 *   3. NODE_ENV !== "production" and `EMAIL_SEND_MODE` !== "on" → don't send (local + e2e default).
 *   4. `EMAIL_ALLOWLIST` set → send only to listed addresses/domains.
 *   5. otherwise → send.
 *
 * Blocked is NOT an error: callers log and continue. Email is transport; in-app notifications and
 * copyable links are the source of truth.
 */

/** Reserved / never-deliverable suffixes (RFC 2606 + RFC 6761) and our demo domains. */
const UNDELIVERABLE_SUFFIXES = [
  // RFC-reserved: can never resolve
  ".test",
  ".invalid",
  ".localhost",
  ".example",
  "example.com",
  "example.net",
  "example.org",
  // seeded demo tenants (server/db/seed.ts) — realistic-looking, deliberately unroutable
  ".demo.io",
  "demo.vectorlearn.io",
];

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/** True when the address can never receive mail (reserved TLD or a seeded demo domain). */
export function isUndeliverableRecipient(address: string): boolean {
  const domain = domainOf(address);
  if (!domain) return true;
  return UNDELIVERABLE_SUFFIXES.some((s) => domain === s.replace(/^\./, "") || domain.endsWith(s));
}

export interface EmailSendDecision {
  allowed: boolean;
  /** Short machine-ish reason, for logs. Only set when blocked. */
  reason?: string;
}

/** Decide whether `to` may receive a real email in the current environment. */
export function emailSendDecision(to: string): EmailSendDecision {
  const address = (to ?? "").trim().toLowerCase();
  const mode = (process.env.EMAIL_SEND_MODE ?? "").trim().toLowerCase();

  if (mode === "off") return { allowed: false, reason: "EMAIL_SEND_MODE=off" };

  if (isUndeliverableRecipient(address)) {
    return { allowed: false, reason: `undeliverable recipient domain (${domainOf(address) || "none"})` };
  }

  if (process.env.NODE_ENV !== "production" && mode !== "on") {
    return { allowed: false, reason: "non-production env (set EMAIL_SEND_MODE=on to send for real)" };
  }

  const allowlist = (process.env.EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0) {
    const domain = domainOf(address);
    const ok = allowlist.some((entry) => entry === address || entry === domain || entry === `@${domain}`);
    if (!ok) return { allowed: false, reason: "not in EMAIL_ALLOWLIST" };
  }

  return { allowed: true };
}
