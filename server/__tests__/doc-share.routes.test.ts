/**
 * @vitest-environment node
 * LINKUL PUBLIC AL ACTULUI ȘI SEMNALUL „VIZUALIZAT" — INTEGRATION (cerința 42).
 *
 * Caietul cere urmărirea „transmisă, vizualizată, acceptată, respinsă". Trei stări existau;
 * „vizualizată" lipsea, iar matricea spunea corect că cere „pixel de urmărire sau portal de
 * client". Pixelul a fost respins deliberat (Gmail îl trece prin proxy, Outlook îl blochează —
 * semnalul ar fi ieșit fals în ambele sensuri). Aici actul pleacă la client ca LINK: când linkul
 * e deschis, actul chiar a fost deschis.
 *
 * Ce apără testele:
 *  1. linkul altui workspace nu se creează și nu se revocă (404, nu 403);
 *  2. prima deschidere scrie momentul comercial, iar următoarele doar numără;
 *  3. linkul revocat, expirat sau inexistent dau ACELAȘI răspuns — altfel cine încearcă adrese
 *     află care au existat;
 *  4. ciornele nu se pot trimite: numărul nu e rezervat, corpul se mai schimbă;
 *  5. pagina clientului nu scoate id-uri interne și nu lasă acolade necompletate pe ecran.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { docDocuments, docDocumentLines, docAudit } from "../db/schema/docs";
import { docShareLinks } from "../db/schema/docShareLinks";

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
let tenantA: string;
let adminA: { id: string; tenantId: string; role: string; email: string };
let adminB: { id: string; tenantId: string; role: string; email: string };
let oferta: string;
let ciorna: string;
let actStrain: string;

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { docShareRoutes, docPublicRoutes } = await import("../routes/docShare");
  app = new Hono();
  app.route("/api/docs", docShareRoutes);
  app.route("/api/public/doc", docPublicRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-share" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-share" }).returning();
  tenantA = tA.id;

  const [uA] = await testDb.insert(users).values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" }).returning();
  const [uB] = await testDb.insert(users).values({ tenantId: tB.id, email: "bob@rival.md", passwordHash: "x", name: "Bob", role: "admin" }).returning();
  adminA = { id: uA.id, tenantId: tenantA, role: "admin", email: uA.email };
  adminB = { id: uB.id, tenantId: tB.id, role: "admin", email: uB.email };
  session = adminA;

  const [o] = await testDb
    .insert(docDocuments)
    .values({
      tenantId: tenantA,
      kind: "oferta_comerciala",
      docNumber: "OF-001",
      docYear: 2026,
      title: "Ofertă comercială — Training AI",
      status: "sent",
      counterpartyName: "Alfa Logistic SRL",
      totalCents: 160_000,
      currency: "MDL",
      bodyHtml: "<h1>Ofertă</h1><p>Semnat de {{noi.administrator}}</p>",
    })
    .returning();
  oferta = o.id;
  await testDb.insert(docDocumentLines).values({
    tenantId: tenantA, documentId: oferta, position: 1, description: "Training AI in-house — 1 zi",
    unit: "sesiune", quantity: 1, unitPriceCents: 160_000, lineTotalCents: 160_000, vatPercent: 20,
  });

  const [d] = await testDb
    .insert(docDocuments)
    .values({ tenantId: tenantA, kind: "oferta_comerciala", title: "Ciornă", status: "draft", totalCents: 0 })
    .returning();
  ciorna = d.id;

  const [s] = await testDb
    .insert(docDocuments)
    .values({ tenantId: tB.id, kind: "oferta_comerciala", title: "Act străin", status: "sent", totalCents: 0 })
    .returning();
  actStrain = s.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(() => {
  session = adminA;
});

const share = (id: string, method = "POST") => app.request(`/api/docs/${id}/share`, { method });
const open = (token: string) => app.request(`/api/public/doc/${token}`);

describe("Linkul actului", () => {
  it("[blocant] se creează pentru un act finalizat, o singură dată", async () => {
    const res = await share(oferta);
    expect(res.status).toBe(201);
    const link = await res.json();
    expect(link.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(link.firstViewedAt).toBeNull();
    expect(link.viewCount).toBe(0);

    // A doua cerere NU face un al doilea link: două adrese pentru același act ar însemna două
    // răspunsuri la „a văzut-o?".
    const second = await share(oferta);
    expect((await second.json()).token).toBe(link.token);

    const rows = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));
    expect(rows.length).toBe(1);
  });

  it("[blocant] ciorna nu se poate trimite clientului", async () => {
    const res = await share(ciorna);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("document_is_draft");
  });

  it("[blocant] actul altui workspace nu primește link — 404, nu 403", async () => {
    expect((await share(actStrain)).status).toBe(404);
    session = adminB;
    expect((await share(oferta)).status).toBe(404);
  });

  it("[blocant] crearea linkului lasă urmă în jurnalul actului", async () => {
    const rows = await testDb
      .select()
      .from(docAudit)
      .where(and(eq(docAudit.documentId, oferta), eq(docAudit.action, "share_link_created")));
    expect(rows.length).toBe(1);
    expect(rows[0].actorUserId).toBe(adminA.id);
    // Doar prefixul tokenului în jurnal — secretul întreg n-are ce căuta acolo.
    expect(rows[0].details).not.toContain("-");
  });
});

describe("Deschiderea de către client", () => {
  it("[blocant] prima deschidere scrie momentul comercial; a doua doar numără", async () => {
    const [link] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));

    const first = await open(link.token);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.title).toBe("Ofertă comercială — Training AI");
    expect(body.docNumber).toBe("OF-001");
    expect(body.lines.length).toBe(1);

    const [afterFirst] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.id, link.id));
    expect(afterFirst.firstViewedAt).not.toBeNull();
    expect(afterFirst.viewCount).toBe(1);

    await open(link.token);
    const [afterSecond] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.id, link.id));
    expect(afterSecond.viewCount).toBe(2);
    // Momentul primei deschideri NU se rescrie — altfel „a văzut-o acum 3 zile" ar deveni „acum".
    expect(afterSecond.firstViewedAt?.getTime()).toBe(afterFirst.firstViewedAt?.getTime());
  });

  it("[blocant] prima deschidere intră în jurnalul actului, o singură dată", async () => {
    const rows = await testDb
      .select()
      .from(docAudit)
      .where(and(eq(docAudit.documentId, oferta), eq(docAudit.action, "viewed_by_counterparty")));
    expect(rows.length).toBe(1);
    expect(rows[0].actorUserId).toBeNull();
  });

  it("[blocant] pagina clientului nu scoate id-uri interne", async () => {
    const [link] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));
    const raw = JSON.stringify(await (await open(link.token)).json());
    for (const internal of ["tenantId", "tenant_id", "counterpartySnapshot", "bodyHash", "createdByUserId", "templateId"]) {
      expect(raw, `${internal} a ieșit în pagina clientului`).not.toContain(internal);
    }
  });

  it("[blocant] acoladele necompletate nu ajung pe ecranul clientului", async () => {
    const [link] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));
    const body = await (await open(link.token)).json();
    expect(body.bodyHtml).not.toContain("{{");
    expect(body.bodyHtml).toContain("__________");
  });

  it("[blocant] linkul revocat, cel inexistent și un token stricat dau ACELAȘI răspuns", async () => {
    const [link] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));

    const revoke = await share(oferta, "DELETE");
    expect(revoke.status).toBe(200);

    const dupa = await open(link.token);
    expect(dupa.status).toBe(404);
    expect(await dupa.json()).toEqual({ error: "not_found" });

    const inexistent = await open("11111111-1111-1111-1111-111111111111");
    expect(inexistent.status).toBe(404);
    expect(await inexistent.json()).toEqual({ error: "not_found" });

    expect((await open("nu-e-uuid")).status).toBe(404);
  });

  it("[normal] recrearea linkului îl reactivează pe cel revocat, cu același token", async () => {
    const [before] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));
    const res = await share(oferta);
    expect(res.status).toBe(200);
    const link = await res.json();
    expect(link.token).toBe(before.token);
    expect(link.revokedAt).toBeNull();
    expect((await open(link.token)).status).toBe(200);
  });

  it("[normal] linkul expirat se comportă ca unul inexistent", async () => {
    const [link] = await testDb.select().from(docShareLinks).where(eq(docShareLinks.documentId, oferta));
    await testDb
      .update(docShareLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(docShareLinks.id, link.id));
    expect((await open(link.token)).status).toBe(404);
  });
});
