/**
 * COMMS-301 — Gmail API (cutia de email a fiecărui agent, conectată prin OAuth).
 *
 * Documentație oficială + pașii de configurare: docs/comms/gmail.md.
 *
 * Diferit de mesagerii: nu există un webhook semnat per canal. Mesajele noi se află prin
 *  (1) Pub/Sub push (`users.watch` → POST pe /api/comms/webhooks/gmail cu {emailAddress, historyId}),
 *  (2) plasa de siguranță: sincronizarea la deschiderea inboxului + cronul zilnic.
 * Ambele cheamă `syncGmailChannel` (server/lib/comms/gmailSync.ts), care citește `history.list`
 * de la ultimul `historyId` salvat — notificarea în sine nu e mesajul, doar semnalul.
 *
 * Trimiterea: `users.messages.send` cu RFC 2822 în base64url; pentru ca răspunsul să rămână în
 * firul clientului: același `threadId`, subiect „Re: …", `In-Reply-To` + `References` = Message-ID-ul
 * mesajului primit (NU id-ul Gmail).
 */
import type { ChannelAdapter, OutboundMessage, SendResult, AdapterContext, NormalizedEvent, CommMediaItem } from "../types";
import { CommsError } from "../types";
import { arr, obj, readJson, str } from "../util";

export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/**
 * Setul minim pentru „citesc răspunsurile clienților + răspund din adresa mea".
 * `gmail.readonly` e scope RESTRICTED: aplicația External în producție cere verificare Google +
 * evaluare CASA anuală. Detaliat în docs/comms/gmail.md.
 */
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Antet RFC 2047 pentru subiecte cu diacritice. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Împiedică injecția de antete: un CR/LF într-un câmp ar adăuga un „Bcc:" ascuns. */
function oneLine(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

export interface MimeInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
}

export function buildMime(o: MimeInput): string {
  const headers = [
    `From: ${oneLine(o.from)}`,
    `To: ${oneLine(o.to)}`,
    `Subject: ${encodeHeader(oneLine(o.subject))}`,
    "MIME-Version: 1.0",
    ...(o.inReplyTo
      ? [
          `In-Reply-To: ${oneLine(o.inReplyTo)}`,
          `References: ${oneLine([o.references, o.inReplyTo].filter(Boolean).join(" "))}`,
        ]
      : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(o.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

function header(msg: Record<string, unknown>, name: string): string | null {
  const h = arr(obj(msg.payload).headers)
    .map(obj)
    .find((x) => str(x.name)?.toLowerCase() === name.toLowerCase());
  return str(h?.value);
}

function findPart(part: Record<string, unknown>, mime: string): string | null {
  if (str(part.mimeType) === mime && str(obj(part.body).data)) return fromBase64url(str(obj(part.body).data)!);
  for (const child of arr(part.parts)) {
    const r = findPart(obj(child), mime);
    if (r) return r;
  }
  return null;
}

function collectAttachments(part: Record<string, unknown>, out: CommMediaItem[]): void {
  const body = obj(part.body);
  const filename = str(part.filename);
  if (filename && str(body.attachmentId)) {
    out.push({
      type: "document",
      providerFileId: str(body.attachmentId),
      name: filename,
      mime: str(part.mimeType),
      size: Number(body.size) || null,
    });
  }
  for (const child of arr(part.parts)) collectAttachments(obj(child), out);
}

/** HTML → text simplu, suficient pentru inbox (nu randăm HTML străin în aplicație). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Taie citatul din răspuns („On … wrote:" / „În … a scris:"), ca inboxul să arate ce a scris
 * omul acum, nu tot firul repetat de fiecare dată.
 */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex(
    (l) =>
      /^\s*(On|În|Pe|Le|Am)\b.{0,200}(wrote|a scris|scrie|écrit|schrieb)\s*:\s*$/i.test(l) ||
      /^-{2,}\s*(Original Message|Mesaj original)/i.test(l) ||
      /^_{5,}$/.test(l.trim())
  );
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).filter((l) => !l.trimStart().startsWith(">"));
  return kept.join("\n").trim() || text.trim();
}

/** Parsează adresa din „Nume <adresa@x.md>". */
export function parseAddress(v: string | null): { email: string | null; name: string | null } {
  if (!v) return { email: null, name: null };
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  const e = v.trim().toLowerCase();
  return { email: /@/.test(e) ? e : null, name: null };
}

/** Un mesaj Gmail (format=full) → eveniment normalizat. `null` pentru mesajele trimise de noi. */
export function gmailMessageToEvent(msg: Record<string, unknown>, ownEmail: string): NormalizedEvent | null {
  const labels = arr(msg.labelIds).map((x) => str(x));
  if (labels.includes("SENT") || labels.includes("DRAFT") || labels.includes("SPAM")) return null;
  const from = parseAddress(header(msg, "From"));
  if (!from.email || from.email === ownEmail.toLowerCase()) return null;
  // Notificările automate (no-reply, mailer-daemon) nu sunt clienți care ne scriu.
  if (/^(no-?reply|mailer-daemon|postmaster|notifications?)@/i.test(from.email)) return null;
  const payload = obj(msg.payload);
  const plain = findPart(payload, "text/plain");
  const html = plain ? null : findPart(payload, "text/html");
  const text = stripQuoted(plain ?? (html ? htmlToText(html) : str(msg.snippet) ?? ""));
  const media: CommMediaItem[] = [];
  collectAttachments(payload, media);
  const id = str(msg.id);
  if (!id) return null;
  // Atașamentul se cere cu id-ul mesajului + id-ul atașamentului; le ținem împreună.
  for (const m of media) m.providerFileId = `${id}:${m.providerFileId}`;
  return {
    type: "message",
    externalUserId: from.email,
    displayName: from.name,
    email: from.email,
    externalId: id,
    threadId: str(msg.threadId),
    subject: header(msg, "Subject"),
    kind: "text",
    body: text.slice(0, 20_000),
    media: media.length ? media : null,
    timestamp: new Date(Number(str(msg.internalDate) ?? Date.now())),
    meta: {
      messageIdHeader: header(msg, "Message-ID") ?? header(msg, "Message-Id"),
      references: header(msg, "References"),
      gmailMessageId: id,
    },
  };
}

export const gmailAdapter: ChannelAdapter = {
  kind: "gmail",

  async connect() {
    // Gmail nu se conectează din formular cu un token lipit: doar prin OAuth (routes/commsGmail.ts).
    throw new CommsError("use_oauth", "Gmail se conectează prin butonul „Conectează cu Google”.", 400);
  },

  verifyWebhook() {
    // Push-ul Gmail vine prin Pub/Sub, autentificat global (OIDC), nu per canal — vezi gmailPush.ts.
    return false;
  },

  parseWebhook() {
    return [];
  },

  async send(ctx: AdapterContext, msg: OutboundMessage): Promise<SendResult> {
    const own = str(ctx.config.email);
    if (!own) return { ok: false, errorCode: "no_mailbox", errorMessage: "Cutia Gmail nu e conectată complet." };
    const meta = msg.lastInboundMeta ?? {};
    const baseSubject = msg.subject?.trim() || "(fără subiect)";
    const isReply = Boolean(msg.threadId && str(meta.messageIdHeader));
    const subject = isReply && !/^re:/i.test(baseSubject) ? `Re: ${baseSubject}` : baseSubject;
    const displayName = str(ctx.config.displayName);
    const raw = buildMime({
      from: displayName ? `${encodeHeader(displayName)} <${own}>` : own,
      to: msg.to,
      subject,
      text: msg.text ?? "",
      inReplyTo: isReply ? str(meta.messageIdHeader) : null,
      references: isReply ? str(meta.references) : null,
    });
    const res = await ctx.fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64url(raw), ...(msg.threadId ? { threadId: msg.threadId } : {}) }),
    });
    const data = await readJson(res);
    if (!res.ok) {
      const err = obj(data.error);
      return { ok: false, errorCode: str(err.code) ?? String(res.status), errorMessage: str(err.message) ?? `HTTP ${res.status}` };
    }
    return { ok: true, externalId: str(data.id), threadId: str(data.threadId), meta: { subject } };
  },

  async fetchMedia(ctx, ref) {
    // ref = "<gmailMessageId>:<attachmentId>"
    const [messageId, attachmentId] = ref.split(":");
    const res = await ctx.fetch(`${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      headers: { Authorization: `Bearer ${ctx.creds.accessToken}` },
    });
    const data = await readJson(res);
    if (!res.ok || !str(data.data)) throw new CommsError("media_unavailable", "Atașamentul nu mai e disponibil în Gmail.", 404);
    const bytes = Buffer.from(str(data.data)!.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return { body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mime: null };
  },
};
