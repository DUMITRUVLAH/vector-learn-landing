/**
 * @vitest-environment node
 * DREPTURILE PERSOANEI PE FIȘA LEADULUI — INTEGRATION (cerința 63).
 *
 * Decizia de fond, testată explicit: **anonimizare, nu ștergere.** Un lead șters ar lua cu el și
 * istoria comercială — câte oferte s-au trimis, de ce s-a pierdut, ce a încasat firma. Dreptul
 * persoanei e asupra DATELOR EI, nu asupra faptelor contabile ale firmei.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions, leadContacts } from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantId: string;
let altTenant: string;
let admin: string;
let agent: string;
let leadId: string;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const asAdmin = () => (session = { id: admin, tenantId, role: "admin", email: "admin@eco.md" });
const asAgent = () => (session = { id: agent, tenantId, role: "teacher", email: "agent@eco.md" });

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmGdprRoutes } = await import("../routes/crmGdpr");
  app = new Hono();
  app.route("/api/crm/gdpr", crmGdprRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-gdpr" }).returning();
  const [t2] = await testDb.insert(tenants).values({ name: "Altul", slug: "alt-gdpr" }).returning();
  tenantId = t.id;
  altTenant = t2.id;

  const mk = async (email: string, role: "admin" | "teacher") => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role })
      .returning();
    return u.id;
  };
  admin = await mk("admin@eco.md", "admin");
  agent = await mk("agent@eco.md", "teacher");

  asAdmin();
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await testDb.delete(leadInteractions);
  await testDb.delete(leadContacts);
  await testDb.delete(crmLeadTasks);
  await testDb.delete(leads);

  const [lead] = await testDb
    .insert(leads)
    .values({
      tenantId,
      fullName: "Ion Rusu",
      phone: "069123456",
      phoneNormalized: "37369123456",
      email: "ion@example.md",
      emailNormalized: "ion@example.md",
      notes: "Preferă apel după 17:00",
      stage: "lost",
      lostReason: "Preț prea mare",
      valueCents: 250_00,
      source: "webform",
      consentText: "Sunt de acord",
      consentAt: new Date(),
      ipAtConsent: "1.2.3.4",
    })
    .returning();
  leadId = lead.id;

  await testDb.insert(leadInteractions).values({
    tenantId,
    leadId,
    type: "call",
    direction: "outbound",
    body: "Am discutat despre panouri; a zis că se gândește",
    metadata: { outcome: "answered" },
  });
  await testDb.insert(leadContacts).values({ tenantId, leadId, fullName: "Maria Rusu", phone: "078000111" });
  asAdmin();
});

describe("Dreptul de acces și portabilitate", () => {
  it("[blocant] exportul conține tot ce știm despre om, ca fișier", async () => {
    const res = await app.request(`/api/crm/gdpr/export/${leadId}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const payload = (await res.json()) as Record<string, never>;
    const text = JSON.stringify(payload);

    expect(text).toContain("Ion Rusu");
    expect(text).toContain("069123456");
    expect(text).toContain("Preferă apel după 17:00");
    expect(text).toContain("Am discutat despre panouri");
    expect(text).toContain("Maria Rusu");
    // Cererea de export e ea însăși o prelucrare: se vede cine a cerut-o.
    expect(payload.exportedBy).toBe("admin@eco.md");
  });

  it("[blocant] agentul NU poate exporta fișa completă a unui om", async () => {
    asAgent();
    const res = await app.request(`/api/crm/gdpr/export/${leadId}`);
    expect(res.status).toBe(403);
  });

  it("[blocant] un lead din alt workspace → 404", async () => {
    const [strain] = await testDb
      .insert(leads)
      .values({ tenantId: altTenant, fullName: "Al altcuiva", stage: "new", source: "manual" })
      .returning();

    asAdmin();
    const res = await app.request(`/api/crm/gdpr/export/${strain.id}`);
    expect(res.status).toBe(404);
  });
});

describe("Ștergerea datelor personale", () => {
  it("[blocant] anonimizarea scoate identitatea, dar PĂSTREAZĂ faptele comerciale", async () => {
    const res = await app.request(`/api/crm/gdpr/anonymize/${leadId}`, { method: "POST" });
    expect(res.status).toBe(200);

    const [after] = await testDb.select().from(leads).where(eq(leads.id, leadId));

    // Ce e al persoanei: dispare.
    expect(after.fullName).toBe("[GDPR_REMOVED]");
    expect(after.phone).toBeNull();
    expect(after.email).toBeNull();
    expect(after.notes).toBeNull();
    expect(after.ipAtConsent).toBeNull();
    // Nici căutarea după telefon/email nu mai trebuie să-l găsească.
    expect(after.phoneNormalized).toBeNull();
    expect(after.emailNormalized).toBeNull();

    // Ce e al firmei: rămâne. Altfel raportul de anul trecut s-ar schimba retroactiv.
    expect(after.valueCents).toBe(250_00);
    expect(after.stage).toBe("lost");
    expect(after.lostReason).toBe("Preț prea mare");

    // Consimțământul apare ca retras — dovada că cererea a fost respectată.
    expect(after.consentRevokedAt).not.toBeNull();
  });

  it("[blocant] cronologia păstrează CĂ a fost un apel, dar nu ce s-a spus", async () => {
    await app.request(`/api/crm/gdpr/anonymize/${leadId}`, { method: "POST" });

    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, leadId));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("call"); // faptul rămâne
    expect(rows[0].body).toBe("[GDPR_REMOVED]"); // conținutul, nu
    expect(rows[0].metadata).toBeNull();
  });

  it("[blocant] persoanele de contact dispar complet — sunt, toate, date personale", async () => {
    await app.request(`/api/crm/gdpr/anonymize/${leadId}`, { method: "POST" });

    const contacts = await testDb.select().from(leadContacts).where(eq(leadContacts.leadId, leadId));
    expect(contacts).toHaveLength(0);
  });

  it("[blocant] agentul nu poate anonimiza — e o acțiune ireversibilă", async () => {
    asAgent();
    const res = await app.request(`/api/crm/gdpr/anonymize/${leadId}`, { method: "POST" });
    expect(res.status).toBe(403);

    const [after] = await testDb.select().from(leads).where(eq(leads.id, leadId));
    expect(after.fullName).toBe("Ion Rusu");
  });
});

describe("Retragerea consimțământului", () => {
  it("[blocant] NU șterge nimic — „nu mă mai contactați” nu e „ștergeți ce știți despre mine”", async () => {
    asAgent(); // agentul primește cererea la telefon: el trebuie să o poată consemna
    const res = await app.request(`/api/crm/gdpr/revoke/${leadId}`, { method: "POST" });
    expect(res.status).toBe(200);

    const [after] = await testDb.select().from(leads).where(eq(leads.id, leadId));
    expect(after.consentRevokedAt).not.toBeNull();
    expect(after.fullName).toBe("Ion Rusu"); // datele rămân

    // Și rămâne urma în cronologie, ca oricine deschide fișa să vadă de ce nu se mai sună.
    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, leadId));
    expect(rows.some((r) => (r.body ?? "").includes("Consimțământ retras"))).toBe(true);
  });
});
