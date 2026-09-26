/**
 * @vitest-environment node
 *
 * CRM-D05 — actul în viața leadului: istoric, mutare de etapă, notificare.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions, inAppNotifications } from "../db/schema";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmProducts } from "../db/schema/crmProducts";
import { docDocuments, docDocumentLines, docAudit } from "../db/schema/docs";
import { targetStageFor } from "../lib/crm/documentEvents";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let ana: string;
let bogdan: string;
let pipelineId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string; name?: string };

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

const sentEmails: Array<Record<string, unknown>> = [];
vi.mock("../lib/docs/sendDocumentEmail", () => ({
  sendDocumentEmail: async (p: Record<string, unknown>) => {
    sentEmails.push(p);
    return { sent: true };
  },
}));

import { Hono } from "hono";
let app: Hono;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      try {
        await pg.exec(stmt);
      } catch {
        /* ca în celelalte suite */
      }
    }
  }
}

async function call(method: string, url: string, body?: unknown) {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const STAGES = [
  { key: "new", label: "Lead nou", orderIndex: 0 },
  { key: "contactat", label: "Contactat", orderIndex: 1 },
  { key: "oferta", label: "Ofertă trimisă", orderIndex: 2 },
  { key: "negociere", label: "Negociere", orderIndex: 3 },
  { key: "castigat", label: "Client", orderIndex: 4, isWon: true },
  { key: "pierdut", label: "Pierdut", orderIndex: 5, isLost: true },
];

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  const { crmDocumentsRoutes } = await import("../routes/crmDocuments");
  const { docsRoutes } = await import("../routes/docs");
  const { docShareRoutes, docPublicRoutes } = await import("../routes/docShare");
  app = new Hono();
  app.route("/api/crm/documents", crmDocumentsRoutes);
  app.route("/api/docs", docShareRoutes);
  app.route("/api/docs", docsRoutes);
  app.route("/api/public/doc", docPublicRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-ev" }).returning();
  tenantId = t.id;
  ana = (await testDb.insert(users).values({ tenantId, email: "ana@alfa.md", passwordHash: "x", name: "Ana", role: "admin" }).returning())[0].id;
  bogdan = (await testDb.insert(users).values({ tenantId, email: "bo@alfa.md", passwordHash: "x", name: "Bogdan", role: "teacher" }).returning())[0].id;
  const [p] = await testDb.insert(crmPipelines).values({ tenantId, name: "Vânzări", orderIndex: 0, isDefault: true }).returning();
  pipelineId = p.id;
  await testDb.insert(crmPipelineStages).values(
    STAGES.map((s) => ({ tenantId, pipelineId, probabilityPct: 10, isWon: false, isLost: false, ...s }))
  );
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(docDocumentLines);
  await testDb.delete(docDocuments);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  await testDb.delete(crmProducts);
  currentUser = { id: ana, tenantId, role: "admin", email: "ana@alfa.md", name: "Ana" };
});

async function leadAt(stage: string) {
  return (
    await testDb.insert(leads).values({ tenantId, pipelineId, fullName: "Tatiana", company: "Medlife SRL", stage, assignedTo: bogdan }).returning()
  )[0];
}

async function finalDoc(leadId: string, kind: "oferta_comerciala" | "contract_servicii") {
  const [product] = await testDb
    .insert(crmProducts)
    .values({ tenantId, name: "Training", unit: "buc", listPriceCents: 1_000_00, vatPercent: "0", currency: "MDL" })
    .returning();
  const created = await call("POST", "/api/crm/documents", { leadId, kind, items: [{ productId: product.id, quantity: 1 }] });
  const id = created.body.id as string;
  const fin = await call("POST", `/api/docs/documents/${id}/finalize`, { confirm: true });
  expect(fin.status).toBe(200);
  return id;
}

const history = (leadId: string) =>
  testDb.select().from(leadInteractions).where(and(eq(leadInteractions.leadId, leadId), eq(leadInteractions.tenantId, tenantId)));

describe("targetStageFor — reguli pure", () => {
  const rows = STAGES.map((s, i) => ({ id: String(i), isWon: false, isLost: false, ...s }));
  it("[blocant] oferta trimisă mută leadul în etapa de ofertă, doar înainte", () => {
    expect(targetStageFor({ kind: "oferta_comerciala" }, "sent", "contactat", rows)?.key).toBe("oferta");
    expect(targetStageFor({ kind: "oferta_comerciala" }, "sent", "negociere", rows)).toBeNull();
  });
  it("[blocant] contractul semnat câștigă leadul; un lead pierdut rămâne pierdut", () => {
    expect(targetStageFor({ kind: "contract_servicii" }, "signed", "negociere", rows)?.key).toBe("castigat");
    expect(targetStageFor({ kind: "contract_servicii" }, "signed", "pierdut", rows)).toBeNull();
  });
  it("oferta semnată sau refuzată nu mută nimic — decizia e a omului", () => {
    expect(targetStageFor({ kind: "oferta_comerciala" }, "signed", "oferta", rows)).toBeNull();
    expect(targetStageFor({ kind: "oferta_comerciala" }, "rejected", "oferta", rows)).toBeNull();
  });
});

describe("CRM-D05 — pe lead, prin rutele reale", () => {
  it("[blocant] crearea actului apare în istoricul leadului", async () => {
    const lead = await leadAt("new");
    await finalDoc(lead.id, "oferta_comerciala");
    const rows = await history(lead.id);
    // „Oferta … a fost creatĂ" — acordul cu genul actului, nu „creat" pentru orice.
    expect(rows.some((r) => r.type === "system" && /^Oferta .* a fost creată ca ciornă\.$/.test(r.body ?? ""))).toBe(true);
  });

  it("[blocant] contractul semnat mută leadul în „câștigat”, cu rândul de etapă pe care îl numără rapoartele", async () => {
    const lead = await leadAt("negociere");
    const id = await finalDoc(lead.id, "contract_servicii");
    const res = await call("POST", `/api/docs/documents/${id}/outcome`, { status: "signed" });
    expect(res.status).toBe(200);
    expect(res.body.leadMovedTo).toBe("castigat");
    const [fresh] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(fresh.stage).toBe("castigat");
    const change = (await history(lead.id)).find((r) => r.type === "stage_change");
    expect(change?.metadata).toMatchObject({ from: "negociere", to: "castigat" });
    expect(String(change?.body)).toMatch(/semnat/);
  });

  it("[blocant] refuzul intră în istoric cu motivul, fără să mute leadul", async () => {
    const lead = await leadAt("oferta");
    const id = await finalDoc(lead.id, "oferta_comerciala");
    await call("POST", `/api/docs/documents/${id}/outcome`, { status: "rejected", reason: "Preț peste buget" });
    const [fresh] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(fresh.stage).toBe("oferta");
    expect((await history(lead.id)).some((r) => /refuzată: Preț peste buget/.test(r.body ?? ""))).toBe(true);
  });

  it("[blocant] clientul deschide linkul → istoric + notificare la responsabil, o singură dată", async () => {
    const lead = await leadAt("oferta");
    const id = await finalDoc(lead.id, "oferta_comerciala");
    const share = await call("POST", `/api/docs/${id}/share`);
    const token = share.body.token as string;
    await app.request(`/api/public/doc/${token}`);
    await app.request(`/api/public/doc/${token}`); // a doua deschidere nu mai anunță
    const viewed = (await history(lead.id)).filter((r) => /Clientul a deschis/.test(r.body ?? ""));
    expect(viewed).toHaveLength(1);
    const notes = await testDb.select().from(inAppNotifications).where(eq(inAppNotifications.recipientUserId, bogdan));
    expect(notes.length).toBe(1);
    // Vizualizarea nu mută leadul: clientul n-a răspuns încă.
    const [fresh] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(fresh.stage).toBe("oferta");
  });
});

describe("CRM-D06 — clientul răspunde de pe link", () => {
  async function linkFor(id: string) {
    const share = await call("POST", `/api/docs/${id}/share`);
    return share.body.token as string;
  }
  const respond = (token: string, body: unknown) => call("POST", `/api/public/doc/${token}/respond`, body);

  it("[blocant] pagina publică spune că se poate răspunde doar la un act CRM trimis", async () => {
    const lead = await leadAt("oferta");
    const token = await linkFor(await finalDoc(lead.id, "oferta_comerciala"));
    const view = (await (await app.request(`/api/public/doc/${token}`)).json()) as Record<string, unknown>;
    expect(view.canRespond).toBe(true);
    expect(view.response).toBeNull();
  });

  it("[blocant] acceptarea semnează actul, păstrează dovada și câștigă leadul pentru un contract", async () => {
    const lead = await leadAt("negociere");
    const id = await finalDoc(lead.id, "contract_servicii");
    const token = await linkFor(id);
    const res = await respond(token, { decision: "accept", name: "Tatiana Frunze", email: "t@medlife.md" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("signed");

    const [doc] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, id));
    expect(doc.status).toBe("signed");
    const [evidence] = await testDb
      .select()
      .from(docAudit)
      .where(and(eq(docAudit.documentId, id), eq(docAudit.action, "accepted_by_counterparty")));
    const details = JSON.parse(evidence.details ?? "{}");
    expect(details).toMatchObject({ name: "Tatiana Frunze", email: "t@medlife.md" });
    expect(details.bodyHash).toBe(doc.bodyHash);

    const [fresh] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(fresh.stage).toBe("castigat");
    // Responsabilul leadului (Bogdan) află pe loc.
    const notes = await testDb.select().from(inAppNotifications).where(eq(inAppNotifications.recipientUserId, bogdan));
    expect(notes.some((n) => JSON.stringify(n).includes("acceptat"))).toBe(true);
  });

  it("[blocant] un act are un singur răspuns — al doilea clic primește 409", async () => {
    const lead = await leadAt("oferta");
    const token = await linkFor(await finalDoc(lead.id, "oferta_comerciala"));
    expect((await respond(token, { decision: "accept", name: "Ion Popescu" })).status).toBe(200);
    expect((await respond(token, { decision: "decline", name: "Ion Popescu", reason: "m-am răzgândit" })).status).toBe(409);
  });

  it("[blocant] refuzul cere motiv și numele; ajunge în istoricul leadului", async () => {
    const lead = await leadAt("oferta");
    const token = await linkFor(await finalDoc(lead.id, "oferta_comerciala"));
    const noReason = await respond(token, { decision: "decline", name: "Ion Popescu" });
    expect(noReason.status).toBe(400);
    expect(String(noReason.body.message)).toMatch(/de ce/);
    expect((await respond(token, { decision: "accept", name: "Io" })).status).toBe(400);
    expect((await respond(token, { decision: "decline", name: "Ion Popescu", reason: "Buget tăiat" })).status).toBe(200);
    expect((await history(lead.id)).some((r) => /refuzată: Buget tăiat/.test(r.body ?? ""))).toBe(true);
  });

  it("[blocant] un link revocat nu primește răspunsuri", async () => {
    const lead = await leadAt("oferta");
    const id = await finalDoc(lead.id, "oferta_comerciala");
    const token = await linkFor(id);
    await call("DELETE", `/api/docs/${id}/share`);
    expect((await respond(token, { decision: "accept", name: "Ion Popescu" })).status).toBe(404);
  });
});

describe("CRM-U03 — actul pleacă pe e-mail din partea FinFlow Documente", () => {
  it("[blocant] expeditor „<Firma> · FinFlow Documente”, răspunsuri la vânzător, buton spre pagina actului", async () => {
    process.env.APP_URL = "https://www.finflow.best";
    const lead = await leadAt("contactat");
    const id = await finalDoc(lead.id, "oferta_comerciala");
    sentEmails.length = 0;
    const res = await call("POST", `/api/docs/documents/${id}/email`, { to: "t@medlife.md", subject: "Oferta noastră" });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    const mail = sentEmails[0];
    expect(mail.from).toMatch(/· FinFlow Documente" </);
    expect(mail.replyTo).toBe("ana@alfa.md");
    expect(mail.subject).toBe("Oferta noastră");
    expect(String(mail.html)).toMatch(/href="https:\/\/www\.finflow\.best\/#\/act\/[0-9a-f-]{36}"/);
    expect(String(mail.html)).toContain("Vezi și acceptă oferta");
    // Linkul din e-mail e chiar linkul public activ al actului.
    const share = await call("POST", `/api/docs/${id}/share`);
    expect(String(mail.html)).toContain(share.body.token as string);
    // Trimiterea mută leadul în etapa de ofertă (CRM-D05).
    expect(res.body.leadMovedTo).toBe("oferta");
  });
});
