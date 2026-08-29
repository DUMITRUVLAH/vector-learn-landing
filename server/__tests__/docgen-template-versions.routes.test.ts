/**
 * @vitest-environment node
 *
 * DG-107 — versionare și previzualizare.
 *
 * Regula pe care o apără: un act semnat nu se schimbă când șablonul evoluează. Deci fiecare
 * salvare care atinge corpul creează o versiune nouă, cu conținutul păstrat; documentul reține
 * versiunea cu care s-a generat; iar revenirea la o versiune veche NU rescrie istoricul, ci
 * adaugă o versiune nouă cu acel conținut.
 *
 * Previzualizarea se testează cu un furnizor REAL, pentru că exact acolo se vede ce lipsește din
 * fișa lui — cu date inventate, orice șablon arată perfect.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors } from "../db/schema/par";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let templateId: string;
let vendorId: string;
let vendorNoIbanId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "ana@vector.md", name: "Ana Contabil" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

const BODY_V1 = "<h1>ACT</h1><p>{{contraparte.denumire}} · IBAN {{contraparte.iban}}</p>";
const BODY_V2 = "<h1>ACT (revizuit)</h1><p>{{contraparte.denumire}} · cod fiscal {{contraparte.idno}}</p>";

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
  const { docmergeTemplatesRoutes } = await import("../routes/docmergeTemplates");
  app = new Hono();
  app.route("/api/docs", docsRoutes);
  app.route("/api/docmerge", docmergeTemplatesRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-ver" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana Contabil", role: "manager" })
    .returning();
  userId = u.id;

  const [tpl] = await testDb
    .insert(docmergeTemplates)
    .values({ tenantId, name: "Act propriu", bodyHtml: BODY_V1, placeholders: "[]", kind: "act_primire_predare" })
    .returning();
  templateId = tpl.id;

  const [v] = await testDb
    .insert(parVendors)
    .values({
      tenantId,
      name: 'SRL "Tehnica Nouă"',
      idnp: "1234567890123",
      iban: "MD48ML000002259A19498121",
      bank: "BC Moldindconbank SA",
      bicSwift: "MOLDMD2X309",
      legalAddress: "mun. Chișinău, bd. Dacia 45",
      administratorName: "Andrei Rusu",
    })
    .returning();
  vendorId = v.id;

  const [v2] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "II Fără Rechizite", idnp: "1002004006008" })
    .returning();
  vendorNoIbanId = v2.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("DG-107 — versiunile șablonului", () => {
  it("[blocant] o salvare care schimbă corpul creează versiunea următoare", async () => {
    const res = await app.request(`/api/docmerge/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: BODY_V2 }),
    });
    expect(res.status).toBe(200);
    const tpl = (await res.json()) as { version: number };
    expect(tpl.version).toBe(2);

    const versions = (await (await app.request(`/api/docs/templates/${templateId}/versions`)).json()) as {
      version: number;
    }[];
    expect(versions[0].version).toBe(2);
  });

  it("[blocant] o salvare care NU atinge corpul nu inventează o versiune", async () => {
    const before = ((await (await app.request(`/api/docs/templates/${templateId}/versions`)).json()) as unknown[]).length;
    await app.request(`/api/docmerge/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Act propriu (redenumit)" }),
    });
    const after = ((await (await app.request(`/api/docs/templates/${templateId}/versions`)).json()) as unknown[]).length;
    expect(after).toBe(before);
  });

  it("[blocant] actul generat rămâne pe versiunea lui, chiar dacă șablonul merge mai departe", async () => {
    const created = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        kind: "act_primire_predare",
        title: "Act generat pe v2",
        counterparty: { kind: "vendor", name: "X" },
        context: { "contraparte.denumire": "X", "contraparte.idno": "1234567890123" },
        lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 100000 }],
      }),
    });
    const doc = (await created.json()) as { id: string; templateVersion: number; bodyHtml: string };
    expect(doc.templateVersion).toBe(2);
    expect(doc.bodyHtml).toContain("ACT (revizuit)");

    // Șablonul evoluează la v3…
    await app.request(`/api/docmerge/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: "<h1>ALTCEVA</h1>" }),
    });

    // …dar actul rămâne exact cum a fost generat.
    const after = (await (await app.request(`/api/docs/documents/${doc.id}`)).json()) as {
      templateVersion: number;
      bodyHtml: string;
    };
    expect(after.templateVersion).toBe(2);
    expect(after.bodyHtml).toContain("ACT (revizuit)");
    expect(after.bodyHtml).not.toContain("ALTCEVA");
  });

  it("[blocant] revenirea la o versiune veche adaugă o versiune nouă, nu rescrie istoricul", async () => {
    const before = (await (await app.request(`/api/docs/templates/${templateId}/versions`)).json()) as {
      version: number;
    }[];
    const res = await app.request(`/api/docs/templates/${templateId}/restore/2`, { method: "POST" });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { version: number; restoredFrom: number };
    expect(out.restoredFrom).toBe(2);
    expect(out.version).toBe(before[0].version + 1);

    const after = (await (await app.request(`/api/docs/templates/${templateId}/versions`)).json()) as {
      version: number;
    }[];
    expect(after.length).toBe(before.length + 1);
    expect(after.map((v) => v.version)).toContain(2); // vechea versiune e încă acolo
  });
});

describe("DG-107 — previzualizarea", () => {
  it("[blocant] cu date de exemplu, nu rămâne niciun câmp necompletat", async () => {
    const res = await app.request(`/api/docs/templates/${templateId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const { html } = (await res.json()) as { html: string };
    expect(html).not.toContain("{{");
  });

  it("[blocant] cu un furnizor real, apar rechizitele LUI, nu exemplul", async () => {
    await app.request(`/api/docs/templates/${templateId}/restore/1`, { method: "POST" });
    const res = await app.request(`/api/docs/templates/${templateId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId }),
    });
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain("Tehnica Nouă");
    expect(html).toContain("MD48ML000002259A19498121");
  });

  it("[blocant] un câmp lipsă din fișa furnizorului se vede ca lipsă, nu ca gol tăcut", async () => {
    const res = await app.request(`/api/docs/templates/${templateId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: vendorNoIbanId }),
    });
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain("IBAN-ul lipsește din fișa furnizorului");
  });
});
