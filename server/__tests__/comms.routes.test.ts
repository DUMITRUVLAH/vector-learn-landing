/**
 * @vitest-environment node
 *
 * COMMS-301 — modulul de comunicare, cap-coadă, pe migrările reale (PGlite).
 *
 * Testează ACȚIUNEA, nu butonul (CLAUDE.md §3.5.1quater): fiecare ruta e chemată cu date
 * realiste, iar furnizorii sunt un `fetch` fals care înregistrează exact ce le-am fi trimis.
 *
 * Ce se blochează:
 *  - un webhook nesemnat nu scrie nimic; unul semnat creează lead + conversație + mesaj + urmă în
 *    cronologia leadului, iar re-livrarea lui nu dublează nimic;
 *  - răspunsul din inbox pleacă la furnizor cu destinatarul corect;
 *  - fereastra de 24h WhatsApp, botul blocat, consimțământul retras opresc trimiterea ÎNAINTE de furnizor;
 *  - deep link-ul semnat leagă omul de leadul corect;
 *  - un workspace nu vede și nu fură canalele/conversațiile altuia;
 *  - secretele nu apar niciodată în răspunsuri.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions, commChannels, commContacts, commConversations, commMessages, commWebhookEvents } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let anaId: string;
let boId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string; name: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", currentUser);
    await next();
  },
}));

// Distribuirea și automatizările au testele lor; aici nu trebuie să schimbe responsabilul.
vi.mock("../routes/crmAssignment", () => ({ assignLeadAutomatically: async () => null }));
vi.mock("../routes/crmAutomations", () => ({ runAutomations: async () => undefined }));

import { Hono } from "hono";
import { __setProviderFetch } from "../lib/comms/channelStore";
import { leadLinkPayload } from "../lib/comms/deepLink";
let app: Hono;

// ─── furnizori falși ─────────────────────────────────────────────────────────

type Call = { url: string; json: Record<string, unknown> | null; headers: Record<string, string> };
let calls: Call[] = [];
let responder: (url: string, json: Record<string, unknown> | null) => { status?: number; body: unknown } = () => ({ body: {} });

function installFetch() {
  __setProviderFetch(async (url, init) => {
    let json: Record<string, unknown> | null = null;
    try {
      json = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    calls.push({ url, json, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = responder(url, json);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  });
}

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

async function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { text };
  }
  return { status: res.status, body: json, text };
}

const TG_TOKEN = "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

async function connectTelegram(botId = 7000000001): Promise<{ id: string; webhookUrl: string; secret: string }> {
  responder = (url) => {
    if (url.endsWith("/getMe")) return { body: { ok: true, result: { id: botId, is_bot: true, first_name: "Acme", username: "acme_bot" } } };
    if (url.endsWith("/setWebhook")) return { body: { ok: true, result: true } };
    return { body: { ok: true, result: { message_id: 999 } } };
  };
  const r = await req("POST", "/api/comms/channels", { kind: "telegram", name: "Telegram vânzări", credentials: { botToken: TG_TOKEN } });
  expect(r.status).toBe(201);
  const ch = r.body.channel as { id: string; webhookUrl: string };
  const secret = ch.webhookUrl.split("/").pop()!;
  return { id: ch.id, webhookUrl: ch.webhookUrl, secret };
}

function tgUpdate(updateId: number, text: string, from = { id: 123456789, first_name: "Maria", last_name: "Pop" }) {
  return { update_id: updateId, message: { message_id: updateId, date: Math.floor(Date.now() / 1000), from, chat: { id: from.id, type: "private" }, text } };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { commsChannelsRoutes } = await import("../routes/commsChannels");
  const { commsInboxRoutes } = await import("../routes/commsInbox");
  const { commsWebhooksRoutes } = await import("../routes/commsWebhooks");
  app = new Hono();
  app.route("/api/comms/webhooks", commsWebhooksRoutes);
  app.route("/api/comms/channels", commsChannelsRoutes);
  app.route("/api/comms/inbox", commsInboxRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-omni" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-omni" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;
  const [ana] = await testDb.insert(users).values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana Pop", role: "admin" }).returning();
  const [bo] = await testDb.insert(users).values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo Rusu", role: "admin" }).returning();
  anaId = ana.id;
  boId = bo.id;
  installFetch();
}, 240_000);

afterAll(async () => {
  __setProviderFetch(null);
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(commWebhookEvents);
  await testDb.delete(commMessages);
  await testDb.delete(commConversations);
  await testDb.delete(commContacts);
  await testDb.delete(commChannels);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  currentUser = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@alfa.md", name: "Ana Pop" };
  calls = [];
});

// ─── Telegram cap-coadă ──────────────────────────────────────────────────────

describe("Telegram: conectare → mesaj primit → răspuns", () => {
  it("[blocant] conectarea validează tokenul, setează webhook-ul cu secret și NU întoarce tokenul", async () => {
    const ch = await connectTelegram();
    const setHook = calls.find((c) => c.url.endsWith("/setWebhook"))!;
    expect(setHook.json).toMatchObject({ url: ch.webhookUrl, secret_token: ch.secret });
    const list = await req("GET", "/api/comms/channels");
    expect(JSON.stringify(list.body)).not.toContain(TG_TOKEN);
    expect(JSON.stringify(list.body)).not.toContain("credentialsEnc");
    const [row] = await testDb.select().from(commChannels).where(eq(commChannels.id, ch.id));
    expect(row.credentialsEnc).not.toContain(TG_TOKEN); // criptat, nu text
    expect(row).toMatchObject({ status: "active", externalId: "7000000001" });
  });

  it("[blocant] webhook fără antetul secret → 401 și nimic scris", async () => {
    const ch = await connectTelegram();
    const r = await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(1, "salut"));
    expect(r.status).toBe(401);
    expect(await testDb.select().from(commMessages)).toHaveLength(0);
    const r2 = await req("POST", `/api/comms/webhooks/telegram/${"0".repeat(48)}`, tgUpdate(1, "salut"), { "x-telegram-bot-api-secret-token": ch.secret });
    expect(r2.status).toBe(404);
  });

  it("[blocant] mesaj primit → lead nou + conversație + urmă în cronologie; re-livrarea nu dublează", async () => {
    const ch = await connectTelegram();
    const h = { "x-telegram-bot-api-secret-token": ch.secret };
    expect((await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(10, "Aveți locuri la curs?"), h)).status).toBe(200);
    expect((await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(10, "Aveți locuri la curs?"), h)).status).toBe(200);

    const allLeads = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(allLeads).toHaveLength(1);
    expect(allLeads[0].fullName).toBe("Maria Pop");
    expect(await testDb.select().from(commMessages)).toHaveLength(1);
    const inter = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, allLeads[0].id));
    expect(inter).toHaveLength(1);
    expect(inter[0]).toMatchObject({ type: "telegram", direction: "inbound", body: "Aveți locuri la curs?" });

    const list = await req("GET", "/api/comms/inbox/conversations");
    const items = list.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ channelKind: "telegram", unreadCount: 1, leadName: "Maria Pop", lastMessagePreview: "Aveți locuri la curs?" });
  });

  it("[blocant] răspunsul din inbox pleacă la Telegram cu chat_id-ul omului și intră în cronologie", async () => {
    const ch = await connectTelegram();
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(20, "Bună"), { "x-telegram-bot-api-secret-token": ch.secret });
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    calls = [];
    responder = () => ({ body: { ok: true, result: { message_id: 21 } } });
    const r = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Da, avem locuri!" });
    expect(r.status).toBe(201);
    expect(r.body.message).toMatchObject({ status: "sent", externalId: "21", direction: "outbound" });
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`);
    expect(calls[0].json).toMatchObject({ chat_id: "123456789", text: "Da, avem locuri!" });
    const detail = await req("GET", `/api/comms/inbox/conversations/${convId}`);
    expect((detail.body.messages as unknown[]).length).toBe(2);
    const out = await testDb.select().from(leadInteractions).where(eq(leadInteractions.direction, "outbound"));
    expect(out[0]).toMatchObject({ type: "telegram", userId: anaId });
  });

  it("un eșec la furnizor rămâne în conversație ca „failed”, cu motivul", async () => {
    const ch = await connectTelegram();
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(30, "x"), { "x-telegram-bot-api-secret-token": ch.secret });
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    responder = () => ({ status: 403, body: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } });
    const r = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Hei" });
    expect(r.status).toBe(201);
    expect(r.body.message).toMatchObject({ status: "failed", errorCode: "403" });
  });

  it("[blocant] omul blochează botul → trimiterea e oprită ÎNAINTE de furnizor", async () => {
    const ch = await connectTelegram();
    const h = { "x-telegram-bot-api-secret-token": ch.secret };
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(40, "x"), h);
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, { update_id: 41, my_chat_member: { chat: { id: 123456789, type: "private" }, new_chat_member: { status: "kicked" } } }, h);
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    calls = [];
    const r = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Hei" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("blocked");
    expect(calls).toHaveLength(0);
  });

  it("[blocant] deep link semnat /start → omul se leagă de leadul EXISTENT, nu se creează altul", async () => {
    const [lead] = await testDb.insert(leads).values({ tenantId: tenantA, fullName: "Ion Existent", stage: "new" }).returning();
    const ch = await connectTelegram();
    const payload = leadLinkPayload(tenantA, lead.id);
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(50, `/start ${payload}`, { id: 555, first_name: "Ionel" }), {
      "x-telegram-bot-api-secret-token": ch.secret,
    });
    const all = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(all).toHaveLength(1);
    const [contact] = await testDb.select().from(commContacts);
    expect(contact.leadId).toBe(lead.id);
  });

  it("[blocant] consimțământ retras → nicio trimitere", async () => {
    const ch = await connectTelegram();
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(60, "x"), { "x-telegram-bot-api-secret-token": ch.secret });
    await testDb.update(leads).set({ consentRevokedAt: new Date() });
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    calls = [];
    const r = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Ofertă" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("consent_revoked");
    expect(calls).toHaveLength(0);
  });
});

// ─── WhatsApp ────────────────────────────────────────────────────────────────

describe("WhatsApp: semnătură, potrivire după telefon, statusuri, fereastra de 24h", () => {
  const APP_SECRET = "meta-app-secret";

  async function connectWhatsapp() {
    responder = (url) =>
      url.includes("?fields=") ? { body: { display_phone_number: "+373 60 111 222", verified_name: "Alfa SRL", quality_rating: "GREEN" } } : { body: { messages: [{ id: `wamid.OUT${calls.length}` }] } };
    const r = await req("POST", "/api/comms/channels", {
      kind: "whatsapp",
      name: "WhatsApp",
      credentials: { accessToken: "EAAtok", phoneNumberId: "106540352242922", wabaId: "WABA1", appSecret: APP_SECRET },
    });
    expect(r.status).toBe(201);
    const ch = r.body.channel as { id: string; webhookUrl: string; verifyToken: string };
    expect((r.body.manualSteps as string[]).length).toBeGreaterThan(0);
    return { ...ch, secret: ch.webhookUrl.split("/").pop()! };
  }

  function waPayload(id: string, from: string, text: string, ts = Math.floor(Date.now() / 1000)) {
    return JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "37360111222", phone_number_id: "106540352242922" },
                contacts: [{ profile: { name: "Client WA" }, wa_id: from }],
                messages: [{ from, id, timestamp: String(ts), type: "text", text: { body: text } }],
              },
            },
          ],
        },
      ],
    });
  }
  const sign = (raw: string) => ({ "x-hub-signature-256": `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}` });

  it("[blocant] handshake-ul Meta întoarce hub.challenge doar cu verify_token corect", async () => {
    const ch = await connectWhatsapp();
    const ok = await app.request(`/api/comms/webhooks/whatsapp/${ch.secret}?hub.mode=subscribe&hub.verify_token=${ch.verifyToken}&hub.challenge=12345`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await app.request(`/api/comms/webhooks/whatsapp/${ch.secret}?hub.mode=subscribe&hub.verify_token=gresit&hub.challenge=1`);
    expect(bad.status).toBe(403);
  });

  it("[blocant] mesaj semnat de la un număr cunoscut → se lipește de leadul existent (ultimele 8 cifre)", async () => {
    const [lead] = await testDb
      .insert(leads)
      .values({ tenantId: tenantA, fullName: "Vasile", stage: "new", phone: "060 111 333", phoneNormalized: "60111333" })
      .returning();
    const ch = await connectWhatsapp();
    const raw = waPayload("wamid.IN1", "37360111333", "Vreau oferta");
    expect((await req("POST", `/api/comms/webhooks/whatsapp/${ch.secret}`, raw, { "x-hub-signature-256": "sha256=deadbeef" })).status).toBe(401);
    expect((await req("POST", `/api/comms/webhooks/whatsapp/${ch.secret}`, raw, sign(raw))).status).toBe(200);
    expect(await testDb.select().from(leads).where(eq(leads.tenantId, tenantA))).toHaveLength(1);
    const [conv] = await testDb.select().from(commConversations);
    expect(conv.leadId).toBe(lead.id);
    const [evRow] = await testDb.select().from(commWebhookEvents).where(eq(commWebhookEvents.signatureOk, true));
    expect(evRow.processedAt).not.toBeNull();
  });

  it("[blocant] în fereastră: text liber pleacă cu „+”; statusurile doar înaintează (read nu coboară la delivered)", async () => {
    const ch = await connectWhatsapp();
    const raw = waPayload("wamid.IN2", "40722000111", "Salut");
    await req("POST", `/api/comms/webhooks/whatsapp/${ch.secret}`, raw, sign(raw));
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    calls = [];
    responder = () => ({ body: { messages: [{ id: "wamid.REPLY" }] } });
    const sent = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Bună ziua!" });
    expect(sent.status).toBe(201);
    expect(calls[0].json).toMatchObject({ to: "+40722000111", type: "text" });

    const status = (s: string) =>
      JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "106540352242922" }, statuses: [{ id: "wamid.REPLY", status: s, timestamp: "1790000000" }] } }] }] });
    for (const s of ["read", "delivered"]) {
      const b = status(s);
      await req("POST", `/api/comms/webhooks/whatsapp/${ch.secret}`, b, sign(b));
    }
    const [m] = await testDb.select().from(commMessages).where(eq(commMessages.externalId, "wamid.REPLY"));
    expect(m.status).toBe("read");
  });

  it("[blocant] după 24h: text liber refuzat cu window_closed (fără apel la Meta); template-ul trece", async () => {
    const ch = await connectWhatsapp();
    const old = Math.floor(Date.now() / 1000) - 26 * 3600;
    const raw = waPayload("wamid.IN3", "40722000222", "Salut", old);
    await req("POST", `/api/comms/webhooks/whatsapp/${ch.secret}`, raw, sign(raw));
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    const detail = await req("GET", `/api/comms/inbox/conversations/${convId}`);
    expect(detail.body.compose).toMatchObject({ needsTemplate: true, canSendFreeform: false });
    calls = [];
    const r = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Revin" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("window_closed");
    expect(calls).toHaveLength(0);
    responder = () => ({ body: { messages: [{ id: "wamid.TPL" }] } });
    const t = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { template: { name: "salut_revenire", language: "ro", params: ["Ion", "oferta"] } });
    expect(t.status).toBe(201);
    expect(calls[0].json).toMatchObject({ type: "template", template: { name: "salut_revenire" } });
  });

  it("scrierea din fișa leadului: WhatsApp pornește cu template spre telefonul leadului", async () => {
    const [lead] = await testDb.insert(leads).values({ tenantId: tenantA, fullName: "Nou", stage: "new", phone: "+373 69 123 456" }).returning();
    const ch = await connectWhatsapp();
    const info = await req("GET", `/api/comms/inbox/leads/${lead.id}`);
    expect((info.body.channels as Array<{ canStart: boolean }>)[0].canStart).toBe(true);
    const noTpl = await req("POST", "/api/comms/inbox/start", { leadId: lead.id, channelId: ch.id, text: "Salut" });
    expect(noTpl.status).toBe(409); // n-a scris niciodată → fereastra e închisă
    calls = [];
    responder = () => ({ body: { messages: [{ id: "wamid.START" }] } });
    const ok = await req("POST", "/api/comms/inbox/start", { leadId: lead.id, channelId: ch.id, template: { name: "salut_revenire", language: "ro", params: [] } });
    expect(ok.status).toBe(201);
    expect(calls[0].json).toMatchObject({ to: "+37369123456" });
  });
});

// ─── Viber ───────────────────────────────────────────────────────────────────

describe("Viber", () => {
  const TOKEN = "4453b6ac12345678-e02c5f12174805f9-daec9cbb5448c51f";

  it("[blocant] set_webhook e verificat de Viber în timpul conectării; mesajul semnat intră, token-ul de 64 biți rămâne exact", async () => {
    let verifyStatus = 0;
    responder = (url) => {
      if (url.endsWith("/get_account_info")) return { body: { status: 0, id: "pa:123", uri: "alfabot", name: "Alfa Bot", subscribers_count: 3 } };
      if (url.endsWith("/set_webhook")) return { body: { status: 0, status_message: "ok" } };
      return { body: '{"status":0,"message_token":5741311803571721087}' };
    };
    const r = await req("POST", "/api/comms/channels", { kind: "viber", name: "Viber", credentials: { authToken: TOKEN } });
    expect(r.status).toBe(201);
    const ch = r.body.channel as { webhookUrl: string; config: Record<string, unknown> };
    expect(ch.config).toMatchObject({ botUri: "alfabot", senderName: "Alfa Bot" });
    const secret = ch.webhookUrl.split("/").pop()!;

    // verificarea Viber de la set_webhook
    verifyStatus = (await req("POST", `/api/comms/webhooks/viber/${secret}`, '{"event":"webhook","timestamp":1,"message_token":1}')).status;
    expect(verifyStatus).toBe(200);

    const raw =
      '{"event":"message","timestamp":1457764197627,"message_token":4912661846655238145,"sender":{"id":"01234567890A=","name":"John"},"message":{"type":"text","text":"Salut"}}';
    const sig = createHmac("sha256", TOKEN).update(raw).digest("hex");
    expect((await req("POST", `/api/comms/webhooks/viber/${secret}`, raw, { "x-viber-content-signature": "0".repeat(64) })).status).toBe(401);
    expect((await req("POST", `/api/comms/webhooks/viber/${secret}`, raw, { "x-viber-content-signature": sig })).status).toBe(200);
    const [m] = await testDb.select().from(commMessages);
    expect(m.externalId).toBe("4912661846655238145");

    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;
    calls = [];
    const sent = await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "Bună!" });
    expect(sent.body.message).toMatchObject({ status: "sent", externalId: "5741311803571721087" });
    expect(calls[0].json).toMatchObject({ receiver: "01234567890A=", sender: { name: "Alfa Bot" } });
  });
});

// ─── Gmail (canal simulat) ───────────────────────────────────────────────────

describe("Gmail: în CRM intră doar ce ține de un lead", () => {
  it("[blocant] emailul de la un străin NU se stochează; cel de la un lead intră în conversație", async () => {
    await testDb.insert(leads).values({ tenantId: tenantA, fullName: "Client", stage: "new", email: "client@firma.md", emailNormalized: "client@firma.md" });
    const r = await req("POST", "/api/comms/channels", { kind: "whatsapp", name: "x", credentials: {}, mock: true });
    expect(r.status).toBe(201); // mock permis în teste
    const [gm] = await testDb
      .insert(commChannels)
      .values({ tenantId: tenantA, kind: "gmail", name: "Gmail Ana", status: "active", externalId: "ana@alfa.md", config: { mock: true, email: "ana@alfa.md" }, webhookSecret: "a".repeat(48), connectedBy: anaId })
      .returning();
    const s1 = await req("POST", `/api/comms/channels/${gm.id}/simulate`, { from: "newsletter@magazin.md", text: "Reduceri!", subject: "Promo" });
    expect((s1.body.result as { skipped: number }).skipped).toBe(1);
    expect(await testDb.select().from(commContacts).where(eq(commContacts.channelId, gm.id))).toHaveLength(0);
    const s2 = await req("POST", `/api/comms/channels/${gm.id}/simulate`, { from: "Client@Firma.md", text: "Accept oferta", subject: "Re: Ofertă" });
    expect((s2.body.result as { messages: number }).messages).toBe(1);
    const inter = await testDb.select().from(leadInteractions);
    expect(inter[0]).toMatchObject({ type: "email", direction: "inbound" });
  });
});

// ─── izolarea ────────────────────────────────────────────────────────────────

describe("izolarea între workspace-uri", () => {
  it("[blocant] alt workspace nu vede conversația, nu scrie în ea și nu vede canalul", async () => {
    const ch = await connectTelegram();
    await req("POST", `/api/comms/webhooks/telegram/${ch.secret}`, tgUpdate(70, "secret de afaceri"), { "x-telegram-bot-api-secret-token": ch.secret });
    const convId = ((await req("GET", "/api/comms/inbox/conversations")).body.items as Array<{ id: string }>)[0].id;

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md", name: "Bo" };
    expect(((await req("GET", "/api/comms/inbox/conversations")).body.items as unknown[]).length).toBe(0);
    expect((await req("GET", `/api/comms/inbox/conversations/${convId}`)).status).toBe(404);
    calls = [];
    expect((await req("POST", `/api/comms/inbox/conversations/${convId}/messages`, { text: "furat" })).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(((await req("GET", "/api/comms/channels")).body.channels as unknown[]).length).toBe(0);
    expect((await req("DELETE", `/api/comms/channels/${ch.id}`)).status).toBe(404);
  });

  it("[blocant] același bot în alt workspace → 409 și webhook-ul primului NU e mutat", async () => {
    await connectTelegram(7000000001);
    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md", name: "Bo" };
    calls = [];
    responder = (url) =>
      url.endsWith("/getMe") ? { body: { ok: true, result: { id: 7000000001, username: "acme_bot" } } } : { body: { ok: true, result: true } };
    const r = await req("POST", "/api/comms/channels", { kind: "telegram", name: "Hoț", credentials: { botToken: TG_TOKEN } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("already_connected");
    expect(calls.some((c) => c.url.endsWith("/setWebhook"))).toBe(false);
  });

  it("un agent fără dreptul comms.manage nu poate conecta canale", async () => {
    currentUser = { ...currentUser, role: "teacher" };
    const r = await req("POST", "/api/comms/channels", { kind: "telegram", name: "x", credentials: { botToken: TG_TOKEN } });
    expect(r.status).toBe(403);
  });
});
