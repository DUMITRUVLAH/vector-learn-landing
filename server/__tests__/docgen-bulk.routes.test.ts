/**
 * @vitest-environment node
 *
 * DG-124 — N acte dintr-un tabel.
 *
 * Diferența față de generarea în masă existentă: acolo ies fișiere, aici ies ACTE — cu număr,
 * contraparte, sumă și loc în dosarul proiectului. Regula care salvează munca de o oră: un rând
 * stricat nu oprește lotul, ci se raportează pe poziția lui.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;

let renderCount = 0;

vi.mock("../lib/docmerge/htmlToPdf", () => ({
  htmlToPdfBuffer: async () => new TextEncoder().encode("%PDF-1.4\nx\n%%EOF"),
  BatchPdfRenderer: {
    create: async () => ({
      render: async () => {
        renderCount += 1;
        return new TextEncoder().encode("%PDF-1.4\nbatch\n%%EOF");
      },
      close: async () => {},
    }),
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-bulk" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;

  await app.request("/api/docs/templates"); // biblioteca standard
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("DG-124 — generare în masă", () => {
  it("[blocant] 40 de rânduri produc 40 de acte, salvate în registru", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      "contraparte.denumire": `Participant ${i + 1}`,
      "total.suma": "1500,00",
      "total.valuta": "MDL",
    }));

    const res = await app.request("/api/docs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "act_primire_predare", rows }),
    });
    expect(res.status).toBe(201);
    const out = (await res.json()) as { created: unknown[]; failed: unknown[]; total: number };
    expect(out.created).toHaveLength(40);
    expect(out.failed).toHaveLength(0);

    // Sunt în REGISTRU, nu doar într-un ZIP.
    const list = (await (await app.request("/api/docs/documents?limit=500")).json()) as {
      counterpartyName: string;
      totalCents: number;
    }[];
    expect(list.filter((d) => d.counterpartyName?.startsWith("Participant"))).toHaveLength(40);
    expect(list.find((d) => d.counterpartyName === "Participant 1")?.totalCents).toBe(150000);
  });

  it("[blocant] un rând stricat e raportat, restul lotului se generează", async () => {
    const res = await app.request("/api/docs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "act_primire_predare",
        rows: [
          { "contraparte.denumire": "Bun 1", "total.suma": "100,00" },
          { "contraparte.denumire": "", "total.suma": "100,00" },
          { "contraparte.denumire": "Bun 2", "total.suma": "100,00" },
        ],
      }),
    });
    const out = (await res.json()) as {
      created: { row: number }[];
      failed: { row: number; reason: string }[];
    };
    expect(out.created.map((c) => c.row)).toEqual([1, 3]);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].row).toBe(2);
    expect(out.failed[0].reason).toContain("denumirea");
  });

  it("[blocant] loturile absurde sunt refuzate, nu încearcă să ruleze", async () => {
    const res = await app.request("/api/docs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: Array.from({ length: 501 }, () => ({ "contraparte.denumire": "X" })) }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("too_many_rows");
  });

  it("[blocant] ZIP-ul folosește UN singur browser pentru tot lotul", async () => {
    const created = (await (
      await app.request("/api/docs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "act_primire_predare",
          rows: [
            { "contraparte.denumire": "Zip 1", "total.suma": "10,00" },
            { "contraparte.denumire": "Zip 2", "total.suma": "20,00" },
            { "contraparte.denumire": "Zip 3", "total.suma": "30,00" },
          ],
        }),
      })
    ).json()) as { created: { id: string }[] };

    renderCount = 0;
    const res = await app.request("/api/docs/export/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: created.created.map((c) => c.id) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(renderCount, "trei acte randate în aceeași instanță de browser").toBe(3);
  });

  it("[blocant] ZIP-ul nu scoate acte din alte organizații", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-bulk" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare" })
      .returning();

    const res = await app.request("/api/docs/export/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [foreign.id] }),
    });
    expect(res.status).toBe(404);
  });
});
