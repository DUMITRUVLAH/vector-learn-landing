/**
 * @vitest-environment node
 *
 * DG-117 — actul semnat devine cerere de plată.
 *
 * Ăsta e motivul pentru care a fost construit tot modulul: aceleași date se introduceau a treia
 * oară în formularul PAR, iar finanțele cereau documentele separat, pe e-mail. Testele verifică
 * exact transferul (beneficiar + rechizite + proiect + poziții + sumă), atașarea PDF-ului și
 * legătura în ambele sensuri — nu doar că ruta întoarce 201.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parRequests, parLineItems, parAttachments, parPayers, parProjects } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;
let projectId: string;

vi.mock("../lib/docmerge/htmlToPdf", () => ({
  htmlToPdfBuffer: async () => new TextEncoder().encode("%PDF-1.4\ndocument\n%%EOF"),
}));

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "admin", email: "ana@vector.md", name: "Ana" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

beforeAll(async () => {
  pglite = new PGlite();
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pglite.exec(stmt);
    }
  }
  testDb = drizzle(pglite, { schema });

  const { docsRoutes } = await import("../routes/docs");
  app = new Hono();
  app.route("/api/docs", docsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-par" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC", idno: "1010620000000" }).returning();
  const [p] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Digital Skills 2026", donor: "USAID", payerId: payer.id })
    .returning();
  projectId = p.id;
  const [v] = await testDb
    .insert(parVendors)
    .values({
      tenantId,
      name: 'SRL "Tehnica Nouă"',
      idnp: "1234567890123",
      iban: "MD48ML000002259A19498121",
      bank: "BC Moldindconbank SA",
    })
    .returning();
  vendorId = v.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function finalizedAct(withPdf = true) {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title: "Act de primire-predare — echipament IT",
      projectId,
      counterparty: { kind: "vendor", id: vendorId },
      lines: [
        { description: "Laptop Dell", unit: "buc", quantity: 2, unitPriceCents: 1225000 },
        { description: "Geantă", unit: "buc", quantity: 2, unitPriceCents: 45000 },
      ],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  // PDF-ul se stochează la prima descărcare — exact ca în viața reală.
  if (withPdf) await app.request(`/api/docs/documents/${id}/pdf`);
  return id;
}

describe("DG-117 — din act în cerere de plată", () => {
  it("[blocant] PAR-ul se naște cu beneficiar, rechizite, proiect, poziții și sumă", async () => {
    const docId = await finalizedAct();

    const res = await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" });
    expect(res.status).toBe(201);
    const { parId, requestNo } = (await res.json()) as { parId: string; requestNo: string };
    expect(requestNo).toMatch(/^PAR-\d{4}-\d{4}$/);

    const [par] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(par.payeeName).toBe('SRL "Tehnica Nouă"');
    expect(par.payeeIdnp).toBe("1234567890123");
    expect(par.payeeIban).toBe("MD48ML000002259A19498121");
    expect(par.payeeBank).toBe("BC Moldindconbank SA");
    expect(par.vendorId).toBe(vendorId);
    expect(par.projectId).toBe(projectId);
    expect(par.status).toBe("draft");
    expect(par.totalEstimatedCents).toBe(2540000);
    expect(par.endUse).toContain("Act de primire-predare");
    expect(par.endUse).toMatch(/ACT-\d{4}-\d{4}/);

    const lines = await testDb.select().from(parLineItems).where(eq(parLineItems.parId, parId));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.description).sort()).toEqual(["Geantă", "Laptop Dell"]);
  });

  it("[blocant] PDF-ul actului ajunge în atașamentele cererii", async () => {
    const docId = await finalizedAct();
    const res = await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" });
    const { parId, attachmentAdded } = (await res.json()) as { parId: string; attachmentAdded: boolean };

    expect(attachmentAdded).toBe(true);
    const attachments = await testDb
      .select()
      .from(parAttachments)
      .where(eq(parAttachments.parId, parId));
    expect(attachments).toHaveLength(1);
    expect(attachments[0].fileName).toMatch(/\.pdf$/);
    expect(attachments[0].fileUrl.startsWith("data:application/pdf")).toBe(true);
  });

  it("[blocant] legătura se vede din act, iar jurnalul o consemnează", async () => {
    const docId = await finalizedAct();
    const res = await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" });
    const { parId } = (await res.json()) as { parId: string };

    const doc = (await (await app.request(`/api/docs/documents/${docId}`)).json()) as {
      links: { toKind: string; toParId: string | null }[];
      audit: { action: string }[];
    };
    expect(doc.links.some((l) => l.toKind === "par" && l.toParId === parId)).toBe(true);
    expect(doc.audit.map((a) => a.action)).toContain("converted_to_par");
  });

  it("[blocant] o ciornă nu poate deveni cerere de plată", async () => {
    const created = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "act_primire_predare",
        title: "Ciornă",
        counterparty: { kind: "vendor", id: vendorId },
        lines: [{ description: "X", quantity: 1, unitPriceCents: 1000 }],
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const res = await app.request(`/api/docs/documents/${id}/to-par`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("document_not_final");
  });

  it("[blocant] al doilea PAR din același act cere confirmare explicită", async () => {
    const docId = await finalizedAct();
    await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" });

    const second = await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; parId: string };
    expect(body.error).toBe("already_converted");
    expect(body.parId).toBeTruthy();

    // Cu confirmare, se poate — dublurile intenționate există (plăți în tranșe).
    const forced = await app.request(`/api/docs/documents/${docId}/to-par?force=1`, { method: "POST" });
    expect(forced.status).toBe(201);
  });

  it("[blocant] actul altui tenant nu se convertește", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt ONG", slug: "alt-par" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare", status: "final" })
      .returning();

    const res = await app.request(`/api/docs/documents/${foreign.id}/to-par`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
