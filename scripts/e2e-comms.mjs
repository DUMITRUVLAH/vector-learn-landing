// E2E pentru modulul de comunicare omnicanal (COMMS-301/302) — server real, bază reală, browser real.
//
// Testează ACȚIUNILE (CLAUDE.md §3.5.1quater), pe canale SIMULATE (fără chei reale la furnizori):
//   conectare → webhook semnat / nesemnat → lead creat → conversație → răspuns → cronologie →
//   feed-ul echipei → paginile Mesaje / Canale / fișa leadului se randează fără erori.
//
// Rulare:
//   PORT=3141 APP_URL=http://localhost:3141 npx tsx server/index.ts &
//   BASE=http://localhost:3141 node scripts/e2e-comms.mjs            (API)
//   BASE=http://localhost:3141 node scripts/e2e-comms.mjs --browser  (API + browser; cere `vite build`)
//
// Canalele simulate sunt permise doar în afara producției (sau cu COMMS_ALLOW_MOCK=1).

import { createRequire } from "node:module";

const BASE = process.env.BASE || "http://localhost:3141";
const EMAIL = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PASSWORD = process.env.E2E_PASSWORD || "demo123456";
const BROWSER = process.argv.includes("--browser");

let pass = 0;
const fails = [];
const ok = (n) => {
  pass++;
  console.log(`  ✓ ${n}`);
};
const bad = (n, d) => {
  fails.push(`${n}${d ? " — " + d : ""}`);
  console.log(`  ✗ ${n}${d ? " — " + d : ""}`);
};
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

let cookie = "";
async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, res };
}

console.log(`\nE2E comunicare omnicanal → ${BASE}\n`);

// ── autentificare ──
{
  const r = await call("POST", "/api/business/auth/login", { email: EMAIL, password: PASSWORD });
  check(`login ${EMAIL}`, r.status === 200, `status ${r.status}`);
  const set = r.res.headers.getSetCookie?.() ?? [r.res.headers.get("set-cookie")].filter(Boolean);
  cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (r.status !== 200) process.exit(1);
}

// ── canale ──
const list0 = await call("GET", "/api/comms/channels");
check("GET /api/comms/channels → 200 JSON", list0.status === 200 && Array.isArray(list0.json?.channels), `status ${list0.status}`);
check("platforma permite canale simulate (non-prod)", list0.json?.platform?.mockAllowed === true);

const tg = await call("POST", "/api/comms/channels", { kind: "telegram", name: "E2E Telegram", credentials: {}, mock: true });
check("conectare Telegram simulat → 201", tg.status === 201, JSON.stringify(tg.json));
const wa = await call("POST", "/api/comms/channels", { kind: "whatsapp", name: "E2E WhatsApp", credentials: {}, mock: true });
check("conectare WhatsApp simulat → 201", wa.status === 201);
const tgCh = tg.json?.channel;
const waCh = wa.json?.channel;
check("răspunsul nu conține secrete criptate", !JSON.stringify(tg.json).includes("credentialsEnc"));

// ── webhook: nesemnat vs semnat ──
const secret = tgCh?.webhookUrl?.split("/").pop();
const unique = Date.now();
const update = {
  update_id: unique,
  message: {
    message_id: unique,
    date: Math.floor(Date.now() / 1000),
    from: { id: 900000000 + (unique % 1000000), first_name: "Elena", last_name: `E2E${unique % 10000}` },
    chat: { id: 900000000 + (unique % 1000000), type: "private" },
    text: "Bună, aveți locuri la cursul de engleză?",
  },
};
const unsigned = await call("POST", `/api/comms/webhooks/telegram/${secret}`, update);
check("[blocant] webhook fără antet secret → 401", unsigned.status === 401, `status ${unsigned.status}`);
const unknown = await call("POST", `/api/comms/webhooks/telegram/${"0".repeat(48)}`, update, { "x-telegram-bot-api-secret-token": secret });
check("webhook cu secret necunoscut → 404", unknown.status === 404, `status ${unknown.status}`);
const signed = await call("POST", `/api/comms/webhooks/telegram/${secret}`, update, { "x-telegram-bot-api-secret-token": secret });
check("[blocant] webhook semnat → 200", signed.status === 200, `status ${signed.status} ${signed.text.slice(0, 200)}`);
const again = await call("POST", `/api/comms/webhooks/telegram/${secret}`, update, { "x-telegram-bot-api-secret-token": secret });
check("re-livrarea aceluiași update → 200", again.status === 200);

// ── inbox ──
const convs = await call("GET", "/api/comms/inbox/conversations?q=Elena");
const conv = convs.json?.items?.find((c) => c.channelId === tgCh?.id);
check("[blocant] conversația apare în inbox, legată de un lead nou", Boolean(conv?.leadId), JSON.stringify(convs.json).slice(0, 300));
const detail = await call("GET", `/api/comms/inbox/conversations/${conv?.id}`);
check("detaliul conversației → 200", detail.status === 200);
check("re-livrarea NU a dublat mesajul", detail.json?.messages?.length === 1, `mesaje: ${detail.json?.messages?.length}`);
check("se poate scrie liber pe Telegram", detail.json?.compose?.canSendFreeform === true);

const sent = await call("POST", `/api/comms/inbox/conversations/${conv?.id}/messages`, { text: "Da! Grupa începe luni la 18:00." });
check("[blocant] răspunsul se trimite → 201 status sent", sent.status === 201 && sent.json?.message?.status === "sent", JSON.stringify(sent.json).slice(0, 200));
const read = await call("POST", `/api/comms/inbox/conversations/${conv?.id}/read`);
check("marcare citit → 200", read.status === 200);

const summary = await call("GET", "/api/comms/inbox/summary");
check("rezumat necitite → 200", summary.status === 200 && typeof summary.json?.unread === "number");

// ── fișa leadului ──
const leadComms = await call("GET", `/api/comms/inbox/leads/${conv?.leadId}`);
check("canalele leadului → 200", leadComms.status === 200 && Array.isArray(leadComms.json?.channels));
const tgOpt = leadComms.json?.channels?.find((c) => c.id === tgCh?.id);
check("link de invitație Telegram semnat (t.me/…?start=l…)", /^https:\/\/t\.me\/\w+\?start=l[0-9a-f]{48}$/.test(tgOpt?.optInLink ?? ""), tgOpt?.optInLink);

// cronologia leadului: ambele mesaje ca atingeri telegram
const feed = await call("GET", "/api/crm/comms/feed?channel=telegram");
const inFeed = (feed.json?.items ?? []).filter((i) => i.leadId === conv?.leadId);
check("[blocant] feed-ul echipei are mesajul primit ȘI cel trimis (telegram)", inFeed.length >= 2, `găsite ${inFeed.length}`);

// ── WhatsApp simulat: template-uri + start din fișă ──
const tpl = await call("GET", `/api/comms/inbox/channels/${waCh?.id}/templates`);
check("template-uri WhatsApp → 200", tpl.status === 200 && tpl.json?.templates?.length > 0);
const sim = await call("POST", `/api/comms/channels/${waCh?.id}/simulate`, {
  from: `3736${String(unique).slice(-7)}`,
  name: "Victor E2E",
  phone: `+3736${String(unique).slice(-7)}`,
  text: "Cât costă?",
});
check("mesaj WhatsApp simulat → lead nou", sim.status === 200 && sim.json?.result?.messages === 1, JSON.stringify(sim.json));

// ── handshake WhatsApp + cron (protecții) ──
const hs = await call("GET", `/api/comms/webhooks/whatsapp/${waCh?.webhookUrl?.split("/").pop()}?hub.mode=subscribe&hub.verify_token=gresit&hub.challenge=1`);
check("handshake WhatsApp cu verify_token greșit → 403", hs.status === 403, `status ${hs.status}`);
const cron = await call("GET", "/api/comms/cron/daily");
check("cron fără CRON_SECRET → refuzat", cron.status === 401 || cron.status === 503, `status ${cron.status}`);
const gmailPush = await call("POST", "/api/comms/webhooks/gmail", { message: { data: "e30=" } });
check("push Gmail neautentificat → 401", gmailPush.status === 401, `status ${gmailPush.status}`);

// ── curățenie: deconectează canalele de test ──
for (const ch of [tgCh, waCh]) {
  if (!ch) continue;
  const d = await call("DELETE", `/api/comms/channels/${ch.id}`);
  check(`deconectare ${ch.name} → 200`, d.status === 200);
}
const convAfter = await call("GET", `/api/comms/inbox/conversations/${conv?.id}`);
check("istoricul conversației rămâne după deconectare", convAfter.status === 200 && convAfter.json?.messages?.length === 2);

// ── browser ──
if (BROWSER) {
  let chromium;
  for (const base of ["/Users/dima/vector-learn-landing", process.cwd()]) {
    try {
      ({ chromium } = createRequire(base + "/package.json")("playwright-core"));
      break;
    } catch {
      /* încearcă următorul */
    }
  }
  if (!chromium) {
    bad("playwright-core lipsește");
  } else {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const [name, value] = cookie.split(";")[0].split("=");
    await ctx.addCookies([{ name, value, url: BASE }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const visit = async (hash, mustSee, label) => {
      errors.length = 0;
      await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
      try {
        await page.getByText(mustSee, { exact: false }).first().waitFor({ timeout: 15000 });
        const url = page.url();
        check(`[browser] ${label}`, url.includes(hash.split("?")[0]) && errors.length === 0, errors.join(" | ") || url);
      } catch (e) {
        bad(`[browser] ${label}`, `nu apare „${mustSee}" — url ${page.url()} ${errors.join(" | ")}`);
      }
    };

    await visit("/business/crm/mesaje", "Mesaje", "pagina Mesaje se randează");
    await visit(`/business/crm/mesaje?c=${conv?.id}`, "Da! Grupa începe luni", "firul conversației arată răspunsul trimis");
    await visit("/business/crm/canale", "Adaugă un canal", "pagina Canale de mesaje se randează");
    await visit(`/business/crm/pipeline?lead=${conv?.leadId}`, "Activitate", "fișa leadului se deschide cu panoul Mesaje");
    // bara laterală are intrările noi
    await visit("/business/crm/mesaje", "Canale de mesaje", "meniul CRM are „Canale de mesaje”");
    await browser.close();
  }
}

console.log(`\n${pass} trecute, ${fails.length} picate`);
if (fails.length) {
  console.log("\nPICATE:\n - " + fails.join("\n - "));
  process.exit(1);
}
