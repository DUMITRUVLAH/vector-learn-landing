/**
 * COMMS-301 — Viber REST Bot API.
 *
 * Documentație oficială + pașii de configurare: docs/comms/viber.md.
 *
 * Ce impune Viber:
 *  - Toate apelurile: `POST https://chatapi.viber.com/pa/<metodă>`, antet `X-Viber-Auth-Token`.
 *  - `set_webhook` declanșează IMEDIAT un POST `{"event":"webhook"}` pe URL-ul nostru, care
 *    trebuie să răspundă 200 — altfel `set_webhook` întoarce `status: 1`. De-asta rândul
 *    canalului se creează ÎNAINTE de `connect` (vezi rutele de canale).
 *  - Semnătura: `X-Viber-Content-Signature` = hex(HMAC-SHA256(auth token, corpul BRUT)).
 *  - `message_token` e un întreg pe 64 de biți: `JSON.parse` îl rotunjește, deci îl citim ca șir.
 *  - Botul poate scrie doar abonaților. Omul se abonează scriind primul mesaj; deep link-ul
 *    `viber://pa?chatURI=<uri>&context=<ctx>` duce `context` în `conversation_started`.
 *  - Din 5.02.2024 boturile noi se creează doar comercial (abonament lunar, prin partener).
 */
import type { ChannelAdapter, NormalizedEvent, OutboundMessage, SendResult, AdapterContext, CommMediaItem } from "../types";
import { CommsError } from "../types";
import { hmacSha256Hex, obj, readJson, safeEqual, str } from "../util";

const API = "https://chatapi.viber.com/pa";

export const VIBER_STATUS_MESSAGES: Record<number, string> = {
  1: "URL-ul de webhook e invalid sau nu a răspuns 200",
  2: "Token de autentificare invalid",
  3: "Cerere malformată",
  4: "Lipsește un câmp obligatoriu",
  5: "Destinatarul nu are Viber",
  6: "Destinatarul nu e abonat la bot (trebuie să scrie el primul)",
  7: "Contul botului e blocat",
  8: "Tokenul nu aparține unui cont de bot",
  9: "Contul botului e suspendat",
  10: "Webhook-ul nu e setat",
  11: "Dispozitivul destinatarului nu suportă boturi",
  12: "Prea multe cereri (limită de rată)",
  13: "Versiunea Viber a destinatarului e prea veche",
  23: "Botul a atins pragul lunar de mesaje gratuite",
  24: "Botul nu are sold (mesaje facturabile)",
};

/** `message_token` rămâne șir: 4912661846655238145 > Number.MAX_SAFE_INTEGER. */
export function decodeViberBody(raw: string): unknown {
  return JSON.parse(raw.replace(/"message_token"\s*:\s*(\d+)/g, '"message_token":"$1"'));
}

async function call(ctx: Pick<AdapterContext, "creds" | "fetch">, method: string, body: Record<string, unknown>) {
  const res = await ctx.fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "X-Viber-Auth-Token": ctx.creds.authToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (decodeViberBody(text) as Record<string, unknown>) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  const status = typeof data.status === "number" ? data.status : Number(data.status ?? -1);
  return { ok: res.ok && status === 0, status, data };
}

function statusMessage(status: number, fallback: unknown): string {
  return VIBER_STATUS_MESSAGES[status] ?? str(fallback) ?? `Eroare Viber ${status}`;
}

export const viberAdapter: ChannelAdapter = {
  kind: "viber",

  async identify(ctx) {
    if (!ctx.creds.authToken) throw new CommsError("missing_credentials", "Lipsește tokenul botului Viber.", 422);
    const info = await call(ctx, "get_account_info", {});
    if (!info.ok) throw new CommsError("provider_rejected", `Viber a refuzat tokenul: ${statusMessage(info.status, info.data.status_message)}.`, 422);
    return str(info.data.id) ?? str(info.data.uri) ?? "";
  },

  async connect({ creds, config, fetch, webhookUrl }) {
    if (!creds.authToken) throw new CommsError("missing_credentials", "Lipsește tokenul botului Viber.", 422);
    const info = await call({ creds, fetch }, "get_account_info", {});
    if (!info.ok) {
      throw new CommsError("provider_rejected", `Viber a refuzat tokenul: ${statusMessage(info.status, info.data.status_message)}.`, 422);
    }
    const hook = await call({ creds, fetch }, "set_webhook", {
      url: webhookUrl,
      event_types: ["delivered", "seen", "failed", "subscribed", "unsubscribed", "conversation_started"],
      send_name: true,
      send_photo: true,
    });
    if (!hook.ok) {
      throw new CommsError("webhook_failed", `set_webhook a eșuat: ${statusMessage(hook.status, hook.data.status_message)}.`, 502);
    }
    const name = str(info.data.name);
    return {
      externalId: str(info.data.id) ?? str(info.data.uri) ?? "",
      config: {
        botUri: str(info.data.uri),
        botName: name,
        icon: str(info.data.icon),
        subscribersCount: Number(info.data.subscribers_count) || 0,
        // `sender.name` e obligatoriu la fiecare mesaj, max 28 de caractere.
        senderName: (str(config.senderName) ?? name ?? "Echipa").slice(0, 28),
      },
    };
  },

  async disconnect(ctx) {
    await call(ctx, "set_webhook", { url: "" });
  },

  verifyWebhook(req, ctx) {
    const sig = req.headers["x-viber-content-signature"];
    if (!ctx.creds.authToken || !sig) return false;
    return safeEqual(sig.toLowerCase(), hmacSha256Hex(ctx.creds.authToken, req.rawBody));
  },

  decodeBody: decodeViberBody,

  parseWebhook(payload) {
    const p = obj(payload);
    const event = str(p.event);
    const ts = new Date(Number(p.timestamp ?? Date.now()));
    const token = str(p.message_token);
    const events: NormalizedEvent[] = [];

    if (event === "message") {
      const sender = obj(p.sender);
      const m = obj(p.message);
      const id = str(sender.id);
      if (!id || !token) return events;
      const type = str(m.type) ?? "text";
      let kind = "text";
      let body = str(m.text);
      let media: CommMediaItem[] | null = null;
      let phone: string | null = null;
      if (type === "picture" || type === "video" || type === "file") {
        kind = type === "picture" ? "image" : type === "video" ? "video" : "document";
        // URL-urile media Viber expiră după o oră — le păstrăm, dar interfața avertizează.
        media = [{ type: kind, url: str(m.media), name: str(m.file_name), size: Number(m.file_size ?? m.size) || null }];
      } else if (type === "contact") {
        const c = obj(m.contact);
        kind = "contact";
        body = `👤 ${str(c.name) ?? ""} ${str(c.phone_number) ?? ""}`.trim();
        // Butonul „share-phone" trimite numărul propriu; altfel e un contact oarecare.
        if (str(m.text) === "phone" || str(p.tracking_data) === "share-phone") phone = str(c.phone_number);
      } else if (type === "location") {
        const l = obj(m.location);
        kind = "location";
        body = `📍 ${l.lat}, ${l.lon}`;
      } else if (type === "sticker") {
        kind = "sticker";
        body = "[sticker]";
      } else if (type === "url") {
        body = str(m.media) ?? body;
      }
      events.push({
        type: "message",
        externalUserId: id,
        displayName: str(sender.name),
        avatarUrl: str(sender.avatar),
        phone: phone ? (phone.startsWith("+") ? phone : `+${phone}`) : null,
        externalId: token,
        kind,
        body,
        media,
        timestamp: ts,
        meta: { trackingData: str(m.tracking_data), country: str(sender.country), language: str(sender.language) },
      });
    } else if (event === "conversation_started" || event === "subscribed") {
      const user = obj(p.user);
      const id = str(user.id);
      if (id) {
        events.push({
          type: "contact",
          externalUserId: id,
          displayName: str(user.name),
          avatarUrl: str(user.avatar),
          startPayload: str(p.context),
        });
        if (event === "subscribed") events.push({ type: "blocked", externalUserId: id, blocked: false });
      }
    } else if (event === "unsubscribed") {
      const id = str(p.user_id);
      if (id) events.push({ type: "blocked", externalUserId: id, blocked: true });
    } else if ((event === "delivered" || event === "seen" || event === "failed") && token) {
      events.push({
        type: "status",
        externalId: token,
        status: event === "seen" ? "read" : event,
        errorMessage: event === "failed" ? str(p.desc) : null,
        timestamp: ts,
      });
    }
    // `webhook` (verificarea de la set_webhook) nu produce evenimente — doar 200.
    return events;
  },

  async send(ctx, msg: OutboundMessage): Promise<SendResult> {
    const sender = { name: (str(ctx.config.senderName) ?? str(ctx.config.botName) ?? "Echipa").slice(0, 28) };
    let body: Record<string, unknown>;
    if (msg.media?.type === "image") {
      body = { type: "picture", media: msg.media.url, text: (msg.text ?? "").slice(0, 768) };
    } else if (msg.media) {
      // Viber cere mărimea fișierului; fără ea (link extern) trimitem linkul ca text.
      body = { type: "url", media: msg.media.url };
    } else {
      body = { type: "text", text: (msg.text ?? "").slice(0, 7000) };
    }
    const r = await call(ctx, "send_message", { receiver: msg.to, min_api_version: 1, sender, ...body });
    if (!r.ok) {
      return { ok: false, errorCode: String(r.status), errorMessage: statusMessage(r.status, r.data.status_message) };
    }
    return { ok: true, externalId: str(r.data.message_token), meta: { billingStatus: r.data.billing_status ?? null } };
  },

  async fetchMedia(ctx, url) {
    // La Viber `providerFileId` lipsește; media are URL direct, valabil o oră.
    const res = await ctx.fetch(url);
    if (!res.ok) throw new CommsError("media_unavailable", "Fișierul Viber a expirat (linkurile sunt valabile o oră).", 404);
    return { body: await res.arrayBuffer(), mime: res.headers.get("content-type") };
  },
};
