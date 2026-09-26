/**
 * COMMS-301 — WhatsApp Business Platform, Cloud API (Meta).
 *
 * Documentație oficială + pașii de configurare: docs/comms/whatsapp.md.
 *
 * Reguli pe care le impune furnizorul și pe care le respectă codul de aici:
 *  - Trimitere: `POST https://graph.facebook.com/<v>/<PHONE_NUMBER_ID>/messages`, Bearer token.
 *  - Numărul destinatarului se trimite CU `+` (Meta: fără `+` se prefixează codul țării firmei și
 *    mesajul poate pleca la alt om). Contactele care vin doar cu BSUID (utilizatori cu username,
 *    din 2026) se adresează prin câmpul `recipient`, nu `to`.
 *  - Webhook: handshake GET cu `hub.verify_token`, apoi POST semnat `X-Hub-Signature-256:
 *    sha256=<hex HMAC-SHA256(App Secret, corpul brut)>`.
 *  - În afara ferestrei de 24h de la ultimul mesaj al clientului se poate trimite DOAR un
 *    template aprobat (altfel eroarea 131047) — verificarea stă în send.ts, înainte de apel.
 */
import type {
  ChannelAdapter,
  AdapterContext,
  NormalizedEvent,
  OutboundMessage,
  SendResult,
  CommMediaItem,
} from "../types";
import { CommsError } from "../types";
import { arr, hmacSha256Hex, obj, readJson, safeEqual, str } from "../util";

export const WHATSAPP_DEFAULT_GRAPH_VERSION = "v25.0";

function graphBase(ctx: Pick<AdapterContext, "config">): string {
  const v = str(ctx.config.graphVersion) ?? process.env.WHATSAPP_GRAPH_VERSION ?? WHATSAPP_DEFAULT_GRAPH_VERSION;
  return `https://graph.facebook.com/${v}`;
}

/** App Secret: al canalului (aplicația Meta proprie a clientului) sau al platformei (Embedded Signup). */
export function whatsappAppSecret(ctx: Pick<AdapterContext, "creds">): string | null {
  return ctx.creds.appSecret || process.env.META_APP_SECRET || null;
}

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

/** Textul unui mesaj primit, indiferent de tip — pentru previzualizare și cronologia leadului. */
function inboundBody(m: Record<string, unknown>): { kind: string; body: string | null; media: CommMediaItem[] | null } {
  const type = str(m.type) ?? "other";
  if (type === "text") return { kind: "text", body: str(obj(m.text).body), media: null };
  if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const md = obj(m[type]);
    return {
      kind: type,
      body: str(md.caption),
      media: [
        {
          type,
          providerFileId: str(md.id),
          mime: str(md.mime_type),
          name: str(md.filename),
        },
      ],
    };
  }
  if (type === "location") {
    const l = obj(m.location);
    const label = [str(l.name), str(l.address)].filter(Boolean).join(", ");
    return { kind: "location", body: `📍 ${label || `${l.latitude}, ${l.longitude}`}`, media: null };
  }
  if (type === "contacts") {
    const c = obj(arr(m.contacts)[0]);
    const phones = arr(c.phones).map((p) => str(obj(p).phone)).filter(Boolean);
    return { kind: "contact", body: `👤 ${str(obj(c.name).formatted_name) ?? ""} ${phones.join(", ")}`.trim(), media: null };
  }
  if (type === "button") return { kind: "text", body: str(obj(m.button).text), media: null };
  if (type === "interactive") {
    const i = obj(m.interactive);
    const reply = obj(i.button_reply ?? i.list_reply);
    return { kind: "text", body: str(reply.title), media: null };
  }
  if (type === "reaction") return { kind: "other", body: `Reacție ${str(obj(m.reaction).emoji) ?? ""}`.trim(), media: null };
  return { kind: "other", body: `[mesaj ${type} nesuportat]`, media: null };
}

export const whatsappAdapter: ChannelAdapter = {
  kind: "whatsapp",

  async identify(ctx) {
    if (!ctx.creds.phoneNumberId) throw new CommsError("missing_credentials", "Lipsește Phone Number ID.", 422);
    return ctx.creds.phoneNumberId;
  },

  async connect({ creds, config, fetch }) {
    if (!creds.accessToken || !creds.phoneNumberId) {
      throw new CommsError("missing_credentials", "Lipsesc Access Token sau Phone Number ID.", 422);
    }
    if (!whatsappAppSecret({ creds })) {
      // Fără App Secret nu putem verifica semnătura webhook-ului, deci n-am putea primi mesaje
      // în siguranță. Refuzăm conectarea în loc să acceptăm orice POST (CLAUDE.md §3.5.1).
      throw new CommsError("missing_app_secret", "Lipsește App Secret (necesar pentru a verifica webhook-urile Meta).", 422);
    }
    const res = await fetch(
      `${graphBase({ config })}/${encodeURIComponent(creds.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    );
    const data = await readJson(res);
    if (!res.ok) {
      const err = obj(data.error);
      throw new CommsError(
        "provider_rejected",
        `Meta a refuzat credențialele: ${str(err.message) ?? res.status} (cod ${str(err.code) ?? "?"}).`,
        422
      );
    }
    return {
      externalId: creds.phoneNumberId,
      config: {
        displayPhone: str(data.display_phone_number),
        verifiedName: str(data.verified_name),
        qualityRating: str(data.quality_rating),
        wabaId: creds.wabaId || null,
      },
      // Meta nu permite setarea URL-ului de webhook al aplicației prin API cu tokenul de sistem
      // decât prin override pe WABA; pasul manual e cel sigur și e descris în docs/comms/whatsapp.md.
      manualSteps: [
        "În Meta App Dashboard → WhatsApp → Configuration → Webhook: lipește Callback URL și Verify token de mai jos.",
        "Apasă „Verify and save”, apoi la Webhook fields abonează câmpul „messages”.",
      ],
    };
  },

  verifyWebhook(req, ctx) {
    const secret = whatsappAppSecret(ctx);
    const header = req.headers["x-hub-signature-256"];
    if (!secret || !header?.startsWith("sha256=")) return false;
    return safeEqual(header.slice(7), hmacSha256Hex(secret, req.rawBody));
  },

  parseWebhook(payload) {
    const events: NormalizedEvent[] = [];
    for (const entry of arr(obj(payload).entry)) {
      for (const change of arr(obj(entry).changes)) {
        const value = obj(obj(change).value);
        const contacts = arr(value.contacts).map(obj);
        for (const raw of arr(value.messages)) {
          const m = obj(raw);
          const waId = str(m.from);
          const bsuid = str(m.from_user_id);
          const contact =
            contacts.find((c) => (waId && str(c.wa_id) === waId) || (bsuid && str(c.user_id) === bsuid)) ?? contacts[0] ?? {};
          const externalUserId = waId ?? bsuid;
          const externalId = str(m.id);
          if (!externalUserId || !externalId) continue;
          const { kind, body, media } = inboundBody(m);
          events.push({
            type: "message",
            externalUserId,
            displayName: str(obj(contact.profile).name),
            phone: waId ? `+${waId}` : null,
            username: str(contact.username),
            externalId,
            kind,
            body,
            media,
            timestamp: new Date(Number(str(m.timestamp) ?? Date.now() / 1000) * 1000),
            meta: {
              phoneNumberId: str(obj(value.metadata).phone_number_id),
              bsuid,
              replyTo: str(obj(m.context).id),
            },
          });
        }
        for (const raw of arr(value.statuses)) {
          const s = obj(raw);
          const status = str(s.status);
          const externalId = str(s.id);
          if (!externalId || !status || !["sent", "delivered", "read", "failed"].includes(status)) continue;
          const err = obj(arr(s.errors)[0]);
          events.push({
            type: "status",
            externalId,
            status: status as "sent" | "delivered" | "read" | "failed",
            errorCode: str(err.code),
            errorMessage: str(obj(err.error_data).details) ?? str(err.message) ?? str(err.title),
            timestamp: new Date(Number(str(s.timestamp) ?? Date.now() / 1000) * 1000),
          });
        }
      }
    }
    return events;
  },

  async send(ctx, msg: OutboundMessage): Promise<SendResult> {
    const { creds, fetch } = ctx;
    // wa_id = doar cifre → îl trimitem ca număr E.164 cu „+"; altfel e BSUID (ex. „US.1349…").
    const isPhone = /^\d{6,}$/.test(msg.to);
    const target: Record<string, unknown> = isPhone ? { to: `+${msg.to}` } : { recipient: msg.to };
    const base: Record<string, unknown> = { messaging_product: "whatsapp", recipient_type: "individual", ...target };
    if (msg.replyToExternalId) base.context = { message_id: msg.replyToExternalId };

    let body: Record<string, unknown>;
    if (msg.template) {
      body = {
        ...base,
        type: "template",
        template: {
          name: msg.template.name,
          language: { code: msg.template.language },
          ...(msg.template.params.length
            ? { components: [{ type: "body", parameters: msg.template.params.map((text) => ({ type: "text", text })) }] }
            : {}),
        },
      };
    } else if (msg.media) {
      const t = msg.media.type;
      body = {
        ...base,
        type: t,
        [t]: {
          link: msg.media.url,
          ...(msg.text && t !== "audio" ? { caption: msg.text.slice(0, 1024) } : {}),
          ...(t === "document" && msg.media.name ? { filename: msg.media.name } : {}),
        },
      };
    } else {
      body = { ...base, type: "text", text: { preview_url: false, body: (msg.text ?? "").slice(0, 4096) } };
    }

    const res = await fetch(`${graphBase(ctx)}/${encodeURIComponent(creds.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson(res);
    if (!res.ok) {
      const err = obj(data.error);
      return {
        ok: false,
        errorCode: str(err.code) ?? String(res.status),
        errorMessage: str(obj(err.error_data).details) ?? str(err.message) ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, externalId: str(obj(arr(data.messages)[0]).id) };
  },

  async fetchMedia(ctx, mediaId) {
    const auth = { Authorization: `Bearer ${ctx.creds.accessToken}` };
    const metaRes = await ctx.fetch(`${graphBase(ctx)}/${encodeURIComponent(mediaId)}`, { headers: auth });
    const meta = await readJson(metaRes);
    const url = str(meta.url);
    if (!metaRes.ok || !url) throw new CommsError("media_unavailable", "Fișierul nu mai e disponibil la Meta (expiră după 7 zile).", 404);
    // URL-ul expiră în 5 minute și cere același Bearer — de-asta îl cerem la fiecare descărcare.
    const fileRes = await ctx.fetch(url, { headers: auth });
    if (!fileRes.ok) throw new CommsError("media_unavailable", "Descărcarea fișierului de la Meta a eșuat.", 502);
    return { body: await fileRes.arrayBuffer(), mime: str(meta.mime_type) };
  },
};

/** Template-urile aprobate ale contului — pentru mesajele din afara ferestrei de 24h. */
export async function listWhatsappTemplates(
  ctx: AdapterContext
): Promise<{ name: string; language: string; category: string | null; status: string | null; body: string | null; paramCount: number }[]> {
  const wabaId = ctx.creds.wabaId || str(ctx.config.wabaId);
  if (!wabaId) throw new CommsError("missing_waba", "Pentru template-uri e nevoie de WhatsApp Business Account ID.", 422);
  const res = await ctx.fetch(
    `${graphBase(ctx)}/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=200`,
    { headers: { Authorization: `Bearer ${ctx.creds.accessToken}` } }
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw new CommsError("provider_rejected", `Meta: ${str(obj(data.error).message) ?? res.status}`, 502);
  }
  return arr(data.data).map((raw) => {
    const t = obj(raw);
    const bodyComp = arr(t.components).map(obj).find((c) => str(c.type) === "BODY");
    const text = str(bodyComp?.text);
    return {
      name: str(t.name) ?? "",
      language: str(t.language) ?? "ro",
      category: str(t.category),
      status: str(t.status),
      body: text,
      paramCount: text ? new Set(text.match(/\{\{[^}]+\}\}/g) ?? []).size : 0,
    };
  });
}

/** Confirmarea de citire către client (bifele albastre) — best effort. */
export async function markWhatsappRead(ctx: AdapterContext, messageId: string): Promise<void> {
  try {
    await ctx.fetch(`${graphBase(ctx)}/${encodeURIComponent(ctx.creds.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
  } catch {
    // o bifă albastră ratată nu e un motiv să pice deschiderea conversației
  }
}
