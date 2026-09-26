/**
 * CRM-U03 — e-mailul cu care un act pleacă la client, „din partea FinFlow Documente".
 *
 * Ownerul: „trebuie să pot trimite email din numele FinFlow documente către client". Înainte
 * e-mailul era text simplu, de la adresa generică a serverului, cu PDF-ul atașat și atât: clientul
 * nu avea cum să accepte oferta decât printr-un răspuns liber, iar răspunsul ajungea la noreply.
 *
 * Acum:
 *   · expeditorul se vede ca „<Firma> · FinFlow Documente", de pe domeniul verificat (reputația
 *     domeniului rămâne una: aceeași adresă, alt nume afișat);
 *   · răspunsul (Reply-To) merge la omul care a trimis actul, nu la noreply;
 *   · corpul are butonul „Vezi și acceptă" spre pagina publică a actului (CRM-D06), plus PDF-ul.
 */

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Adresa de pe domeniul verificat, din EMAIL_FROM („Nume <adresa>" sau doar adresa). */
export function senderAddress(env: string | undefined = process.env.EMAIL_FROM ?? process.env.RESEND_FROM): string {
  const raw = (env ?? "").trim();
  const inBrackets = raw.match(/<([^>]+)>/);
  const address = (inBrackets ? inBrackets[1] : raw).trim();
  return /^[^@\s]+@[^@\s]+$/.test(address) ? address : "noreply@finflow.best";
}

/** „ATIC · FinFlow Documente <noreply@finflow.best>" — numele fără caractere care rup antetul. */
export function documentSender(orgName: string | null | undefined, env?: string): string {
  const org = (orgName ?? "").replace(/[<>"\r\n,;]/g, " ").replace(/\s+/g, " ").trim();
  const name = org ? `${org} · FinFlow Documente` : "FinFlow Documente";
  return `"${name}" <${senderAddress(env)}>`;
}

/** Expeditorul e-mailurilor scrise din fișa leadului: „<Firma> · FinFlow <adresa verificată>". */
export function crmSender(orgName: string | null | undefined, env?: string): string {
  const org = (orgName ?? "").replace(/[<>"\r\n,;]/g, " ").replace(/\s+/g, " ").trim();
  return `"${org ? `${org} · FinFlow` : "FinFlow"}" <${senderAddress(env)}>`;
}

export function documentEmailHtml(opts: {
  message: string;
  orgName: string | null;
  docLabel: string;
  /** Linkul spre pagina publică; lipsă = e-mail fără buton (acte non-CRM). */
  viewUrl?: string | null;
  /** „Vezi și acceptă oferta" / „Vezi documentul". */
  buttonLabel?: string;
}): string {
  const paragraphs = opts.message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = opts.viewUrl
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.viewUrl)}" style="display:inline-block;background:#0B57D0;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapeHtml(opts.buttonLabel ?? "Vezi documentul")}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#5F6368">Documentul (${escapeHtml(opts.docLabel)}) e atașat și în format PDF.</p>`
    : "";
  const footer = `Trimis prin FinFlow${opts.orgName ? ` în numele ${escapeHtml(opts.orgName)}` : ""}. Răspunde la acest e-mail pentru întrebări.`;
  return `<!doctype html><html lang="ro"><body style="margin:0;background:#F8FAFD;font-family:Arial,Helvetica,sans-serif;color:#1F1F1F">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="background:#ffffff;border:1px solid #E1E3E1;border-radius:16px;padding:28px">
    ${opts.orgName ? `<p style="margin:0 0 18px;font-size:13px;font-weight:700;color:#0B57D0">${escapeHtml(opts.orgName)}</p>` : ""}
    ${paragraphs}
    ${button}
  </div>
  <p style="margin:14px 4px 0;font-size:11px;color:#5F6368">${footer}</p>
</div></body></html>`;
}
