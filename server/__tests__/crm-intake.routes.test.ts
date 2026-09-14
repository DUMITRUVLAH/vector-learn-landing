/**
 * @vitest-environment node
 * CAPTAREA LEAD-URILOR DE PE SITE — INTEGRATION (ruta publică reală, PGlite).
 *
 * Cerința 68 din caietul de sarcini Ecosolar. Ruta n-are sesiune: vizitatorul unui site nu e
 * logat în FinFlow. Tot ce ține locul autentificării trebuie să fie de neocolit — de-aici
 * testele de mai jos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions } from "../db/schema/leads";
import { crmCaptureSources } from "../db/schema/crmCaptureSources";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

import { Hono } from "hono";

let app: Hono;
let ecosolar: string;
let altWorkspace: string;
let tokenPublic: string;
let tokenCuOrigini: string;
let tokenOprit: string;

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

async function submit(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await app.request("/api/crm/intake/webform", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmIntakeRoutes } = await import("../routes/crmIntake");
  app = new Hono();
  app.route("/api/crm/intake", crmIntakeRoutes);

  const [t1] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-intake" }).returning();
  const [t2] = await testDb.insert(tenants).values({ name: "Altcineva", slug: "alt-intake" }).returning();
  ecosolar = t1.id;
  altWorkspace = t2.id;
  await testDb
    .insert(users)
    .values({ tenantId: ecosolar, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" });
  await testDb.insert(crmPipelineStages).values([
    { tenantId: ecosolar, key: "new", label: "Lead nou", orderIndex: 0, isDefault: true },
  ]);

  const mkSource = async (tenantId: string, name: string, token: string, extra: Record<string, unknown> = {}) => {
    await testDb.insert(crmCaptureSources).values({ tenantId, name, token, ...extra });
    return token;
  };
  tokenPublic = await mkSource(ecosolar, "Formular cerere ofertă", "token-public-0123456789");
  tokenCuOrigini = await mkSource(ecosolar, "Formular cu origini", "token-origini-0123456789", {
    allowedOrigins: ["https://ecosolar.md"],
  });
  tokenOprit = await mkSource(ecosolar, "Formular vechi", "token-oprit-0123456789", { active: false });
  await mkSource(altWorkspace, "Al altui client", "token-altul-0123456789");
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Formularul creează leadul în workspace-ul TOKENULUI", () => {
  it("[blocant] un formular completat devine lead, cu sursa și UTM-urile lui", async () => {
    const res = await submit({
      token: tokenPublic,
      fullName: "Primăria Ialoveni",
      email: "contact@ialoveni.md",
      phone: "069 123 456",
      message: "Vrem ofertă pentru 50 kW",
      utmSource: "google",
      utmCampaign: "panouri-2026",
      consentText: "Sunt de acord cu prelucrarea datelor",
      consentAt: new Date().toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.isDuplicate).toBe(false);

    const [lead] = await testDb.select().from(leads).where(eq(leads.fullName, "Primăria Ialoveni"));
    expect(lead.tenantId).toBe(ecosolar);
    expect(lead.source).toBe("webform");
    expect(lead.utmCampaign).toBe("panouri-2026");
    // Dovada GDPR (cerința 63) — textul, clipa și de unde a venit.
    expect(lead.consentText).toContain("de acord");
    expect(lead.consentAt).not.toBeNull();
    expect(lead.notes).toContain("50 kW");
  });

  it("[blocant] a doua cerere a aceleiași persoane NU creează un al doilea lead", async () => {
    const inainte = await testDb.select().from(leads).where(eq(leads.tenantId, ecosolar));

    const res = await submit({
      token: tokenPublic,
      fullName: "Primăria Ialoveni",
      email: "contact@ialoveni.md",
      message: "Revenim: ne trebuie și pompă de căldură",
    });

    expect(res.status).toBe(200);
    expect(res.body.isDuplicate).toBe(true);
    // Răspunsul ajunge într-o pagină publică: nu spune nimic despre leadul existent.
    expect(res.body.leadId).toBeUndefined();

    const dupa = await testDb.select().from(leads).where(eq(leads.tenantId, ecosolar));
    expect(dupa).toHaveLength(inainte.length);

    // Dar agentul trebuie să vadă că omul a revenit.
    const [lead] = await testDb.select().from(leads).where(eq(leads.fullName, "Primăria Ialoveni"));
    const note = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    expect(note.some((n) => (n.body ?? "").includes("pompă de căldură"))).toBe(true);
    expect(note.some((n) => n.direction === "inbound")).toBe(true);
  });
});

describe("Ce ține locul autentificării", () => {
  it("[blocant] token necunoscut sau formular oprit → 401, fără să spună care din ele", async () => {
    const necunoscut = await submit({ token: "token-inventat-0123456789", fullName: "Cineva" });
    expect(necunoscut.status).toBe(401);
    expect(necunoscut.body.error).toBe("invalid_token");

    const oprit = await submit({ token: tokenOprit, fullName: "Cineva" });
    expect(oprit.status).toBe(401);
    // Același răspuns: un mesaj diferit ar confirma unui străin că tokenul e valid.
    expect(oprit.body.error).toBe("invalid_token");
  });

  it("[blocant] formularul cu origini declarate refuză cererea de pe alt domeniu", async () => {
    const strain = await submit(
      { token: tokenCuOrigini, fullName: "De pe alt site" },
      { origin: "https://site-strain.example" }
    );
    expect(strain.status).toBe(403);
    expect(strain.body.error).toBe("origin_not_allowed");

    const acasa = await submit(
      { token: tokenCuOrigini, fullName: "De pe site-ul lor", email: "nou@ecosolar.md" },
      { origin: "https://ecosolar.md" }
    );
    expect(acasa.status).toBe(201);
  });

  it("[blocant] un consimțământ vechi înseamnă payload refolosit → refuzat", async () => {
    const acumOOra = new Date(Date.now() - 3600_000).toISOString();
    const res = await submit({
      token: tokenPublic,
      fullName: "Payload reluat",
      email: "reluat@example.md",
      consentAt: acumOOra,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("consent_expired");
    expect(await testDb.select().from(leads).where(eq(leads.fullName, "Payload reluat"))).toHaveLength(0);
  });

  it("[blocant] tokenul unui workspace NU poate scrie în altul", async () => {
    await submit({ token: "token-altul-0123456789", fullName: "Lead al altcuiva", email: "x@alt.md" });

    const inEcosolar = await testDb.select().from(leads).where(eq(leads.fullName, "Lead al altcuiva"));
    expect(inEcosolar).toHaveLength(1);
    expect(inEcosolar[0].tenantId).toBe(altWorkspace); // NU în Ecosolar
  });
});

describe("Numărătoarea formularelor", () => {
  it("[normal] fiecare captare crește contorul sursei — vezi ce pagină chiar aduce leaduri", async () => {
    const [source] = await testDb
      .select()
      .from(crmCaptureSources)
      .where(eq(crmCaptureSources.token, tokenPublic));

    expect(source.leadsCaptured).toBeGreaterThanOrEqual(2); // leadul nou + duplicatul
    expect(source.lastCaptureAt).not.toBeNull();
  });
});
