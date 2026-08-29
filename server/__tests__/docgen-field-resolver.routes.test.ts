/**
 * @vitest-environment node
 *
 * DG-108 — promisiunea modulului, verificată pe drumul real: clientul trimite id-ul furnizorului,
 * NU rechizitele, iar actul iese cu IBAN-ul, codul fiscal și banca din registru.
 *
 * Testul cel mai important e cel „adversarial": clientul trimite deliberat un IBAN greșit în
 * context, iar actul TREBUIE să conțină IBAN-ul din registru. Altfel un formular manipulat (sau
 * un bug de completare) ar putea produce un act semnat cu contul altcuiva.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parPayers, parProjects, parSettings } from "../db/schema/par";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let templateId: string;
let vendorId: string;
let projectId: string;

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

const BODY = `<h1>ACT nr. {{document.numar}}</h1>
<p>{{noi.denumire}}, IDNO {{noi.idno}}</p>
<p>{{contraparte.denumire}}, cod fiscal {{contraparte.idno}}, IBAN {{contraparte.iban}}, {{contraparte.banca}}</p>
<p>Proiect: {{proiect.nume}} ({{proiect.donator}})</p>
<p>Total: {{total.suma}} {{total.valuta}} ({{total.in_litere}}), la {{document.data}}</p>
<p>Întocmit de {{utilizator.nume}}</p>`;

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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-res" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana Contabil", role: "manager" })
    .returning();
  userId = u.id;

  await testDb.insert(parSettings).values({ tenantId, orgLegalName: "Asociația Națională ATIC" });
  await testDb.insert(parPayers).values({ tenantId, name: "ATIC", legalName: "Asociația Națională ATIC", idno: "1010620000000" });

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

  const [p] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Digital Skills 2026", donor: "USAID" })
    .returning();
  projectId = p.id;

  const [tpl] = await testDb
    .insert(docmergeTemplates)
    .values({ tenantId, name: "Act", bodyHtml: BODY, placeholders: "[]", kind: "act_primire_predare" })
    .returning();
  templateId = tpl.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function createFromRegistry(extra: Record<string, unknown> = {}) {
  return app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      kind: "act_primire_predare",
      title: "Act — echipament",
      projectId,
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Laptop Dell", quantity: 2, unitPriceCents: 1225000 }],
      ...extra,
    }),
  });
}

describe("DG-108 — actul se completează din registru, nu din tastatură", () => {
  it("[blocant] clientul trimite doar id-ul furnizorului; rechizitele vin din par_vendors", async () => {
    const res = await createFromRegistry();
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { bodyHtml: string; counterpartyName: string; missing: string[] };

    // Ghilimelele din denumire ajung escapate în HTML — corect: valorile sunt escapate la randare,
    // altfel un furnizor numit cu marcaje ar injecta cod în act.
    expect(doc.bodyHtml).toContain("SRL &quot;Tehnica Nouă&quot;");
    expect(doc.bodyHtml).toContain("1234567890123");
    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");
    expect(doc.bodyHtml).toContain("BC Moldindconbank SA");
    expect(doc.counterpartyName).toBe('SRL "Tehnica Nouă"');
    expect(doc.missing, "nimic nu lipsește când registrul e complet").toEqual([]);
  });

  it("[blocant] un IBAN trimis de client NU poate înlocui IBAN-ul din registru", async () => {
    const res = await createFromRegistry({
      context: { "contraparte.iban": "MD00XXXXXXXXXXXXXXXXXXXX" },
    });
    const doc = (await res.json()) as { bodyHtml: string };
    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");
    expect(doc.bodyHtml).not.toContain("MD00XXXXXXXXXXXXXXXXXXXX");
  });

  it("[blocant] organizația, proiectul și suma în litere se completează singure", async () => {
    const res = await createFromRegistry();
    const doc = (await res.json()) as { bodyHtml: string };
    expect(doc.bodyHtml).toContain("Asociația Națională ATIC");
    expect(doc.bodyHtml).toContain("1010620000000");
    expect(doc.bodyHtml).toContain("Digital Skills 2026");
    expect(doc.bodyHtml).toContain("USAID");
    expect(doc.bodyHtml).toContain("24.500,00 MDL"); // formatul ro-MD: punct la mii, virgulă la zecimale
    expect(doc.bodyHtml).toContain("douăzeci și patru de mii cinci sute de lei 00 bani");
    expect(doc.bodyHtml).toContain("Ana Contabil");
  });

  it("[blocant] numărul apare pe act abia la finalizare, dar apare — nu rămân acolade", async () => {
    const created = await createFromRegistry();
    const { id, bodyHtml } = (await created.json()) as { id: string; bodyHtml: string };
    // Cât e ciornă, numărul e singurul câmp nerezolvat.
    expect(bodyHtml).toContain("{{document.numar}}");

    const res = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { bodyHtml: string; docNumber: string };
    expect(doc.bodyHtml).toContain(doc.docNumber);
    expect(doc.bodyHtml, "actul semnat nu are voie să poarte acolade").not.toContain("{{");
  });

  it("[blocant] rechizitele se îngheață pe act: schimbarea fișei nu rescrie actul semnat", async () => {
    const created = await createFromRegistry();
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    // Furnizorul își schimbă IBAN-ul mâine…
    const { eq } = await import("drizzle-orm");
    await testDb
      .update(parVendors)
      .set({ iban: "MD11AG000000000000000000" })
      .where(eq(parVendors.id, vendorId));

    const after = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      bodyHtml: string;
      counterpartySnapshot: Record<string, string>;
    };
    expect(after.bodyHtml).toContain("MD48ML000002259A19498121");
    expect(after.counterpartySnapshot.iban).toBe("MD48ML000002259A19498121");
  });

  it("[blocant] un furnizor cu fișa incompletă produce o listă de lipsuri, nu un act cu goluri", async () => {
    const [incomplete] = await testDb
      .insert(parVendors)
      .values({ tenantId, name: "II Fără Rechizite", idnp: "1002004006008" })
      .returning();

    const res = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        kind: "act_primire_predare",
        title: "Act incomplet",
        counterparty: { kind: "vendor", id: incomplete.id },
        lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 100000 }],
      }),
    });
    const doc = (await res.json()) as { missing: string[] };
    expect(doc.missing).toContain("contraparte.iban");
    expect(doc.missing).toContain("contraparte.banca");
    expect(doc.missing).not.toContain("contraparte.denumire");
  });
});
