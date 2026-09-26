/**
 * COMMS-301 — webhook-urile PUBLICE ale canalelor de mesaje. Montat la /api/comms/webhooks.
 *
 * Fără sesiune: aici bat serverele Meta, Telegram, Viber și Google Pub/Sub. Apărarea are două
 * straturi și AMBELE sunt obligatorii (CLAUDE.md §3.5.1 — ce nu se poate verifica, se refuză):
 *   1. segmentul secret din URL (`/:kind/:secret`) — identifică canalul; necunoscut → 404;
 *   2. semnătura furnizorului (HMAC Meta/Viber, antetul secret Telegram, OIDC Pub/Sub) → altfel 401.
 *
 * Procesarea e idempotentă (index unic pe id-ul mesajului la furnizor), deci o re-livrare nu
 * dublează nimic. O eroare de bază de date întoarce 500 ca furnizorul să reîncerce; o cerere
 * nesemnată nu e reîncercată de nimeni legitim.
 *
 *   GET  /whatsapp/:secret     handshake Meta (hub.challenge) — per canal
 *   GET  /whatsapp             handshake Meta — aplicația platformei (Embedded Signup)
 *   POST /whatsapp/:secret     mesaje + statusuri (semnătură cu App Secret-ul canalului)
 *   POST /whatsapp             mesaje + statusuri pentru toate numerele aplicației platformei
 *   POST /telegram/:secret     update-uri Telegram
 *   POST /viber/:secret        callback-uri Viber
 *   POST /gmail                notificări Pub/Sub (users.watch)
 */
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { commChannels, commWebhookEvents, type CommChannel } from "../db/schema/comms";
import { getAdapter } from "../lib/comms/registry";
import { adapterContext } from "../lib/comms/channelStore";
import { ingestEvents } from "../lib/comms/ingest";
import { whatsappAdapter } from "../lib/comms/adapters/whatsapp";
import { gmailChannelsForEmail, syncGmailChannel, verifyPubsubRequest } from "../lib/comms/gmailService";
import { arr, hmacSha256Hex, obj, safeEqual, str } from "../lib/comms/util";
import type { NormalizedEvent } from "../lib/comms/types";

export const commsWebhooksRoutes = new Hono();

/** Payload-ul se păstrează pentru depanare, dar nu nelimitat (un webhook WA poate avea 3 MB). */
function storablePayload(raw: string): unknown {
  if (raw.length > 64_000) return { truncated: true, size: raw.length };
  try {
    return JSON.parse(raw);
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}

async function logEvent(channelId: string | null, kind: string, signatureOk: boolean, raw: string, error?: string | null) {
  try {
    // O cerere nesemnată e a oricui: păstrăm doar mărimea, nu corpul — altfel un script anonim ar
    // umple baza cu câte 64 KB la fiecare POST.
    const payload = signatureOk ? storablePayload(raw) : { rejected: true, size: raw.length };
    const [row] = await db
      .insert(commWebhookEvents)
      .values({ channelId, kind, signatureOk, payload, error: error?.slice(0, 1000) ?? null })
      .returning({ id: commWebhookEvents.id });
    return row?.id ?? null;
  } catch {
    return null; // jurnalul nu are voie să oprească procesarea
  }
}

async function markProcessed(eventId: string | null, error?: string | null) {
  if (!eventId) return;
  try {
    await db
      .update(commWebhookEvents)
      .set({ processedAt: new Date(), error: error?.slice(0, 1000) ?? null })
      .where(eq(commWebhookEvents.id, eventId));
  } catch {
    // ignorat
  }
}

async function channelBySecret(kind: string, secret: string): Promise<CommChannel | null> {
  if (!/^[a-f0-9]{16,64}$/.test(secret)) return null;
  const [ch] = await db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.kind, kind), eq(commChannels.webhookSecret, secret)));
  return ch ?? null;
}

function headersOf(c: Context): Record<string, string | undefined> {
  return c.req.header() as Record<string, string | undefined>;
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

function handshake(c: Context, expected: string | null | undefined) {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge") ?? "";
  if (mode === "subscribe" && expected && safeEqual(token, expected)) return c.text(challenge, 200);
  return c.text("forbidden", 403);
}

commsWebhooksRoutes.get("/whatsapp/:secret", async (c) => {
  const ch = await channelBySecret("whatsapp", c.req.param("secret"));
  if (!ch) return c.text("not found", 404);
  return handshake(c, ch.webhookSecret);
});

commsWebhooksRoutes.get("/whatsapp", (c) => handshake(c, process.env.META_WEBHOOK_VERIFY_TOKEN));

/**
 * O aplicație Meta poate avea mai multe numere, iar un webhook poate grupa schimbări pentru
 * numere diferite. Împărțim pe `metadata.phone_number_id` și dăm fiecare parte canalului ei.
 */
async function processWhatsapp(
  payload: unknown,
  signedFor: CommChannel | null
): Promise<{ messages: number; unknownNumbers: string[] }> {
  const byNumber = new Map<string, unknown[]>();
  for (const entry of arr(obj(payload).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const pnid = str(obj(obj(obj(change).value).metadata).phone_number_id) ?? "";
      byNumber.set(pnid, [...(byNumber.get(pnid) ?? []), change]);
    }
  }
  let messages = 0;
  const unknownNumbers: string[] = [];
  for (const [pnid, changes] of byNumber) {
    let channel: CommChannel | null = null;
    if (signedFor) {
      // Ruta PER CANAL e semnată cu App Secret-ul ACESTUI canal, pe care l-a dat clientul (Meta nu
      // ni-l confirmă). O semnătură validă dovedește doar că cererea vine de la cine știe secretul
      // lui — deci ea poate atinge DOAR numărul lui. Altfel un workspace ar putea injecta mesaje
      // în conversațiile altuia punând în payload `phone_number_id`-ul victimei.
      channel = !pnid || pnid === signedFor.externalId ? signedFor : null;
    } else if (pnid) {
      // Ruta PLATFORMEI e semnată cu META_APP_SECRET-ul nostru: Meta trimite aici toate numerele
      // aplicației, deci rutăm după număr.
      const [ch] = await db
        .select()
        .from(commChannels)
        .where(and(eq(commChannels.kind, "whatsapp"), eq(commChannels.externalId, pnid)));
      channel = ch ?? null;
    }
    if (!channel || channel.status === "disabled") {
      if (pnid) unknownNumbers.push(pnid);
      continue;
    }
    const events = whatsappAdapter.parseWebhook({ entry: [{ changes }] });
    const r = await ingestEvents(channel, events);
    messages += r.messages;
  }
  return { messages, unknownNumbers };
}

commsWebhooksRoutes.post("/whatsapp/:secret", async (c) => {
  const ch = await channelBySecret("whatsapp", c.req.param("secret"));
  if (!ch) return c.text("not found", 404);
  const raw = await c.req.text();
  const ok = whatsappAdapter.verifyWebhook({ rawBody: raw, headers: headersOf(c) }, { ...adapterContext(ch), webhookSecret: ch.webhookSecret });
  const eventId = await logEvent(ch.id, "whatsapp", ok, raw, ok ? null : "semnătură invalidă");
  if (!ok) return c.text("invalid signature", 401);
  try {
    const r = await processWhatsapp(JSON.parse(raw), ch);
    await markProcessed(eventId, r.unknownNumbers.length ? `numere necunoscute: ${r.unknownNumbers.join(", ")}` : null);
    return c.text("ok", 200);
  } catch (err) {
    await markProcessed(eventId, err instanceof Error ? err.message : String(err));
    return c.text("error", 500);
  }
});

commsWebhooksRoutes.post("/whatsapp", async (c) => {
  const raw = await c.req.text();
  const secret = process.env.META_APP_SECRET;
  const header = c.req.header("x-hub-signature-256");
  const ok = Boolean(secret && header?.startsWith("sha256=") && safeEqual(header.slice(7), hmacSha256Hex(secret, raw)));
  const eventId = await logEvent(null, "whatsapp", ok, raw, ok ? null : "semnătură invalidă (aplicația platformei)");
  if (!ok) return c.text("invalid signature", 401);
  try {
    const r = await processWhatsapp(JSON.parse(raw), null);
    await markProcessed(eventId, r.unknownNumbers.length ? `numere necunoscute: ${r.unknownNumbers.join(", ")}` : null);
    return c.text("ok", 200);
  } catch (err) {
    await markProcessed(eventId, err instanceof Error ? err.message : String(err));
    return c.text("error", 500);
  }
});

// ─── Telegram + Viber (aceeași formă: canal din URL, semnătura adaptorului) ────

async function genericWebhook(c: Context, kind: "telegram" | "viber") {
  const ch = await channelBySecret(kind, c.req.param("secret") ?? "");
  if (!ch) return c.text("not found", 404);
  const raw = await c.req.text();
  const adapter = getAdapter(kind)!;

  // Viber verifică URL-ul la `set_webhook` cu {"event":"webhook"} și vrea 200 imediat. Nu produce
  // niciun efect, deci răspundem înainte de orice altceva (canalul poate fi încă „pending").
  if (kind === "viber" && /"event"\s*:\s*"webhook"/.test(raw.slice(0, 200))) return c.json({ status: 0 });

  const ok = adapter.verifyWebhook({ rawBody: raw, headers: headersOf(c) }, { ...adapterContext(ch), webhookSecret: ch.webhookSecret });
  const eventId = await logEvent(ch.id, kind, ok, raw, ok ? null : "semnătură invalidă");
  if (!ok) return c.text("invalid signature", 401);
  if (ch.status === "disabled") {
    await markProcessed(eventId, "canal dezactivat — ignorat");
    return c.text("ok", 200);
  }
  try {
    const payload = adapter.decodeBody ? adapter.decodeBody(raw) : JSON.parse(raw);
    const events: NormalizedEvent[] = adapter.parseWebhook(payload);
    await ingestEvents(ch, events);
    await markProcessed(eventId);
    return c.text("ok", 200);
  } catch (err) {
    await markProcessed(eventId, err instanceof Error ? err.message : String(err));
    return c.text("error", 500);
  }
}

commsWebhooksRoutes.post("/telegram/:secret", (c) => genericWebhook(c, "telegram"));
commsWebhooksRoutes.post("/viber/:secret", (c) => genericWebhook(c, "viber"));

// ─── Gmail (Pub/Sub push) ────────────────────────────────────────────────────

commsWebhooksRoutes.post("/gmail", async (c) => {
  const raw = await c.req.text();
  const ok = await verifyPubsubRequest(c.req.header("authorization"), c.req.query("token"));
  const eventId = await logEvent(null, "gmail", ok, raw, ok ? null : "push Pub/Sub neautentificat");
  if (!ok) return c.text("unauthorized", 401);
  let email: string | null = null;
  try {
    const data = str(obj(obj(JSON.parse(raw)).message).data);
    if (data) email = str(obj(JSON.parse(Buffer.from(data, "base64").toString("utf8"))).emailAddress);
  } catch {
    email = null;
  }
  if (!email) {
    await markProcessed(eventId, "fără emailAddress în notificare");
    return c.body(null, 204);
  }
  const channels = await gmailChannelsForEmail(email);
  const errors: string[] = [];
  for (const ch of channels) {
    if (ch.status === "disabled") continue;
    // Gmail trimite max ~1 notificare/s per cutie; o rafală (sau un push fals, dar semnat) nu are
    // voie să ardă cota Gmail a omului. Cronul și deschiderea inboxului prind oricum restul.
    const last = Date.parse(String((ch.config as Record<string, unknown>)?.lastSyncAt ?? "")) || 0;
    if (Date.now() - last < 20_000) continue;
    try {
      await syncGmailChannel(ch.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  // 2xx chiar și la eroare de sincronizare: un token revocat ar face Pub/Sub să reîncerce la
  // nesfârșit. Eroarea rămâne pe canal (last_error) și în jurnal; cronul re-sincronizează.
  await markProcessed(eventId, errors.length ? errors.join("; ") : channels.length ? null : `nicio cutie conectată pentru ${email}`);
  return c.body(null, 204);
});
