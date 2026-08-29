/**
 * @vitest-environment node
 *
 * DG-102 — poarta API-ului de acte. Fiecare test INVOCĂ acțiunea (§3.5.1quater), nu verifică doar
 * că ruta există: creează un act real dintr-un șablon real, îl finalizează, încearcă să-l modifice
 * după finalizare, îl anulează, și cere actul altui tenant.
 *
 * Bug-urile pe care le-ar fi prins, dacă ar reapărea:
 *  - totalul preluat din client (act semnat cu sumă falsă);
 *  - `{{...}}` rămase în corpul actului trimis la semnat;
 *  - editarea unui act finalizat (proba se schimbă după semnare);
 *  - numere de act duplicate în același an;
 *  - actele altui tenant vizibile prin id direct.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let otherTenantId: string;
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
    c.set("user", { id: userId, tenantId, role: "manager", email: "ana@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const ACT_TEMPLATE = `
<h1>ACT DE PRIMIRE-PREDARE nr. {{document.numar}}</h1>
<p>Predător: {{noi.denumire}}, IDNO {{noi.idno}}</p>
<p>Primitor: {{contraparte.denumire}}, IDNO {{contraparte.idno}}, IBAN {{contraparte.iban}}</p>
`;

/** Ajutor: creează un act cu o poziție, gata de finalizat. */
async function createDocument(overrides: Record<string, unknown> = {}) {
  const res = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      kind: "act_primire_predare",
      title: "Act de primire-predare — echipament",
      counterparty: {
        kind: "vendor",
        name: 'SRL "Tehnica Nouă"',
        snapshot: { idno: "1234567890123", iban: "MD48ML000002259A19498121", banca: "MAIB" },
      },
      context: {
        "document.numar": "—",
        "noi.denumire": "Asociația ATIC",
        "noi.idno": "1010600000000",
        "contraparte.denumire": 'SRL "Tehnica Nouă"',
        "contraparte.idno": "1234567890123",
        "contraparte.iban": "MD48ML000002259A19498121",
      },
      lines: [
        { description: "Laptop Dell Latitude", unit: "buc", quantity: 2, unitPriceCents: 1225000 },
      ],
      ...overrides,
    }),
  });
  return res;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { docsRoutes } = await import("../routes/docs");
  app = new Hono();
  app.route("/api/docs", docsRoutes); // exact prefixul din app.ts

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-docs" }).returning();
  tenantId = tenant.id;
  const [other] = await testDb.insert(tenants).values({ name: "Alt ONG", slug: "alt-ong-docs" }).returning();
  otherTenantId = other.id;

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "manager" })
    .returning();
  userId = u.id;

  const [tpl] = await testDb
    .insert(docmergeTemplates)
    .values({
      tenantId,
      name: "Act de primire-predare",
      bodyHtml: ACT_TEMPLATE,
      placeholders: "[]",
      kind: "act_primire_predare",
    })
    .returning();
  templateId = tpl.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("DG-102 — un act se naște completat, nu cu {{câmpuri}} pe el", () => {
  it("[blocant] POST creează ciorna, randează șablonul și calculează totalul pe server", async () => {
    const res = await createDocument();
    expect(res.status).toBe(201);
    const doc = (await res.json()) as {
      id: string;
      status: string;
      bodyHtml: string;
      totalCents: number;
      docNumber: string | null;
    };

    expect(doc.status).toBe("draft");
    expect(doc.docNumber, "ciornele nu consumă numere").toBeNull();
    expect(doc.bodyHtml).toContain("Tehnica Nouă");
    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");
    expect(doc.bodyHtml, "niciun câmp nerezolvat nu ajunge în act").not.toContain("{{");
    // 2 × 12.250,00 MDL — calculat din poziții, nu preluat din client.
    expect(doc.totalCents).toBe(2450000);
  });

  it("[blocant] totalul trimis de client e ignorat — sursa e tabelul de poziții", async () => {
    const res = await createDocument({ totalCents: 1 });
    const doc = (await res.json()) as { totalCents: number };
    expect(doc.totalCents).toBe(2450000);
  });
});

describe("DG-102 — finalizarea sigilează actul", () => {
  it("[blocant] finalize rezervă numărul, calculează hash-ul și schimbă starea", async () => {
    const created = await createDocument();
    const { id } = (await created.json()) as { id: string };

    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      status: string;
      docNumber: string;
      bodyHash: string;
      finalizedAt: string;
    };
    expect(doc.status).toBe("final");
    expect(doc.docNumber).toMatch(/^ACT-\d{4}-\d{4}$/);
    expect(doc.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.finalizedAt).toBeTruthy();
  });

  it("[blocant] PUT după finalizare → 409, iar corpul rămâne neatins", async () => {
    const created = await createDocument();
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const res = await app.request(`/api/docs/documents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Titlu schimbat pe furiș" }),
    });
    expect(res.status).toBe(409);

    const after = await app.request(`/api/docs/documents/${id}`);
    const doc = (await after.json()) as { title: string };
    expect(doc.title).toBe("Act de primire-predare — echipament");
  });

  it("[blocant] două acte finalizate primesc numere distincte și consecutive", async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const created = await createDocument();
      const { id } = (await created.json()) as { id: string };
      const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
      const doc = (await res.json()) as { docNumber: string };
      numbers.push(doc.docNumber);
    }
    expect(new Set(numbers).size).toBe(numbers.length);
    const seq = numbers.map((n) => Number(n.split("-")[2]));
    expect(seq[1]).toBe(seq[0] + 1);
    expect(seq[2]).toBe(seq[1] + 1);
  });

  it("[blocant] finalizări simultane nu produc numere duplicate", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const created = await createDocument();
      ids.push(((await created.json()) as { id: string }).id);
    }
    const results = await Promise.all(
      ids.map((id) => app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" }))
    );
    const numbers = await Promise.all(
      results.map(async (r) => ((await r.json()) as { docNumber: string }).docNumber)
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(numbers).size).toBe(4);
  });

  it("[blocant] un act fără poziții nu poate fi finalizat — se spune ce lipsește, în română", async () => {
    const created = await createDocument({ lines: [] });
    const { id } = (await created.json()) as { id: string };
    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; missing: string[] };
    expect(body.error).toBe("incomplete");
    expect(body.missing.join(" ")).toContain("poziție");

    const after = await app.request(`/api/docs/documents/${id}`);
    expect(((await after.json()) as { status: string }).status).toBe("draft");
  });
});

describe("DG-102 — anularea păstrează urma", () => {
  it("[blocant] cancel cere motiv, schimbă starea și lasă actul în registru", async () => {
    const created = await createDocument();
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const noReason = await app.request(`/api/docs/documents/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(noReason.status).toBe(400);

    const res = await app.request(`/api/docs/documents/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Furnizorul a schimbat IBAN-ul" }),
    });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { status: string; cancelReason: string };
    expect(doc.status).toBe("cancelled");
    expect(doc.cancelReason).toContain("IBAN");

    const list = await app.request("/api/docs/documents?status=cancelled");
    const rows = (await list.json()) as { id: string }[];
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});

describe("DG-102 — jurnal, filtre și izolare între organizații", () => {
  it("[blocant] fiecare acțiune lasă un rând de jurnal (creat, finalizat)", async () => {
    const created = await createDocument();
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const res = await app.request(`/api/docs/documents/${id}`);
    const doc = (await res.json()) as { audit: { action: string }[] };
    const actions = doc.audit.map((a) => a.action);
    expect(actions).toContain("created");
    expect(actions).toContain("finalized");
  });

  it("[blocant] actul altei organizații nu se vede prin id direct", async () => {
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: otherTenantId, title: "Act străin", kind: "act_primire_predare" })
      .returning();

    const res = await app.request(`/api/docs/documents/${foreign.id}`);
    expect(res.status).toBe(404);

    const list = await app.request("/api/docs/documents");
    const rows = (await list.json()) as { id: string }[];
    expect(rows.some((r) => r.id === foreign.id)).toBe(false);
  });

  it("[normal] filtrul pe tip întoarce doar actele acelui tip", async () => {
    await createDocument({ kind: "contract_servicii", title: "Contract de prestări servicii" });
    const res = await app.request("/api/docs/documents?kind=contract_servicii");
    const rows = (await res.json()) as { kind: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === "contract_servicii")).toBe(true);
  });
});
