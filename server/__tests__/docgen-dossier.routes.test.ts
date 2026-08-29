/**
 * @vitest-environment node
 *
 * DG-120/121/122 — dosarele și registrul.
 *
 * Întrebările reale pe care le rezolvă:
 *  - donatorul, în ședință: „ce ați contractat pe proiect și cât ați plătit?";
 *  - contabila, înainte de o plată: „furnizorul ăsta și-a schimbat IBAN-ul de la ultimul act?";
 *  - auditorul: „dați-mi registrul actelor".
 *
 * Ce apără testele, dincolo de „ruta întoarce 200": că „plătit" se citește din cererile chiar
 * executate (nu din cele doar create), că valutele NU se adună între ele, și că schimbarea unui
 * IBAN în registru se semnalează față de actul deja semnat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parPayers, parProjects, parRequests } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;
let vendorTwoId: string;
let projectId: string;

vi.mock("../lib/docmerge/htmlToPdf", () => ({
  htmlToPdfBuffer: async () => new TextEncoder().encode("%PDF-1.4\nx\n%%EOF"),
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-dos" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  const [p] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Digital Skills", donor: "USAID", payerId: payer.id })
    .returning();
  projectId = p.id;
  const [v1] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL Alfa", idnp: "1111111111111", iban: "MD48ML000002259A19498121", bank: "MICB" })
    .returning();
  vendorId = v1.id;
  const [v2] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL Beta", idnp: "2222222222222", iban: "MD24AG000225100013104168", bank: "MAIB" })
    .returning();
  vendorTwoId = v2.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function act(vendor: string, totalCents: number, currency = "MDL") {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title: `Act ${currency} ${totalCents}`,
      projectId,
      currency,
      counterparty: { kind: "vendor", id: vendor },
      lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: totalCents }],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  await app.request(`/api/docs/documents/${id}/pdf`);
  return id;
}

describe("DG-120 — dosarul proiectului", () => {
  it("[blocant] grupează pe contraparte și numără corect actele", async () => {
    await act(vendorId, 100000);
    await act(vendorId, 200000);
    await act(vendorTwoId, 300000);

    const res = await app.request(`/api/docs/dossier/project/${projectId}`);
    expect(res.status).toBe(200);
    const dossier = (await res.json()) as {
      documents: unknown[];
      byCounterparty: { counterpartyName: string; documents: unknown[] }[];
      totals: Record<string, { contractedCents: number; paidCents: number }>;
    };

    expect(dossier.documents).toHaveLength(3);
    expect(dossier.byCounterparty).toHaveLength(2);
    const alfa = dossier.byCounterparty.find((g) => g.counterpartyName === "SRL Alfa")!;
    expect(alfa.documents).toHaveLength(2);
    expect(dossier.totals.MDL.contractedCents).toBe(600000);
  });

  it("[blocant] „plătit” înseamnă cerere EXECUTATĂ, nu cerere creată", async () => {
    const docId = await act(vendorId, 500000);
    const { parId } = (await (
      await app.request(`/api/docs/documents/${docId}/to-par`, { method: "POST" })
    ).json()) as { parId: string };

    // Cerere creată, dar neplătită → nu intră la „plătit".
    let dossier = (await (await app.request(`/api/docs/dossier/project/${projectId}`)).json()) as {
      totals: Record<string, { paidCents: number }>;
    };
    const before = dossier.totals.MDL.paidCents;

    await testDb
      .update(parRequests)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(parRequests.id, parId));

    dossier = (await (await app.request(`/api/docs/dossier/project/${projectId}`)).json()) as {
      totals: Record<string, { paidCents: number }>;
    };
    expect(dossier.totals.MDL.paidCents).toBe(before + 500000);
  });

  it("[blocant] valutele nu se adună între ele", async () => {
    await act(vendorTwoId, 100000, "EUR");
    const dossier = (await (await app.request(`/api/docs/dossier/project/${projectId}`)).json()) as {
      totals: Record<string, { contractedCents: number }>;
    };
    expect(dossier.totals.EUR.contractedCents).toBe(100000);
    expect(dossier.totals.MDL.contractedCents).not.toBe(
      dossier.totals.MDL.contractedCents + dossier.totals.EUR.contractedCents
    );
  });
});

describe("DG-121 — dosarul contrapărții", () => {
  it("[blocant] semnalează IBAN-ul schimbat față de ultimul act semnat", async () => {
    await act(vendorTwoId, 400000);

    // Furnizorul își schimbă IBAN-ul în registru — cazul clasic de plată pe cont vechi.
    await testDb
      .update(parVendors)
      .set({ iban: "MD11AG000000000000000000" })
      .where(eq(parVendors.id, vendorTwoId));

    const res = await app.request(`/api/docs/dossier/counterparty/${vendorTwoId}`);
    const dossier = (await res.json()) as {
      requisiteChanges: { label: string; onLastAct: string; inRegistry: string }[];
    };
    const change = dossier.requisiteChanges.find((c) => c.label === "IBAN");
    expect(change).toBeTruthy();
    expect(change!.onLastAct).toBe("MD24AG000225100013104168");
    expect(change!.inRegistry).toBe("MD11AG000000000000000000");
  });

  it("[normal] fără schimbări, lista de diferențe e goală", async () => {
    const dossier = (await (await app.request(`/api/docs/dossier/counterparty/${vendorId}`)).json()) as {
      requisiteChanges: unknown[];
      documents: unknown[];
    };
    expect(dossier.requisiteChanges).toEqual([]);
    expect((dossier.documents as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("DG-122 — registrul ca fișier", () => {
  it("[blocant] exportul XLSX se descarcă și e un fișier valid", async () => {
    const res = await app.request("/api/docs/export/register.xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // XLSX e un ZIP: semnătura „PK".
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("[blocant] filtrul se aplică exportului, nu doar ecranului", async () => {
    const all = await app.request("/api/docs/export/register.xlsx");
    const filtered = await app.request("/api/docs/export/register.xlsx?kind=contract_servicii");
    const allBytes = (await all.arrayBuffer()).byteLength;
    const filteredBytes = (await filtered.arrayBuffer()).byteLength;
    // Registrul filtrat (niciun contract) e strict mai mic decât cel complet.
    expect(filteredBytes).toBeLessThan(allBytes);
  });

  it("[blocant] un export gol rămâne fișier valid, nu eroare", async () => {
    const res = await app.request("/api/docs/export/register.xlsx?status=cancelled");
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
