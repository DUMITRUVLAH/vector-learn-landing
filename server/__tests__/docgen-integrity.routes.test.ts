/**
 * @vitest-environment node
 *
 * DG-114 — sigiliul actului.
 *
 * „Imutabil" nu înseamnă doar că API-ul refuză un PUT: înseamnă că, dacă cineva umblă direct în
 * bază (un script, o migrare greșită, un admin grăbit), se VEDE. De asta amprenta se verifică la
 * fiecare citire, nu se afișează doar ca decor.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;

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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-seal" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL Alfa", idnp: "1111111111111", iban: "MD48ML000002259A19498121" })
    .returning();
  vendorId = v.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function finalized() {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title: "Act sigilat",
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 500000 }],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  return id;
}

describe("DG-114 — amprenta actului", () => {
  it("[blocant] un act finalizat e sigilat, iar sigiliul se verifică la citire", async () => {
    const id = await finalized();
    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      integrity: { sealed: boolean; valid: boolean; hash: string };
    };
    expect(doc.integrity.sealed).toBe(true);
    expect(doc.integrity.valid).toBe(true);
    expect(doc.integrity.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[blocant] o modificare făcută DIRECT în bază se vede ca sigiliu rupt", async () => {
    const id = await finalized();
    await testDb
      .update(schema.docDocuments)
      .set({ bodyHtml: "<p>Text schimbat pe furiș</p>" })
      .where(eq(schema.docDocuments.id, id));

    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      integrity: { sealed: boolean; valid: boolean };
    };
    expect(doc.integrity.sealed).toBe(true);
    expect(doc.integrity.valid, "actul modificat în bază trebuie semnalat").toBe(false);
  });

  it("[blocant] schimbarea unei poziții rupe la fel sigiliul", async () => {
    const id = await finalized();
    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      lines: { id: string }[];
    };
    await testDb
      .update(schema.docDocumentLines)
      .set({ quantity: 99, lineTotalCents: 49500000 })
      .where(eq(schema.docDocumentLines.id, doc.lines[0].id));

    const after = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      integrity: { valid: boolean };
    };
    expect(after.integrity.valid).toBe(false);
  });

  it("[normal] o ciornă nu e sigilată — nu are ce garanta", async () => {
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
    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      integrity: { sealed: boolean };
    };
    expect(doc.integrity.sealed).toBe(false);
  });
});
