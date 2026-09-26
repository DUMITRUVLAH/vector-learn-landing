/**
 * @vitest-environment node
 *
 * COMMS-301 — adaptoarele de canal, fără rețea și fără bază de date.
 *
 * Ce se blochează aici, pe fiecare furnizor, e exact ce documentația oficială cere și ce ar
 * rupe integrarea în tăcere dacă s-ar schimba: formatul semnăturii, forma cererii de trimitere,
 * câmpurile din care citim omul și mesajul. Fixture-urile sunt copiate după exemplele oficiale.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { whatsappAdapter } from "../adapters/whatsapp";
import { telegramAdapter } from "../adapters/telegram";
import { viberAdapter, decodeViberBody } from "../adapters/viber";
import { buildMime, gmailMessageToEvent, stripQuoted, parseAddress, base64url, fromBase64url } from "../adapters/gmail";
import { leadLinkPayload, parseLeadLinkPayload, telegramDeepLink } from "../deepLink";
import { sendRestrictions, windowOpen } from "../rules";
import type { FetchLike } from "../types";

/** fetch fals care înregistrează cererile și răspunde din coadă. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit; json: Record<string, unknown> | null }> = [];
  const f: FetchLike = async (url, init) => {
    let json: Record<string, unknown> | null = null;
    try {
      json = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    calls.push({ url, init, json });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { f, calls };
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

describe("WhatsApp Cloud API", () => {
  const creds = { accessToken: "EAAtoken", phoneNumberId: "106540352242922", appSecret: "app-secret" };
  const ctx = { creds, config: {}, webhookSecret: "x" };

  it("[blocant] acceptă doar X-Hub-Signature-256 = HMAC-SHA256(App Secret, corpul brut)", () => {
    const raw = '{"object":"whatsapp_business_account","entry":[]}';
    const sig = createHmac("sha256", "app-secret").update(raw).digest("hex");
    const f = fakeFetch([]).f;
    expect(whatsappAdapter.verifyWebhook({ rawBody: raw, headers: { "x-hub-signature-256": `sha256=${sig}` } }, { ...ctx, fetch: f })).toBe(true);
    // corp re-serializat (alt spațiu) → semnătura nu mai trece
    expect(whatsappAdapter.verifyWebhook({ rawBody: raw.replace(",", ", "), headers: { "x-hub-signature-256": `sha256=${sig}` } }, { ...ctx, fetch: f })).toBe(false);
    expect(whatsappAdapter.verifyWebhook({ rawBody: raw, headers: {} }, { ...ctx, fetch: f })).toBe(false);
  });

  it("[blocant] fără App Secret NU acceptă nimic (nu „sare verificarea”)", () => {
    const prev = process.env.META_APP_SECRET;
    delete process.env.META_APP_SECRET;
    const raw = "{}";
    const sig = createHmac("sha256", "").update(raw).digest("hex");
    expect(
      whatsappAdapter.verifyWebhook(
        { rawBody: raw, headers: { "x-hub-signature-256": `sha256=${sig}` } },
        { creds: { accessToken: "t", phoneNumberId: "1" }, config: {}, webhookSecret: "x", fetch: fakeFetch([]).f }
      )
    ).toBe(false);
    if (prev) process.env.META_APP_SECRET = prev;
  });

  it("parsează mesajul primit (exemplul oficial) și statusul eșuat", () => {
    const events = whatsappAdapter.parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15550783881", phone_number_id: "106540352242922" },
                contacts: [{ profile: { name: "Sheena Nelson" }, wa_id: "16505551234", user_id: "US.13491208655302741918" }],
                messages: [
                  {
                    from: "16505551234",
                    from_user_id: "US.13491208655302741918",
                    id: "wamid.HBgL1",
                    timestamp: "1749416383",
                    type: "text",
                    text: { body: "Does it come in another color?" },
                  },
                ],
                statuses: [
                  {
                    id: "wamid.OUT1",
                    status: "failed",
                    timestamp: "1751142888",
                    recipient_id: "16505551234",
                    errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours" } }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0]).toMatchObject({
      type: "message",
      externalUserId: "16505551234",
      displayName: "Sheena Nelson",
      phone: "+16505551234",
      externalId: "wamid.HBgL1",
      body: "Does it come in another color?",
    });
    expect((events[0] as { timestamp: Date }).timestamp.toISOString()).toBe(new Date(1749416383000).toISOString());
    expect(events[1]).toMatchObject({ type: "status", externalId: "wamid.OUT1", status: "failed", errorCode: "131047", errorMessage: "More than 24 hours" });
  });

  it("utilizator cu username (fără wa_id) → identificat după BSUID", () => {
    const [ev] = whatsappAdapter.parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1" },
                contacts: [{ profile: { name: "Anon" }, user_id: "US.999", username: "anon" }],
                messages: [{ from_user_id: "US.999", id: "wamid.2", timestamp: "1", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    });
    expect(ev).toMatchObject({ externalUserId: "US.999", phone: null, username: "anon" });
  });

  it("[blocant] trimite numărul CU „+” (Meta: fără + se prefixează țara firmei) și BSUID prin `recipient`", async () => {
    const { f, calls } = fakeFetch([
      { body: { messages: [{ id: "wamid.OUT" }] } },
      { body: { messages: [{ id: "wamid.OUT2" }] } },
    ]);
    const r = await whatsappAdapter.send({ creds, config: {}, fetch: f }, { to: "37360000000", text: "Salut", replyToExternalId: "wamid.IN" });
    expect(r).toMatchObject({ ok: true, externalId: "wamid.OUT" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v25.0/106540352242922/messages");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer EAAtoken");
    expect(calls[0].json).toMatchObject({
      messaging_product: "whatsapp",
      to: "+37360000000",
      type: "text",
      text: { body: "Salut" },
      context: { message_id: "wamid.IN" },
    });
    await whatsappAdapter.send({ creds, config: {}, fetch: f }, { to: "US.999", text: "x" });
    expect(calls[1].json).toMatchObject({ recipient: "US.999" });
    expect(calls[1].json).not.toHaveProperty("to");
  });

  it("template cu parametri → components[body].parameters", async () => {
    const { f, calls } = fakeFetch([{ body: { messages: [{ id: "w" }] } }]);
    await whatsappAdapter.send({ creds, config: {}, fetch: f }, { to: "40700000000", template: { name: "salut_revenire", language: "ro", params: ["Ion", "panouri"] } });
    expect(calls[0].json).toMatchObject({
      type: "template",
      template: {
        name: "salut_revenire",
        language: { code: "ro" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Ion" }, { type: "text", text: "panouri" }] }],
      },
    });
  });

  it("eroarea Meta ajunge în rezultat cu codul ei", async () => {
    const { f } = fakeFetch([{ status: 400, body: { error: { code: 131047, message: "Re-engagement", error_data: { details: "24h" } } } }]);
    const r = await whatsappAdapter.send({ creds, config: {}, fetch: f }, { to: "40700000000", text: "x" });
    expect(r).toMatchObject({ ok: false, errorCode: "131047", errorMessage: "24h" });
  });
});

// ─── Telegram ────────────────────────────────────────────────────────────────

describe("Telegram Bot API", () => {
  const creds = { botToken: "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" };

  it("[blocant] webhook-ul e autentic doar cu secretul din ANTET (nu cel din URL)", () => {
    const base = { creds: { ...creds, headerSecret: "hdr-secret-1" }, config: {}, fetch: fakeFetch([]).f, webhookSecret: "url-secret-1" };
    expect(telegramAdapter.verifyWebhook({ rawBody: "{}", headers: { "x-telegram-bot-api-secret-token": "hdr-secret-1" } }, base)).toBe(true);
    expect(telegramAdapter.verifyWebhook({ rawBody: "{}", headers: { "x-telegram-bot-api-secret-token": "url-secret-1" } }, base)).toBe(false);
    expect(telegramAdapter.verifyWebhook({ rawBody: "{}", headers: {} }, base)).toBe(false);
    // canal real fără secret de antet → nimic nu trece
    expect(telegramAdapter.verifyWebhook({ rawBody: "{}", headers: { "x-telegram-bot-api-secret-token": "url-secret-1" } }, { ...base, creds })).toBe(false);
  });

  it("connect: getMe, apoi setWebhook cu secret_token și allowed_updates", async () => {
    const { f, calls } = fakeFetch([
      { body: { ok: true, result: { id: 7000000001, is_bot: true, first_name: "Acme", username: "acme_bot", can_connect_to_business: true } } },
      { body: { ok: true, result: true } },
    ]);
    const r = await telegramAdapter.connect({ creds: { ...creds, headerSecret: "s3cr3t" }, config: {}, fetch: f, webhookUrl: "https://app/x", webhookSecret: "url" });
    expect(r.externalId).toBe("7000000001");
    expect(r.config).toMatchObject({ botUsername: "acme_bot", canConnectToBusiness: true });
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${creds.botToken}/getMe`);
    expect(calls[1].url).toMatch(/\/setWebhook$/);
    expect(calls[1].json).toMatchObject({ url: "https://app/x", secret_token: "s3cr3t", drop_pending_updates: true });
    expect(calls[1].json?.allowed_updates).toContain("business_message");
  });

  it("tokenul cu format greșit e refuzat înainte de orice apel", async () => {
    const { f, calls } = fakeFetch([]);
    await expect(telegramAdapter.connect({ creds: { botToken: "nu-e-token" }, config: {}, fetch: f, webhookUrl: "u", webhookSecret: "s" })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("parsează /start <payload>, poze (cea mai mare), contactul propriu și blocarea", () => {
    const [start] = telegramAdapter.parseWebhook({
      update_id: 1,
      message: {
        message_id: 15,
        date: 1790000000,
        from: { id: 123456789, first_name: "Maria", last_name: "Pop", username: "mariap" },
        chat: { id: 123456789, type: "private" },
        text: "/start labc",
      },
    });
    expect(start).toMatchObject({ externalUserId: "123456789", displayName: "Maria Pop", username: "mariap", externalId: "15", startPayload: "labc" });

    const [photo] = telegramAdapter.parseWebhook({
      message: {
        message_id: 16,
        date: 1,
        from: { id: 1, first_name: "M" },
        chat: { id: 1, type: "private" },
        photo: [{ file_id: "small" }, { file_id: "large", file_size: 180000 }],
        caption: "contract semnat",
      },
    });
    expect(photo).toMatchObject({ kind: "image", body: "contract semnat", media: [{ providerFileId: "large" }] });

    const [own] = telegramAdapter.parseWebhook({
      message: { message_id: 17, date: 1, from: { id: 5 }, chat: { id: 5, type: "private" }, contact: { phone_number: "37369111222", first_name: "M", user_id: 5 } },
    });
    expect(own).toMatchObject({ kind: "contact", phone: "+37369111222" });
    const [forwarded] = telegramAdapter.parseWebhook({
      message: { message_id: 18, date: 1, from: { id: 5 }, chat: { id: 5, type: "private" }, contact: { phone_number: "37369000000", first_name: "Alt", user_id: 9 } },
    });
    expect(forwarded).toMatchObject({ phone: null });

    const [blocked] = telegramAdapter.parseWebhook({
      my_chat_member: { chat: { id: 5, type: "private" }, new_chat_member: { status: "kicked" } },
    });
    expect(blocked).toEqual({ type: "blocked", externalUserId: "5", blocked: true });
  });

  it("grupurile sunt ignorate — nu sunt un client care ne scrie", () => {
    expect(
      telegramAdapter.parseWebhook({ message: { message_id: 1, date: 1, from: { id: 1 }, chat: { id: -100, type: "group" }, text: "salut" } })
    ).toEqual([]);
  });

  it("mesajul Telegram Business pleacă înapoi din contul firmei (business_connection_id)", async () => {
    const [ev] = telegramAdapter.parseWebhook({
      business_message: { message_id: 3301, business_connection_id: "BCx9f", date: 1, from: { id: 1 }, chat: { id: 1, type: "private" }, text: "Aveți locuri?" },
    });
    expect(ev).toMatchObject({ meta: { businessConnectionId: "BCx9f" } });
    const { f, calls } = fakeFetch([{ body: { ok: true, result: { message_id: 3302 } } }]);
    const r = await telegramAdapter.send({ creds, config: {}, fetch: f }, { to: "1", text: "Da!", lastInboundMeta: { businessConnectionId: "BCx9f" } });
    expect(r).toMatchObject({ ok: true, externalId: "3302" });
    expect(calls[0].json).toMatchObject({ chat_id: "1", text: "Da!", business_connection_id: "BCx9f" });
  });

  it("403 „bot was blocked by the user” → rezultat eșuat, nu excepție", async () => {
    const { f } = fakeFetch([{ status: 403, body: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } }]);
    const r = await telegramAdapter.send({ creds, config: {}, fetch: f }, { to: "1", text: "x" });
    expect(r).toMatchObject({ ok: false, errorCode: "403" });
  });
});

// ─── Viber ───────────────────────────────────────────────────────────────────

describe("Viber REST Bot API", () => {
  it("[blocant] semnătura = hex(HMAC-SHA256(token, corpul BRUT)) — exemplul din documentația oficială", () => {
    // Exemplul oficial: cheia și semnătura din developers.viber.com/docs/api/rest-bot-api/#callbacks.
    // Se potrivește doar pe corpul exact (spații + CRLF), deci verificăm principiul pe un corp propriu.
    const token = "4453b6ac12345678-e02c5f12174805f9-daec9cbb5448c51f";
    const raw = '{"event":"delivered","timestamp":1457764197627,"message_token":491266184665523145,"user_id":"01234567890A="}';
    const sig = createHmac("sha256", token).update(raw).digest("hex");
    const base = { creds: { authToken: token }, config: {}, fetch: fakeFetch([]).f, webhookSecret: "x" };
    expect(viberAdapter.verifyWebhook({ rawBody: raw, headers: { "x-viber-content-signature": sig } }, base)).toBe(true);
    expect(viberAdapter.verifyWebhook({ rawBody: JSON.stringify(JSON.parse(raw)), headers: { "x-viber-content-signature": sig } }, base)).toBe(false);
  });

  it("[blocant] message_token pe 64 de biți NU se rotunjește (JSON.parse l-ar strica)", () => {
    const raw = '{"event":"seen","timestamp":1,"message_token":4912661846655238145,"user_id":"U"}';
    expect(String(JSON.parse(raw).message_token)).not.toBe("4912661846655238145"); // demonstrația problemei
    const [ev] = viberAdapter.parseWebhook(decodeViberBody(raw));
    expect(ev).toMatchObject({ type: "status", externalId: "4912661846655238145", status: "read" });
  });

  it("parsează mesajul, conversation_started cu context și dezabonarea", () => {
    const [msg] = viberAdapter.parseWebhook(
      decodeViberBody(
        '{"event":"message","timestamp":1457764197627,"message_token":4912661846655238145,"sender":{"id":"01234567890A=","name":"John McClane","avatar":"https://a"},"message":{"type":"text","text":"a message"}}'
      )
    );
    expect(msg).toMatchObject({ type: "message", externalUserId: "01234567890A=", displayName: "John McClane", body: "a message", externalId: "4912661846655238145" });
    const [started] = viberAdapter.parseWebhook({ event: "conversation_started", context: "lxyz", user: { id: "U1", name: "J" }, subscribed: false });
    expect(started).toMatchObject({ type: "contact", externalUserId: "U1", startPayload: "lxyz" });
    expect(viberAdapter.parseWebhook({ event: "unsubscribed", user_id: "U1" })).toEqual([{ type: "blocked", externalUserId: "U1", blocked: true }]);
    expect(viberAdapter.parseWebhook({ event: "webhook", timestamp: 1 })).toEqual([]);
  });

  it("send_message cere sender.name (max 28) și citește message_token ca șir", async () => {
    const { f, calls } = fakeFetch([{ body: '{"status":0,"status_message":"ok","message_token":5741311803571721087,"billing_status":1}' }]);
    const r = await viberAdapter.send(
      { creds: { authToken: "t" }, config: { senderName: "Un nume foarte lung de expeditor care depășește" }, fetch: f },
      { to: "01234567890A=", text: "Bună!" }
    );
    expect(r).toMatchObject({ ok: true, externalId: "5741311803571721087" });
    expect(calls[0].url).toBe("https://chatapi.viber.com/pa/send_message");
    expect((calls[0].init?.headers as Record<string, string>)["X-Viber-Auth-Token"]).toBe("t");
    expect((calls[0].json?.sender as { name: string }).name.length).toBeLessThanOrEqual(28);
    expect(calls[0].json).toMatchObject({ receiver: "01234567890A=", type: "text", text: "Bună!" });
  });

  it("[blocant] SEC-5: descărcarea media acceptă doar https pe domeniile Viber (fără SSRF)", async () => {
    const { f, calls } = fakeFetch([]);
    const ctx = { creds: { authToken: "t" }, config: {}, fetch: f };
    for (const bad of ["http://10.0.0.5/admin", "https://169.254.169.254/latest", "https://viber.com.evil.md/x", "file:///etc/passwd"]) {
      await expect(viberAdapter.fetchMedia!(ctx, bad)).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
    const ok = fakeFetch([{ body: "bytes" }]);
    await viberAdapter.fetchMedia!({ ...ctx, fetch: ok.f }, "https://dl-media.viber.com/1/share/2/abc.jpg");
    expect(ok.calls[0].init?.redirect).toBe("error");
  });

  it("status 6 (neabonat) → mesaj clar în română", async () => {
    const { f } = fakeFetch([{ body: { status: 6, status_message: "notSubscribed" } }]);
    const r = await viberAdapter.send({ creds: { authToken: "t" }, config: {}, fetch: f }, { to: "U", text: "x" });
    expect(r).toMatchObject({ ok: false, errorCode: "6" });
    expect(r.errorMessage).toMatch(/nu e abonat/);
  });
});

// ─── Gmail ───────────────────────────────────────────────────────────────────

describe("Gmail API", () => {
  it("[blocant] MIME: răspunsul rămâne în fir (In-Reply-To + References) și nu permite injecție de antete", () => {
    const mime = buildMime({
      from: "agent@firma.md",
      to: "client@x.md\r\nBcc: spion@rau.md",
      subject: "Ofertă panouri",
      text: "Bună ziua",
      inReplyTo: "<abc@mail.gmail.com>",
      references: "<root@mail.gmail.com>",
    });
    expect(mime).toContain("In-Reply-To: <abc@mail.gmail.com>");
    expect(mime).toContain("References: <root@mail.gmail.com> <abc@mail.gmail.com>");
    expect(mime).not.toMatch(/\r\nBcc:/);
    // diacriticele din subiect → RFC 2047
    expect(buildMime({ from: "a@b.md", to: "c@d.md", subject: "Ofertă", text: "x" })).toContain("Subject: =?UTF-8?B?");
    expect(fromBase64url(base64url("ăîșț-_/+"))).toBe("ăîșț-_/+");
  });

  it("mesajul primit: expeditorul, subiectul, Message-ID-ul pentru răspuns, fără citatul vechi", () => {
    const body = base64url("Mulțumesc, sunt interesat.\n\nOn Mon, 1 Sep 2026 at 10:00, Agent <agent@firma.md> wrote:\n> Vă trimit oferta");
    const ev = gmailMessageToEvent(
      {
        id: "18f1",
        threadId: "18f0",
        internalDate: "1790000000000",
        labelIds: ["INBOX"],
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "From", value: "Ion Popescu <Ion@Client.md>" },
            { name: "Subject", value: "Re: Ofertă" },
            { name: "Message-ID", value: "<m1@mail.gmail.com>" },
          ],
          parts: [{ mimeType: "text/plain", body: { data: body } }],
        },
      },
      "agent@firma.md"
    );
    expect(ev).toMatchObject({
      externalUserId: "ion@client.md",
      displayName: "Ion Popescu",
      threadId: "18f0",
      subject: "Re: Ofertă",
      body: "Mulțumesc, sunt interesat.",
      meta: { messageIdHeader: "<m1@mail.gmail.com>" },
    });
  });

  it("mesajele trimise de noi, spam și no-reply nu devin conversații", () => {
    const make = (from: string, labels: string[]) => ({
      id: "1",
      threadId: "1",
      labelIds: labels,
      payload: { headers: [{ name: "From", value: from }], body: { data: base64url("x") }, mimeType: "text/plain" },
    });
    expect(gmailMessageToEvent(make("agent@firma.md", ["INBOX"]), "agent@firma.md")).toBeNull();
    expect(gmailMessageToEvent(make("x@y.md", ["SENT"]), "agent@firma.md")).toBeNull();
    expect(gmailMessageToEvent(make("x@y.md", ["SPAM"]), "agent@firma.md")).toBeNull();
    expect(gmailMessageToEvent(make("noreply@bank.md", ["INBOX"]), "agent@firma.md")).toBeNull();
  });

  it("stripQuoted și parseAddress", () => {
    expect(stripQuoted("Da\n\nÎn lun., 1 sept. 2026, Ana a scris:\n> ceva")).toBe("Da");
    expect(parseAddress('"Ana Pop" <ANA@x.md>')).toEqual({ email: "ana@x.md", name: "Ana Pop" });
    expect(parseAddress("plain@x.md")).toEqual({ email: "plain@x.md", name: null });
  });
});

// ─── deep link + fereastra WhatsApp ──────────────────────────────────────────

describe("legarea de lead și regulile de trimitere", () => {
  const tenant = "11111111-1111-1111-1111-111111111111";
  const lead = "22222222-2222-4222-8222-222222222222";

  it("[blocant] payload-ul de deep link e semnat pe workspace și încape în limita Telegram (64, [A-Za-z0-9_-])", () => {
    const p = leadLinkPayload(tenant, lead);
    expect(p.length).toBeLessThanOrEqual(64);
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseLeadLinkPayload(tenant, p)).toBe(lead);
    // alt workspace, payload modificat, sau id de lead ghicit fără semnătură → nimic
    expect(parseLeadLinkPayload("33333333-3333-3333-3333-333333333333", p)).toBeNull();
    expect(parseLeadLinkPayload(tenant, p.slice(0, -1) + (p.endsWith("0") ? "1" : "0"))).toBeNull();
    expect(parseLeadLinkPayload(tenant, `l${lead.replace(/-/g, "")}`)).toBeNull();
    expect(telegramDeepLink("acme_bot", p)).toBe(`https://t.me/acme_bot?start=${p}`);
  });

  it("[blocant] fereastra de 24h WhatsApp: în afara ei doar template", () => {
    const now = Date.now();
    expect(windowOpen(new Date(now - 23 * 3600_000), now)).toBe(true);
    expect(windowOpen(new Date(now - 25 * 3600_000), now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
    const ch = { kind: "whatsapp", status: "active" };
    expect(sendRestrictions(ch, { lastInboundAt: new Date(now - 25 * 3600_000) }, { blockedAt: null }, null)).toMatchObject({
      needsTemplate: true,
      canSendFreeform: false,
    });
    expect(sendRestrictions(ch, { lastInboundAt: new Date() }, { blockedAt: null }, null)).toMatchObject({ canSendFreeform: true });
    // Telegram direct: fără fereastră; prin Telegram Business: 24h
    expect(sendRestrictions({ kind: "telegram", status: "active" }, { lastInboundAt: null }, { blockedAt: null }, null).canSendFreeform).toBe(true);
    expect(
      sendRestrictions({ kind: "telegram", status: "active" }, { lastInboundAt: new Date(now - 30 * 3600_000) }, { blockedAt: null }, { businessConnectionId: "B" }).blocked
    ).toBe(true);
    expect(sendRestrictions({ kind: "viber", status: "active" }, { lastInboundAt: null }, { blockedAt: new Date() }, null).blocked).toBe(true);
  });
});
