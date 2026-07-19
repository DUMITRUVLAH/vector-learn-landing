/**
 * Account-lifecycle emails (password reset, etc.) via Resend — mirrors server/lib/par/invites.ts.
 * Email is transport only: gated on RESEND_API_KEY, never throws so a send failure can't break the
 * request. The reset link points at the business SPA route (/#/business/reset).
 */
function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/#/business/reset?token=${token}`;
}

/** Send a password-reset email. Returns false (no-op) when RESEND_API_KEY is unset. Never throws. */
export async function sendPasswordResetEmail(params: { to: string; url: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from =
    process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? "Vector Finance <onboarding@resend.dev>";
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
        subject: "Resetare parolă — Vector Finance",
        html: `<p>Ai cerut resetarea parolei pentru contul tău Vector Finance.</p>
<p><a href="${params.url}">Setează o parolă nouă</a></p>
<p>Sau copiază linkul: ${params.url}</p>
<p>Linkul expiră în 1 oră. Dacă nu tu ai cerut resetarea, ignoră acest mesaj.</p>`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[auth-reset] Resend send failed (${res.status}) to="${params.to}": ${detail.slice(0, 300)}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`[auth-reset] Resend send error to="${params.to}":`, err instanceof Error ? err.message : err);
    return false;
  }
}
