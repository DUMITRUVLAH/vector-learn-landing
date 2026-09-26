/**
 * COMMS-301 — Telegram Bot API.
 *
 * Documentație oficială + pașii de configurare: docs/comms/telegram.md.
 *
 * Ce impune Telegram:
 *  - Botul NU poate scrie primul. Omul trebuie să deschidă `https://t.me/<bot>?start=<payload>`
 *    (payload max 64 caractere [A-Za-z0-9_-]) sau să-i scrie. De-asta legarea de lead se face
 *    prin deep link semnat (server/lib/comms/deepLink.ts).
 *  - Webhook: `setWebhook` cu `secret_token`; Telegram îl trimite înapoi în antetul
 *    `X-Telegram-Bot-Api-Secret-Token` la fiecare cerere — asta e dovada de autenticitate.
 *  - Telegram Business: dacă firma își conectează botul la contul ei de Telegram, mesajele vin ca
 *    `business_message`, iar răspunsul pleacă din contul firmei cu `business_connection_id`,
 *    doar în chaturile cu mesaj primit în ultimele 24h.
 */
import type { ChannelAdapter, NormalizedEvent, OutboundMessage, SendResult, AdapterContext, CommMediaItem } from "../types";
import { CommsError } from "../types";
import { arr, obj, readJson, safeEqual, str } from "../util";

const API = "https://api.telegram.org";

/** Update-urile pe care le cerem. Lista explicită: implicitul Telegram poate varia între versiuni. */
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "my_chat_member",
  "business_connection",
  "business_message",
] as const;

async function call(ctx: Pick<AdapterContext, "creds" | "fetch">, method: string, body: Record<string, unknown>) {
  const res = await ctx.fetch(`${API}/bot${ctx.creds.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  return { ok: data.ok === true, data, status: res.status };
}

function fullName(u: Record<string, unknown>): string | null {
  const n = [str(u.first_name), str(u.last_name)].filter(Boolean).join(" ").trim();
  return n || str(u.username);
}

function messageToEvent(m: Record<string, unknown>, businessConnectionId: string | null): NormalizedEvent | null {
  const chat = obj(m.chat);
  // Doar chaturi private: grupurile nu sunt „un client care ne scrie".
  if (str(chat.type) !== "private") return null;
  const chatId = str(chat.id);
  const messageId = str(m.message_id);
  if (!chatId || !messageId) return null;
  const from = obj(m.from);

  let kind = "text";
  let body = str(m.text) ?? str(m.caption);
  let media: CommMediaItem[] | null = null;
  let phone: string | null = null;
  let startPayload: string | null = null;

  const photos = arr(m.photo);
  if (photos.length) {
    // ultima dimensiune e cea mai mare
    const p = obj(photos[photos.length - 1]);
    kind = "image";
    media = [{ type: "image", providerFileId: str(p.file_id), size: Number(p.file_size) || null }];
  } else if (m.document) {
    const d = obj(m.document);
    kind = "document";
    media = [{ type: "document", providerFileId: str(d.file_id), name: str(d.file_name), mime: str(d.mime_type), size: Number(d.file_size) || null }];
  } else if (m.voice || m.audio) {
    const a = obj(m.voice ?? m.audio);
    kind = "audio";
    media = [{ type: "audio", providerFileId: str(a.file_id), mime: str(a.mime_type), size: Number(a.file_size) || null }];
  } else if (m.video || m.video_note) {
    const v = obj(m.video ?? m.video_note);
    kind = "video";
    media = [{ type: "video", providerFileId: str(v.file_id), mime: str(v.mime_type), size: Number(v.file_size) || null }];
  } else if (m.sticker) {
    kind = "sticker";
    body = str(obj(m.sticker).emoji) ?? "[sticker]";
  } else if (m.contact) {
    const c = obj(m.contact);
    kind = "contact";
    const p = str(c.phone_number);
    body = `👤 ${fullName(c) ?? ""} ${p ?? ""}`.trim();
    // Numărul e al omului DOAR dacă și-a trimis propriul contact (butonul request_contact);
    // un contact redirecționat e al altcuiva.
    if (p && str(c.user_id) && str(c.user_id) === str(from.id)) phone = p.startsWith("+") ? p : `+${p}`;
  } else if (m.location) {
    const l = obj(m.location);
    kind = "location";
    body = `📍 ${l.latitude}, ${l.longitude}`;
  } else if (!body) {
    kind = "other";
    body = "[mesaj nesuportat]";
  }

  const startMatch = (str(m.text) ?? "").match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/);
  if (startMatch) startPayload = startMatch[1];

  return {
    type: "message",
    externalUserId: chatId,
    displayName: fullName(from) ?? fullName(chat),
    username: str(from.username),
    phone,
    externalId: messageId,
    kind,
    body,
    media,
    timestamp: new Date(Number(m.date ?? Date.now() / 1000) * 1000),
    startPayload,
    meta: {
      ...(businessConnectionId ? { businessConnectionId } : {}),
      languageCode: str(from.language_code),
    },
  };
}

export const telegramAdapter: ChannelAdapter = {
  kind: "telegram",

  async identify(ctx) {
    const me = await call(ctx, "getMe", {});
    if (!me.ok) throw new CommsError("provider_rejected", `Telegram a refuzat tokenul: ${str(me.data.description) ?? me.status}.`, 422);
    return str(obj(me.data.result).id) ?? "";
  },

  async connect({ creds, fetch, webhookUrl, webhookSecret }) {
    if (!creds.botToken || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(creds.botToken)) {
      throw new CommsError("missing_credentials", "Tokenul botului lipsește sau nu are formatul de la @BotFather (123456:ABC…).", 422);
    }
    const me = await call({ creds, fetch }, "getMe", {});
    if (!me.ok) {
      throw new CommsError("provider_rejected", `Telegram a refuzat tokenul: ${str(me.data.description) ?? me.status}.`, 422);
    }
    const bot = obj(me.data.result);
    const hook = await call({ creds, fetch }, "setWebhook", {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
      drop_pending_updates: true,
      max_connections: 40,
    });
    if (!hook.ok) {
      throw new CommsError("webhook_failed", `setWebhook a eșuat: ${str(hook.data.description) ?? hook.status}.`, 502);
    }
    return {
      externalId: str(bot.id) ?? "",
      config: {
        botUsername: str(bot.username),
        botName: str(bot.first_name),
        canConnectToBusiness: bot.can_connect_to_business === true,
      },
    };
  },

  async disconnect(ctx) {
    await call(ctx, "deleteWebhook", { drop_pending_updates: false });
  },

  verifyWebhook(req, ctx) {
    return safeEqual(req.headers["x-telegram-bot-api-secret-token"], ctx.webhookSecret);
  },

  parseWebhook(payload) {
    const u = obj(payload);
    const events: NormalizedEvent[] = [];
    if (u.message) {
      const e = messageToEvent(obj(u.message), null);
      if (e) events.push(e);
    } else if (u.business_message) {
      const bm = obj(u.business_message);
      const e = messageToEvent(bm, str(bm.business_connection_id));
      if (e) events.push(e);
    } else if (u.callback_query) {
      const q = obj(u.callback_query);
      const chatId = str(obj(obj(q.message).chat).id) ?? str(obj(q.from).id);
      if (chatId) {
        events.push({
          type: "message",
          externalUserId: chatId,
          displayName: fullName(obj(q.from)),
          externalId: `cb:${str(q.id)}`,
          kind: "text",
          body: `[buton] ${str(q.data) ?? ""}`.trim(),
          timestamp: new Date(),
        });
      }
    } else if (u.my_chat_member) {
      const m = obj(u.my_chat_member);
      const chat = obj(m.chat);
      if (str(chat.type) === "private" && str(chat.id)) {
        const status = str(obj(m.new_chat_member).status);
        events.push({ type: "blocked", externalUserId: str(chat.id)!, blocked: status === "kicked" });
      }
    } else if (u.business_connection) {
      const bc = obj(u.business_connection);
      events.push({
        type: "config",
        patch: {
          businessConnection: {
            id: str(bc.id),
            enabled: bc.is_enabled === true,
            canReply: obj(bc.rights).can_reply === true || bc.can_reply === true,
            userName: fullName(obj(bc.user)),
          },
        },
      });
    }
    // edited_message: păstrăm varianta inițială; editările nu schimbă istoria conversației.
    return events;
  },

  async send(ctx, msg: OutboundMessage): Promise<SendResult> {
    const businessConnectionId = str(msg.lastInboundMeta?.businessConnectionId);
    const common: Record<string, unknown> = {
      chat_id: msg.to,
      ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
      ...(msg.replyToExternalId && /^\d+$/.test(msg.replyToExternalId)
        ? { reply_parameters: { message_id: Number(msg.replyToExternalId), allow_sending_without_reply: true } }
        : {}),
    };
    let method = "sendMessage";
    let body: Record<string, unknown>;
    if (msg.media) {
      method = msg.media.type === "image" ? "sendPhoto" : msg.media.type === "video" ? "sendVideo" : msg.media.type === "audio" ? "sendAudio" : "sendDocument";
      const field = method === "sendPhoto" ? "photo" : method === "sendVideo" ? "video" : method === "sendAudio" ? "audio" : "document";
      body = { ...common, [field]: msg.media.url, ...(msg.text ? { caption: msg.text.slice(0, 1024) } : {}) };
    } else {
      body = { ...common, text: (msg.text ?? "").slice(0, 4096) };
    }
    const r = await call(ctx, method, body);
    if (!r.ok) {
      return {
        ok: false,
        errorCode: str(r.data.error_code) ?? String(r.status),
        errorMessage: str(r.data.description) ?? `HTTP ${r.status}`,
      };
    }
    return { ok: true, externalId: str(obj(r.data.result).message_id) };
  },

  async fetchMedia(ctx, fileId) {
    const r = await call(ctx, "getFile", { file_id: fileId });
    const path = str(obj(r.data.result).file_path);
    if (!r.ok || !path) throw new CommsError("media_unavailable", "Telegram nu mai oferă fișierul (limită 20 MB la descărcare).", 404);
    // URL-ul conține tokenul botului — rămâne pe server, nu ajunge în browser.
    const res = await ctx.fetch(`${API}/file/bot${ctx.creds.botToken}/${path}`);
    if (!res.ok) throw new CommsError("media_unavailable", "Descărcarea fișierului de la Telegram a eșuat.", 502);
    return { body: await res.arrayBuffer(), mime: res.headers.get("content-type") };
  },
};
