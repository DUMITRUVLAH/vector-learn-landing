/**
 * @vitest-environment node
 *
 * DG-112 — PDF-ul actului.
 *
 * Trei promisiuni, testate separat:
 *  1. un act finalizat produce un PDF real (`%PDF`), cu numele fișierului lizibil;
 *  2. PDF-ul se STOCHEAZĂ: a doua descărcare nu re-randează, deci actul descărcat peste un an
 *     arată exact ca cel semnat, chiar dacă șablonul s-a schimbat între timp;
 *  3. lipsa chromium-ului (serverless) NU e o eroare: se servește HTML tipăribil.
 *
 * Randarea e mock-uită deliberat: aici verificăm CONTRACTUL rutei (stocare, antet, fallback), nu
 * dacă Playwright desenează corect — ăla e testul lui, și n-are ce căuta într-o suită care trebuie
 * să ruleze în CI fără browser.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parSettings, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;

/** Câte apeluri a primit randarea — dovada că a doua descărcare vine din stocare. */
const renderCalls = { count: 0 };
let renderReturnsNull = false;

vi.mock("../lib/docmerge/htmlToPdf", () => ({
  htmlToPdfBuffer: async () => {
    renderCalls.count += 1;
    if (renderReturnsNull) return null;
    // Un PDF minim, dar valid ca semnătură de fișier.
    return new TextEncoder().encode("%PDF-1.4\n%…document…\n%%EOF");
  },
}));

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "ana@vector.md", name: "Ana" });
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-pdf" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parSettings).values({ tenantId, orgLegalName: "Asociația ATIC" });
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL Tehnica Nouă", idnp: "1234567890123", iban: "MD48ML000002259A19498121" })
    .returning();
  vendorId = v.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function finalizedDoc() {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title: "Act de primire-predare — echipament",
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Laptop", quantity: 1, unitPriceCents: 1225000 }],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  return id;
}

describe("DG-112 — actul ca PDF", () => {
  it("[blocant] un act finalizat se descarcă drept PDF, cu nume de fișier lizibil", async () => {
    renderReturnsNull = false;
    const id = await finalizedDoc();

    const res = await app.request(`/api/docs/documents/${id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="ACT-\d{4}-\d{4}.*\.pdf"/);

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("[blocant] a doua descărcare vine din stocare, nu dintr-o randare nouă", async () => {
    renderReturnsNull = false;
    const id = await finalizedDoc();

    renderCalls.count = 0;
    await app.request(`/api/docs/documents/${id}/pdf`);
    expect(renderCalls.count).toBe(1);

    const second = await app.request(`/api/docs/documents/${id}/pdf`);
    expect(second.status).toBe(200);
    expect(renderCalls.count, "actul semnat nu se re-randează la fiecare descărcare").toBe(1);
  });

  it("[blocant] fără chromium se servește HTML tipăribil, nu o eroare", async () => {
    renderReturnsNull = true;
    const id = await finalizedDoc();

    const res = await app.request(`/api/docs/documents/${id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Pdf-Fallback")).toBe("html");
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Act de primire-predare");
    renderReturnsNull = false;
  });

  it("[blocant] actul altei organizații nu se descarcă", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt ONG", slug: "alt-pdf" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare" })
      .returning();

    const res = await app.request(`/api/docs/documents/${foreign.id}/pdf`);
    expect(res.status).toBe(404);
  });

  it("[normal] descărcarea lasă urmă în jurnal", async () => {
    renderReturnsNull = false;
    const id = await finalizedDoc();
    await app.request(`/api/docs/documents/${id}/pdf`);

    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      audit: { action: string }[];
    };
    expect(doc.audit.map((a) => a.action)).toContain("downloaded");
  });
});
