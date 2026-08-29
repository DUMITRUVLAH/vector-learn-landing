/**
 * @vitest-environment node
 *
 * DG-106 — biblioteca standard.
 *
 * Valoarea pe care o apără: organizația începe cu acte gata scrise, nu cu o pagină goală, iar
 * formularea pe care se sprijină toate actele viitoare nu poate fi stricată din trei click-uri.
 * Testele invocă rutele reale: instalarea (idempotentă), refuzul editării/ștergerii, clonarea, și
 * — cel mai important — că un act generat din șablonul standard chiar conține rechizitele.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "ana@vector.md" });
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
  const { docmergeTemplatesRoutes } = await import("../routes/docmergeTemplates");
  app = new Hono();
  app.route("/api/docs", docsRoutes);
  app.route("/api/docmerge", docmergeTemplatesRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-sys" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "manager" })
    .returning();
  userId = u.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("DG-106 — organizația începe cu acte gata scrise", () => {
  it("[blocant] prima deschidere a bibliotecii instalează șabloanele standard", async () => {
    const res = await app.request("/api/docs/templates");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string; isSystem: boolean; kind: string }[];

    expect(list.length).toBeGreaterThanOrEqual(11);
    expect(list.every((t) => t.isSystem)).toBe(true);
    expect(list.map((t) => t.name)).toContain("Act de primire-predare — bunuri");
    expect(list.map((t) => t.name)).toContain("Contract de prestări servicii");
    expect(list.some((t) => t.kind === "act_primire_predare")).toBe(true);
  });

  it("[blocant] a doua deschidere NU duplică nimic", async () => {
    const before = ((await (await app.request("/api/docs/templates")).json()) as unknown[]).length;
    const after = ((await (await app.request("/api/docs/templates")).json()) as unknown[]).length;
    expect(after).toBe(before);
  });

  it("[blocant] șablonul de act de primire-predare conține rechizitele ambelor părți", async () => {
    const list = (await (await app.request("/api/docs/templates")).json()) as {
      id: string;
      name: string;
      placeholders: string[];
    }[];
    const act = list.find((t) => t.name === "Act de primire-predare — bunuri")!;
    for (const field of [
      "noi.denumire",
      "noi.idno",
      "contraparte.denumire",
      "contraparte.idno",
      "contraparte.iban",
      "contraparte.banca",
      "total.suma",
      "total.in_litere",
      "document.numar",
    ]) {
      expect(act.placeholders, `șablonul standard nu folosește ${field}`).toContain(field);
    }
  });

  it("[blocant] un act generat din șablonul standard iese completat, fără acolade", async () => {
    const list = (await (await app.request("/api/docs/templates")).json()) as { id: string; name: string }[];
    const act = list.find((t) => t.name === "Act de primire-predare — bunuri")!;

    const res = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: act.id,
        kind: "act_primire_predare",
        title: "Act — laptopuri",
        counterparty: { kind: "vendor", name: 'SRL "Tehnica Nouă"' },
        context: {
          "noi.denumire": "Asociația ATIC",
          "noi.idno": "1010600000000",
          "noi.adresa": "mun. Chișinău, str. Ștefan cel Mare 1",
          "noi.administrator": "Irina Oriol",
          "contraparte.denumire": 'SRL "Tehnica Nouă"',
          "contraparte.idno": "1234567890123",
          "contraparte.iban": "MD48ML000002259A19498121",
          "contraparte.banca": "BC Moldindconbank SA",
          "contraparte.bic": "MOLDMD2X309",
          "contraparte.adresa": "bd. Dacia 45",
          "contraparte.administrator": "Andrei Rusu",
          "document.numar": "ACT-2026-0001",
          "document.data": "12.03.2026",
          "document.loc": "mun. Chișinău",
          "document.baza": "contractul nr. 14 din 02.02.2026",
          "proiect.nume": "Digital Skills 2026",
          "proiect.donator": "USAID",
          "total.suma": "24 500,00",
          "total.valuta": "MDL",
          "total.in_litere": "douăzeci și patru de mii cinci sute lei 00 bani",
        },
        lines: [{ description: "Laptop Dell", quantity: 2, unitPriceCents: 1225000 }],
      }),
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { bodyHtml: string };

    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");
    expect(doc.bodyHtml).toContain("1234567890123");
    // Suma în litere e calculată de server din pozițiile actului, NU preluată din context —
    // de-asta apare forma corectă („cinci sute DE lei"), chiar dacă clientul a trimis alta.
    expect(doc.bodyHtml).toContain("douăzeci și patru de mii cinci sute de lei 00 bani");
    expect(doc.bodyHtml, "niciun câmp nu rămâne necompletat pe actul trimis la semnat").not.toContain("{{");
  });

  it("[blocant] șablonul standard nu poate fi editat sau șters", async () => {
    const list = (await (await app.request("/api/docs/templates")).json()) as { id: string; isSystem: boolean }[];
    const sys = list.find((t) => t.isSystem)!;

    const put = await app.request(`/api/docmerge/templates/${sys.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: "<p>stricat</p>" }),
    });
    expect(put.status).toBe(403);

    const del = await app.request(`/api/docmerge/templates/${sys.id}`, { method: "DELETE" });
    expect(del.status).toBe(403);

    const [row] = await testDb.select().from(docmergeTemplates).where(eq(docmergeTemplates.id, sys.id));
    expect(row.bodyHtml).not.toContain("stricat");
  });

  it("[blocant] clonarea dă o copie editabilă, iar originalul rămâne intact", async () => {
    const list = (await (await app.request("/api/docs/templates")).json()) as { id: string; name: string; isSystem: boolean }[];
    const sys = list.find((t) => t.isSystem)!;

    const res = await app.request(`/api/docs/templates/${sys.id}/clone`, { method: "POST" });
    expect(res.status).toBe(201);
    const copy = (await res.json()) as { id: string; name: string; isSystem: boolean; bodyHtml: string };
    expect(copy.isSystem).toBe(false);
    expect(copy.name).toBe(`${sys.name} (copie)`);

    const put = await app.request(`/api/docmerge/templates/${copy.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: "<p>varianta noastră</p>" }),
    });
    expect(put.status).toBe(200);

    const [original] = await testDb.select().from(docmergeTemplates).where(eq(docmergeTemplates.id, sys.id));
    expect(original.bodyHtml).not.toContain("varianta noastră");
  });
});
