/**
 * @vitest-environment node
 *
 * DG-116 + DG-119 — actele se nasc unele din altele, iar traseul se vede.
 *
 * Valoarea: actul de primire-predare pentru un contract existent se face din 3 câmpuri, nu din 20,
 * iar referința legală („în baza contractului nr. X din data Y") se scrie singură — exact partea
 * pe care omul o copiază greșit când o tastează. Traseul răspunde la „unde s-a oprit lucrul?",
 * întrebare care azi se pune pe chat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parPayers, parProjects } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-der" }).returning();
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
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: 'SRL "Tehnica Nouă"', idnp: "1234567890123", iban: "MD48ML000002259A19498121" })
    .returning();
  vendorId = v.id;

  // Biblioteca standard (șabloanele pe tipuri) — sursa șablonului implicit la derivare.
  await app.request("/api/docs/templates");
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function finalizedContract() {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "contract_servicii",
      title: "Contract de prestări servicii — instruire",
      projectId,
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Instruire Excel", unit: "ore", quantity: 10, unitPriceCents: 50000 }],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  return id;
}

describe("DG-116 — actul derivat", () => {
  it("[blocant] moștenește părțile, proiectul și pozițiile, cu referința la contract", async () => {
    const contractId = await finalizedContract();

    const res = await app.request(`/api/docs/documents/${contractId}/derive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "act_primire_predare" }),
    });
    expect(res.status).toBe(201);
    const derived = (await res.json()) as {
      id: string;
      kind: string;
      status: string;
      counterpartyName: string;
      projectId: string;
      totalCents: number;
      basedOn: string;
      bodyHtml: string;
    };

    expect(derived.kind).toBe("act_primire_predare");
    expect(derived.status).toBe("draft");
    expect(derived.counterpartyName).toBe('SRL "Tehnica Nouă"');
    expect(derived.projectId).toBe(projectId);
    expect(derived.totalCents).toBe(500000);
    // Referința se scrie singură, cu numărul și data contractului.
    expect(derived.basedOn).toMatch(/contractul de prestări servicii nr\. CTR-\d{4}-\d{4} din/);
    expect(derived.bodyHtml).toContain("CTR-");

    const full = (await (await app.request(`/api/docs/documents/${derived.id}`)).json()) as {
      lines: { description: string }[];
    };
    expect(full.lines.map((l) => l.description)).toEqual(["Instruire Excel"]);
  });

  it("[blocant] tipurile fără sens juridic nu se pot deriva", async () => {
    const contractId = await finalizedContract();
    const derivable = (await (await app.request(`/api/docs/documents/${contractId}/derivable`)).json()) as {
      kinds: string[];
    };
    expect(derivable.kinds).toContain("act_primire_predare");

    const res = await app.request(`/api/docs/documents/${contractId}/derive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "contract_vanzare" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("kind_not_derivable");
  });

  it("[blocant] dintr-o ciornă nu se naște nimic", async () => {
    const created = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "contract_servicii",
        title: "Ciornă de contract",
        counterparty: { kind: "vendor", id: vendorId },
        lines: [{ description: "X", quantity: 1, unitPriceCents: 1000 }],
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const res = await app.request(`/api/docs/documents/${id}/derive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "act_primire_predare" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DG-119 — traseul actului", () => {
  it("[blocant] lanțul contract → act → cerere de plată se vede din ambele capete", async () => {
    const contractId = await finalizedContract();
    const derived = (await (
      await app.request(`/api/docs/documents/${contractId}/derive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "act_primire_predare" }),
      })
    ).json()) as { id: string };

    await app.request(`/api/docs/documents/${derived.id}/finalize`, { method: "POST" });
    await app.request(`/api/docs/documents/${derived.id}/pdf`);
    const parRes = await app.request(`/api/docs/documents/${derived.id}/to-par`, { method: "POST" });
    const par = (await parRes.json()) as { parId: string; requestNo: string; error?: string };
    expect(parRes.status, `to-par a răspuns ${parRes.status}: ${JSON.stringify(par)}`).toBe(201);

    // Din contract: se vede actul derivat.
    const fromContract = (await (await app.request(`/api/docs/documents/${contractId}/trail`)).json()) as {
      derived: { id: string; kind: string }[];
      paymentRequests: unknown[];
    };
    expect(fromContract.derived.map((d) => d.id)).toContain(derived.id);

    // Din act: se vede contractul-sursă ȘI cererea de plată, cu numărul și starea ei.
    const fromAct = (await (await app.request(`/api/docs/documents/${derived.id}/trail`)).json()) as {
      basedOn: { id: string }[];
      paymentRequests: { id: string; requestNo: string; status: string }[];
    };
    expect(fromAct.basedOn.map((d) => d.id)).toContain(contractId);
    expect(fromAct.paymentRequests).toHaveLength(1);
    expect(fromAct.paymentRequests[0].requestNo).toBe(par.requestNo);
    expect(fromAct.paymentRequests[0].status).toBe("draft");
  });

  it("[blocant] traseul altui tenant nu se citește", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-trail" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare" })
      .returning();
    const res = await app.request(`/api/docs/documents/${foreign.id}/trail`);
    expect(res.status).toBe(404);
  });
});
