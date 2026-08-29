/**
 * DG-115 — trimiterea actului către contraparte.
 *
 * De ce nu direct din clientul de email personal: acolo nimeni nu mai știe ce s-a trimis, cui și
 * când, iar la un control răspunsul e „cred că i-am trimis". Aici pleacă din aplicație, cu PDF-ul
 * atașat, și rămâne în jurnalul actului.
 *
 * Poarta de livrare (`emailGuard`) e obligatorie și nu se ocolește: adresele demo sunt blocate
 * oriunde, iar în afara producției nu pleacă nimic fără EMAIL_SEND_MODE=on. Motivul e scris în
 * CLAUDE.md §3.5.1: o măturare e2e pe tenantul demo a trimis odată e-mailuri reale care au făcut
 * bounce, arzând reputația expeditorului.
 */
import { emailSendDecision } from "../emailGuard";

export interface SendDocumentEmailParams {
  to: string;
  subject: string;
  message: string;
  fileName: string;
  pdfBase64: string | null;
}

export type SendDocumentEmailResult =
  | { sent: true }
  | { sent: false; reason: "blocked" | "not_configured" | "failed"; detail: string };

export async function sendDocumentEmail(
  params: SendDocumentEmailParams
): Promise<SendDocumentEmailResult> {
  const decision = emailSendDecision(params.to);
  if (!decision.allowed) {
    return {
      sent: false,
      reason: "blocked",
      // Mesajul ajunge la om, deci spune ce s-a întâmplat, nu un cod.
      detail:
        decision.reason === "non_production"
          ? "Mediul acesta nu trimite e-mailuri reale (protecție anti-trimitere din teste)."
          : "Adresa e blocată de politica de trimitere (domeniu demo sau nelivrabil).",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: "not_configured", detail: "Serviciul de e-mail nu e configurat." };
  }

  const from = process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? "Vector Finance <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.message,
        ...(params.pdfBase64
          ? { attachments: [{ filename: params.fileName, content: params.pdfBase64 }] }
          : {}),
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: "failed", detail: `Serviciul de e-mail a răspuns ${res.status}.` };
    }
    return { sent: true };
  } catch (e) {
    return {
      sent: false,
      reason: "failed",
      detail: e instanceof Error ? e.message : "Trimiterea a eșuat.",
    };
  }
}
