/**
 * @vitest-environment node
 *
 * Comunicarea cu lead-ul: email, telefon, WhatsApp.
 *
 * Testul cel mai important din fișier nu e despre trimitere, ci despre URMĂ:
 * un email care nu pleacă și nu lasă nicio înregistrare e mai rău decât unul
 * netrimis. Agentul crede că a scris clientului, clientul nu știe nimic, iar
 * peste două săptămâni nimeni nu poate reconstitui de ce s-a rupt legătura.
 *
 * Al doilea: garda de trimitere. Adresele lead-urilor sunt scrise de mână și
 * adesea greșite; un hard bounce se pune în cârca reputației domeniului
 * `finflow.best`, iar Resend suspendă conturi peste ~5% bounce. Adică o listă
 * prost curățată a unui client poate strica livrarea pentru toți ceilalți.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let anaId: string;
let boId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string };

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

/** Garda reală e testată în altă parte; aici o controlăm ca să izolăm comportamentul rutei. */
let guardAllows = true;
vi.mock("../lib/emailGuard", () => ({
  emailSendDecision: () => (guardAllows ? { allowed: true } : { allowed: false, reason: "undeliverable recipient domain" }),
  isUndeliverableRecipient: () => !guardAllows,
}));

import { Hono } from "hono";
let app: Hono;

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

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmCommsRoutes } = await import("../routes/crmComms");
  app = new Hono();
  app.route("/api/crm/comms", crmCommsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-comms" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-comms" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana Pop", role: "admin" })
    .returning();
  const [bo] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo Rusu", role: "admin" })
    .returning();
  anaId = ana.id;
  boId = bo.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  currentUser = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
  guardAllows = false; // implicit blocat: niciun test nu trimite emailuri reale
  delete process.env.RESEND_API_KEY;
  vi.unstubAllGlobals();
});

async function makeLead(tenantId: string, over: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName: "Ion Popescu", stage: "new", email: "ion@exemplu.md", ...over })
    .returning();
  return row;
}

// ─── Izolarea ────────────────────────────────────────────────────────────────

describe("izolarea între workspace-uri", () => {
  it("[blocant] nu se poate trimite un email către un lead din alt workspace", async () => {
    // Ar fi cea mai gravă scurgere posibilă: un mesaj în numele firmei noastre
    // către clientul altcuiva, cu datele lui pe el.
    const theirs = await makeLead(tenantB);
    const res = await post("/api/crm/comms/email", {
      leadId: theirs.id,
      subject: "Ofertă",
      body: "Bună ziua",
    });
    expect(res.status).toBe(404);
    expect(await testDb.select().from(leadInteractions)).toHaveLength(0);
  });

  it("[blocant] nu se poate înregistra o atingere pe un lead din alt workspace", async () => {
    const theirs = await makeLead(tenantB);
    const res = await post("/api/crm/comms/log", { leadId: theirs.id, channel: "call" });
    expect(res.status).toBe(404);
  });

  it("[blocant] fluxul de activitate al unui workspace nu se vede din altul", async () => {
    const mine = await makeLead(tenantA, { fullName: "Client Secret Alfa" });
    await post("/api/crm/comms/log", { leadId: mine.id, channel: "call", outcome: "A răspuns" });

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/comms/feed");
    expect(JSON.stringify(await res.json())).not.toContain("Client Secret Alfa");
  });
});

// ─── Urma rămâne, indiferent de rezultat ─────────────────────────────────────

describe("urma în cronologie", () => {
  it("[blocant] un email BLOCAT lasă totuși urmă, cu motivul", async () => {
    guardAllows = false;
    const lead = await makeLead(tenantA);

    const res = await post("/api/crm/comms/email", {
      leadId: lead.id,
      subject: "Oferta noastră",
      body: "Bună ziua, vă trimitem oferta.",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("blocked");

    const [row] = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    expect(row.type).toBe("email");
    expect((row.metadata as Record<string, unknown>).status).toBe("blocked");
    expect(row.body).toContain("Oferta noastră");
  });

  it("[blocant] un email PICAT la furnizor lasă urmă cu starea reală, nu cu «trimis»", async () => {
    guardAllows = true;
    process.env.RESEND_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 422 })));

    const lead = await makeLead(tenantA);
    const res = await post("/api/crm/comms/email", { leadId: lead.id, subject: "S", body: "B" });

    expect(res.body.status).toBe("failed");
    const [row] = await testDb.select().from(leadInteractions);
    expect((row.metadata as Record<string, unknown>).status).toBe("failed");
  });

  it("un email trimis cu succes e marcat ca atare", async () => {
    guardAllows = true;
    process.env.RESEND_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 })));

    const lead = await makeLead(tenantA);
    const res = await post("/api/crm/comms/email", { leadId: lead.id, subject: "S", body: "B" });

    expect(res.body.status).toBe("sent");
    const [row] = await testDb.select().from(leadInteractions);
    expect((row.metadata as Record<string, unknown>).status).toBe("sent");
  });

  it("[blocant] un email blocat NU ajunge la furnizor", async () => {
    guardAllows = false;
    process.env.RESEND_API_KEY = "test-key";
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/email", { leadId: lead.id, subject: "S", body: "B" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("un lead fără adresă primește un mesaj clar, nu o eroare de server", async () => {
    const lead = await makeLead(tenantA, { email: null });
    const res = await post("/api/crm/comms/email", { leadId: lead.id, subject: "S", body: "B" });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain("adresă");
  });

  it("adresa scrisă explicit o învinge pe cea a lead-ului", async () => {
    guardAllows = false;
    const lead = await makeLead(tenantA, { email: "vechi@exemplu.md" });
    await post("/api/crm/comms/email", {
      leadId: lead.id,
      subject: "S",
      body: "B",
      to: "nou@exemplu.md",
    });
    const [row] = await testDb.select().from(leadInteractions);
    expect((row.metadata as Record<string, unknown>).to).toBe("nou@exemplu.md");
  });
});

// ─── Înregistrarea manuală ───────────────────────────────────────────────────

describe("atingeri înregistrate manual", () => {
  it("un apel reține durata într-o formă citibilă", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/log", {
      leadId: lead.id,
      channel: "call",
      outcome: "A răspuns",
      durationSec: 185,
    });

    const [row] = await testDb.select().from(leadInteractions);
    expect(row.type).toBe("call");
    expect(row.body).toContain("A răspuns");
    expect(row.body).toContain("3 min 5 s");
    expect((row.metadata as Record<string, unknown>).durationSec).toBe(185);
  });

  it("WhatsApp și SMS se înregistrează ca atingeri separate, nu ca notițe", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "whatsapp", body: "I-am scris pe WhatsApp" });
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "sms", body: "SMS de reamintire" });

    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    expect(rows.map((r) => r.type).sort()).toEqual(["sms", "whatsapp"]);
  });

  it("un apel primit se deosebește de unul dat", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "call", direction: "inbound" });
    const [row] = await testDb.select().from(leadInteractions);
    expect(row.direction).toBe("inbound");
  });
});

// ─── Fluxul de activitate ────────────────────────────────────────────────────

describe("fluxul de activitate", () => {
  it("[blocant] nu îneacă echipa în zgomotul generat de aplicație", async () => {
    // `stage_change` și `system` sunt scrise de cod, nu de oameni. Într-un flux
    // menit să arate „se lucrează?", ele ar acoperi complet munca reală.
    const lead = await makeLead(tenantA);
    await testDb.insert(leadInteractions).values([
      { tenantId: tenantA, leadId: lead.id, type: "stage_change", direction: "internal", body: "new → contacted" },
      { tenantId: tenantA, leadId: lead.id, type: "system", direction: "internal", body: "unificare" },
      { tenantId: tenantA, leadId: lead.id, type: "call", direction: "outbound", body: "A răspuns" },
    ]);

    const res = await app.request("/api/crm/comms/feed");
    const body = (await res.json()) as { items: { type: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("call");
  });

  it("fiecare rând spune pe ce lead și cine a făcut atingerea", async () => {
    const lead = await makeLead(tenantA, { fullName: "Maria Ionescu", company: "Agro Nord" });
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "call", outcome: "A răspuns" });

    const res = await app.request("/api/crm/comms/feed");
    const body = (await res.json()) as { items: { leadName: string; userName: string; leadCompany: string }[] };
    expect(body.items[0].leadName).toBe("Maria Ionescu");
    expect(body.items[0].leadCompany).toBe("Agro Nord");
    expect(body.items[0].userName).toBe("Ana Pop");
  });

  it("se poate filtra pe canal", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "call" });
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "whatsapp" });

    const res = await app.request("/api/crm/comms/feed?channel=whatsapp");
    const body = (await res.json()) as { items: { type: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("whatsapp");
  });

  it("se poate filtra pe agent — „ce a făcut omul meu azi”", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/comms/log", { leadId: lead.id, channel: "call" });

    const mine = await app.request(`/api/crm/comms/feed?owner=${anaId}`);
    expect(((await mine.json()) as { items: unknown[] }).items).toHaveLength(1);

    const other = await app.request(`/api/crm/comms/feed?owner=${boId}`);
    expect(((await other.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
});
