/**
 * @vitest-environment node
 *
 * DG-111 — poarta de dinaintea semnării.
 *
 * Ce apără: un act de plată nu are voie să plece la semnat cu IBAN-ul gol sau greșit. Prins aici,
 * costă 30 de secunde; prins după plată, costă un transfer returnat și o discuție cu banca.
 *
 * Ce NU blochează, deliberat: câmpurile care se completează cu pixul (semnătura administratorului
 * nostru, locul întocmirii). O poartă care oprește totul e o poartă pe care oamenii o ocolesc.
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

/** Șablonul cere IBAN și cod fiscal — adică exact datele care trimit banii undeva. */
const BODY = "<p>{{contraparte.denumire}}, cod fiscal {{contraparte.idno}}, IBAN {{contraparte.iban}}</p><p>Semnat: {{noi.administrator}}</p>";

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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-val" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "manager" })
    .returning();
  userId = u.id;

  const [tpl] = await testDb
    .insert(docmergeTemplates)
    .values({ tenantId, name: "Act de plată", bodyHtml: BODY, placeholders: "[]", kind: "act_primire_predare" })
    .returning();
  templateId = tpl.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function vendor(fields: Record<string, string | null>) {
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "Furnizor", ...fields } as never)
    .returning();
  return v.id;
}

async function draftWith(vendorId: string) {
  const res = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      kind: "act_primire_predare",
      title: "Act",
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 100000 }],
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

describe("DG-111 — nimic nu se semnează cu rechizite lipsă sau greșite", () => {
  it("[blocant] IBAN lipsă din fișa furnizorului oprește finalizarea, pe nume", async () => {
    const id = await draftWith(await vendor({ idnp: "1234567890123", iban: null }));
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; missing: string[] };
    expect(body.error).toBe("incomplete");
    expect(body.missing.join(" ")).toContain("IBAN contraparte");
    // Mesajul e citibil, nu „contraparte.iban".
    expect(body.missing.join(" ")).not.toContain("contraparte.iban");

    const after = (await (await app.request(`/api/docs/documents/${id}`)).json()) as { status: string };
    expect(after.status).toBe("draft");
  });

  it("[blocant] un IBAN cu cifră de control greșită e oprit, deși câmpul e completat", async () => {
    const id = await draftWith(
      await vendor({ idnp: "1234567890123", iban: "MD00ML000002259A19498121" })
    );
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing.join(" ")).toMatch(/IBAN contraparte/);
  });

  it("[blocant] cu rechizitele complete și corecte, actul se finalizează", async () => {
    const id = await draftWith(
      await vendor({ idnp: "1234567890123", iban: "MD48ML000002259A19498121" })
    );
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { status: string; docNumber: string; bodyHtml: string };
    expect(doc.status).toBe("final");
    expect(doc.docNumber).toMatch(/^ACT-\d{4}-\d{4}$/);
    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");
  });

  it("[blocant] un câmp care se completează cu pixul NU blochează semnarea", async () => {
    // Șablonul cere {{noi.administrator}}, pe care nicio sursă nu-l umple: pe act devine rând de
    // completat, nu motiv de refuz. Altfel poarta ar opri fiecare act al fiecărei organizații.
    const id = await draftWith(
      await vendor({ idnp: "1234567890123", iban: "MD48ML000002259A19498121" })
    );
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { bodyHtml: string };
    expect(doc.bodyHtml).toContain("__________");
  });

  it("[blocant] act fără poziții sau cu sumă zero — oprit", async () => {
    const vid = await vendor({ idnp: "1234567890123", iban: "MD48ML000002259A19498121" });
    const created = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        kind: "act_primire_predare",
        title: "Act gol",
        counterparty: { kind: "vendor", id: vid },
        lines: [],
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { missing: string[] }).missing.join(" ")).toContain("poziție");
  });
});
