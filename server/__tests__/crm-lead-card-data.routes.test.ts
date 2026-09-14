/**
 * @vitest-environment node
 * FIȘA LEADULUI: CONTACTE, CÂMPURI PERSONALIZATE, ISTORICUL PERSOANEI — INTEGRATION.
 *
 * Portare din crm-vector (ContactsTab, CustomFieldsManagerModal, PersonHistorySection). Tabelele
 * `lead_contacts`, `custom_fields` și `lead_field_values` existau în FinFlow din migrarea 0007,
 * dar n-aveau nicio rută — deci nici interfață. Aici se verifică rutele reale, pe PGlite cu
 * toate migrările, izolarea între workspace-uri fiind primul lucru testat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadContacts, leadInteractions, customFields, leadFieldValues } from "../db/schema/leads";

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
let vectorTenant: string;
let aticTenant: string;
let ana: string;
let borisAtic: string;
let leadVector: string;
let leadAtic: string;

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

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

async function put(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

async function patch(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmContactsRoutes } = await import("../routes/crmContacts");
  const { crmCustomFieldsRoutes } = await import("../routes/crmCustomFields");
  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/contacts", crmContactsRoutes);
  app.route("/api/crm/custom-fields", crmCustomFieldsRoutes);
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-card" }).returning();
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-card" }).returning();
  vectorTenant = vector.id;
  aticTenant = atic.id;

  const mkUser = async (tenantId: string, email: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: "admin" })
      .returning();
    return u.id;
  };
  ana = await mkUser(vectorTenant, "ana@vector.md");
  borisAtic = await mkUser(aticTenant, "boris@atic.md");

  const [lv] = await testDb
    .insert(leads)
    .values({ tenantId: vectorTenant, fullName: "Acme SRL", stage: "new", source: "manual" })
    .returning();
  leadVector = lv.id;
  const [la] = await testDb
    .insert(leads)
    .values({ tenantId: aticTenant, fullName: "Alt workspace", stage: "new", source: "manual" })
    .returning();
  leadAtic = la.id;

  session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Contacte multiple pe un lead", () => {
  it("[blocant] nu se pot adăuga contacte pe leadul altui workspace", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await post("/api/crm/contacts", { leadId: leadAtic, fullName: "Spion Ion" });

    expect(res.status).toBe(404); // 404, nu 403 — nu confirmăm că leadul există
    const rows = await testDb.select().from(leadContacts).where(eq(leadContacts.leadId, leadAtic));
    expect(rows).toHaveLength(0);
  });

  it("[blocant] cel mult UN contact principal: marcarea altuia îi scoate pe ceilalți", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const first = await post("/api/crm/contacts", {
      leadId: leadVector,
      fullName: "Ion Decident",
      role: "Director",
      isPrimary: true,
    });
    const second = await post("/api/crm/contacts", {
      leadId: leadVector,
      fullName: "Maria Contabilă",
      isPrimary: true,
    });
    expect(second.status).toBe(201);

    const rows = await testDb
      .select()
      .from(leadContacts)
      .where(and(eq(leadContacts.tenantId, vectorTenant), eq(leadContacts.leadId, leadVector)));
    const primaries = rows.filter((r) => r.isPrimary === 1);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(second.body.id);
    expect(rows.find((r) => r.id === first.body.id)?.isPrimary).toBe(0);
  });

  it("[normal] lista întoarce principalul primul — e ordinea în care omul sună", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await app.request(`/api/crm/contacts?leadId=${leadVector}`);
    const items = ((await res.json()) as { items: Array<{ fullName: string; isPrimary: number }> }).items;

    expect(items[0].isPrimary).toBe(1);
    expect(items[0].fullName).toBe("Maria Contabilă");
  });

  it("[blocant] un contact din alt workspace nu se poate șterge sau edita", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [mine] = await testDb
      .select()
      .from(leadContacts)
      .where(eq(leadContacts.leadId, leadVector));

    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    expect((await patch(`/api/crm/contacts/${mine.id}`, { fullName: "Furat" })).status).toBe(404);
    expect((await app.request(`/api/crm/contacts/${mine.id}`, { method: "DELETE" })).status).toBe(404);

    const [after] = await testDb.select().from(leadContacts).where(eq(leadContacts.id, mine.id));
    expect(after.fullName).toBe(mine.fullName); // neatins de workspace-ul străin
  });
});

describe("Câmpuri personalizate", () => {
  it("[blocant] cheia se derivă din etichetă și nu se poate dubla", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const created = await post("/api/crm/custom-fields", { label: "Nr. contract" });

    expect(created.status).toBe(201);
    expect(created.body.key).toBe("nr_contract"); // fără diacritice, fără punctuație

    const again = await post("/api/crm/custom-fields", { label: "Nr contract" });
    expect(again.status).toBe(409);
  });

  it("[blocant] valoarea se scrie pe leadul propriu, nu pe al altui workspace", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [field] = await testDb.select().from(customFields).where(eq(customFields.tenantId, vectorTenant));

    const ok = await put("/api/crm/custom-fields/values", {
      leadId: leadVector,
      fieldId: field.id,
      value: "C-2026-114",
    });
    expect(ok.status).toBe(201);

    const refuzat = await put("/api/crm/custom-fields/values", {
      leadId: leadAtic,
      fieldId: field.id,
      value: "Furat",
    });
    expect(refuzat.status).toBe(404);

    const rows = await testDb.select().from(leadFieldValues).where(eq(leadFieldValues.fieldId, field.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].leadId).toBe(leadVector);
  });

  it("[blocant] a doua scriere ACTUALIZEAZĂ valoarea, nu adaugă un al doilea rând", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [field] = await testDb.select().from(customFields).where(eq(customFields.tenantId, vectorTenant));

    await put("/api/crm/custom-fields/values", { leadId: leadVector, fieldId: field.id, value: "C-2026-999" });

    const rows = await testDb
      .select()
      .from(leadFieldValues)
      .where(and(eq(leadFieldValues.leadId, leadVector), eq(leadFieldValues.fieldId, field.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("C-2026-999");
  });

  it("[normal] o valoare golită șterge rândul — un rând gol n-are ce căuta în bază", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [field] = await testDb.select().from(customFields).where(eq(customFields.tenantId, vectorTenant));

    await put("/api/crm/custom-fields/values", { leadId: leadVector, fieldId: field.id, value: "   " });

    const rows = await testDb
      .select()
      .from(leadFieldValues)
      .where(and(eq(leadFieldValues.leadId, leadVector), eq(leadFieldValues.fieldId, field.id)));
    expect(rows).toHaveLength(0);
  });

  it("[blocant] ștergerea definiției duce și valorile ei — nu rămân orfane", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [field] = await testDb.select().from(customFields).where(eq(customFields.tenantId, vectorTenant));
    await put("/api/crm/custom-fields/values", { leadId: leadVector, fieldId: field.id, value: "de șters" });

    const res = await app.request(`/api/crm/custom-fields/${field.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(await testDb.select().from(leadFieldValues).where(eq(leadFieldValues.fieldId, field.id))).toHaveLength(0);
  });
});

describe("Istoricul persoanei", () => {
  it("[blocant] aceeași persoană, alt lead: se leagă pe telefonul normalizat, nu pe cum e scris", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const [curent] = await testDb
      .insert(leads)
      .values({
        tenantId: vectorTenant,
        fullName: "Ion Popa",
        phone: "+373 69 000 111",
        phoneNormalized: "37369000111",
        stage: "new",
        source: "manual",
      })
      .returning();
    const [vechi] = await testDb
      .insert(leads)
      .values({
        tenantId: vectorTenant,
        fullName: "Ion Popa (2025)",
        phone: "069 000 111",
        phoneNormalized: "37369000111",
        stage: "lost",
        source: "manual",
      })
      .returning();
    await testDb.insert(leadInteractions).values({
      tenantId: vectorTenant,
      leadId: vechi.id,
      type: "note",
      direction: "internal",
      body: "A refuzat: preț prea mare",
    });
    // Zgomotul de sistem nu are ce spune cuiva care vrea să știe ce s-a discutat.
    await testDb.insert(leadInteractions).values({
      tenantId: vectorTenant,
      leadId: vechi.id,
      type: "stage_change",
      direction: "internal",
      body: "new → lost",
    });

    const res = await app.request(`/api/crm/leads/${curent.id}/person-history`);
    const body = (await res.json()) as {
      leads: Array<{ id: string; fullName: string }>;
      notesByLead: Record<string, Array<{ body: string; type: string }>>;
    };

    expect(res.status).toBe(200);
    expect(body.leads.map((l) => l.id)).toEqual([vechi.id]);
    expect(body.notesByLead[vechi.id].map((n) => n.body)).toEqual(["A refuzat: preț prea mare"]);
    expect(body.notesByLead[vechi.id].some((n) => n.type === "stage_change")).toBe(false);
  });

  it("[blocant] istoricul nu trece granița workspace-ului, oricât de identic ar fi telefonul", async () => {
    const [inVector] = await testDb
      .insert(leads)
      .values({
        tenantId: vectorTenant,
        fullName: "Dublu",
        phoneNormalized: "37360999888",
        stage: "new",
        source: "manual",
      })
      .returning();
    await testDb.insert(leads).values({
      tenantId: aticTenant,
      fullName: "Același telefon, alt workspace",
      phoneNormalized: "37360999888",
      stage: "new",
      source: "manual",
    });

    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await app.request(`/api/crm/leads/${inVector.id}/person-history`);
    const body = (await res.json()) as { leads: Array<{ fullName: string }> };

    expect(body.leads).toHaveLength(0);
  });

  it("[normal] un lead fără telefon și fără email n-are istoric — nu ghicim după nume", async () => {
    const [fara] = await testDb
      .insert(leads)
      .values({ tenantId: vectorTenant, fullName: "Acme SRL", stage: "new", source: "manual" })
      .returning();

    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await app.request(`/api/crm/leads/${fara.id}/person-history`);
    const body = (await res.json()) as { leads: unknown[] };

    expect(body.leads).toHaveLength(0);
  });
});
