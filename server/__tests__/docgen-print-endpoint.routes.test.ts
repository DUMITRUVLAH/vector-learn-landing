/**
 * @vitest-environment node
 *
 * Fix prod — tipărirea din browser.
 *
 * Bugul raportat de owner: „când dau să descarc PDF mă duce la o pagină HTML". Cauza: pe Vercel
 * nu rulează chromium, deci randarea pe server întorcea mereu fallback-ul HTML. Soluția e ca
 * browserul să facă PDF-ul (ca la formularul PAR) din acest endpoint, iar serverul să-l păstreze.
 *
 * Al doilea lucru vizibil în captura owner-ului: pe pagina tipărită apăreau `{{document.numar}}` și
 * restul câmpurilor cu acolade. Pe hârtie nu au ce căuta niciodată — nici pe ciornă.
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
let templateId: string;

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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-print" }).returning();
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

  const list = (await (await app.request("/api/docs/templates")).json()) as { id: string; name: string }[];
  templateId = list.find((t) => t.name.includes("servicii prestate"))!.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function draft() {
  const res = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      kind: "act_primire_predare",
      title: "Act de primire-predare",
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "servii marketing", quantity: 1, unitPriceCents: 200000 }],
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

describe("Fix prod — pagina de tipărit", () => {
  it("[blocant] pe CIORNĂ nu apar acolade — nici măcar numărul nealocat", async () => {
    const id = await draft();
    const res = await app.request(`/api/docs/documents/${id}/print`);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { html: string; fileName: string; status: string };

    expect(out.html).not.toContain("{{");
    expect(out.html).toContain("__________"); // rând de completat, ca pe un formular tipizat
    expect(out.html).toContain("servii marketing");
    expect(out.status).toBe("draft");
    expect(out.fileName).toMatch(/\.pdf$/);
  });

  it("[blocant] actul finalizat își scrie PDF-ul pe server și îl păstrează", async () => {
    const id = await draft();
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const before = (await (await app.request(`/api/docs/documents/${id}/print`)).json()) as {
      hasStoredPdf: boolean;
    };
    expect(before.hasStoredPdf).toBe(false);

    const ensure = await app.request(`/api/docs/documents/${id}/pdf/ensure`, { method: "POST" });
    expect(ensure.status).toBe(200);
    expect((await ensure.json()) as { stored: boolean; hasPdf: boolean }).toEqual({
      stored: true,
      hasPdf: true,
    });

    const after = (await (await app.request(`/api/docs/documents/${id}/print`)).json()) as {
      hasStoredPdf: boolean;
    };
    expect(after.hasStoredPdf).toBe(true);

    // Iar descărcarea servește exact octeții păstrați.
    const pdf = await app.request(`/api/docs/documents/${id}/pdf`);
    expect(pdf.status).toBe(200);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("[blocant] nimeni nu mai poate încărca un PDF peste actul semnat", async () => {
    // Vechiul `PUT /documents/:id/pdf` lăsa BROWSERUL să trimită octeții. Adică oricine autentificat
    // putea înlocui PDF-ul unui act semnat cu orice fișier, iar registrul l-ar fi servit mai departe
    // ca probă. Ruta nu mai există; PDF-ul se naște doar din corpul sigilat, pe server.
    const id = await draft();
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const put = await app.request(`/api/docs/documents/${id}/pdf`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: Buffer.from("%PDF-1.4 fals").toString("base64") }),
    });
    expect(put.status).toBe(404);
  });

  it("[blocant] ciorna NU își stochează PDF-ul — se schimbă la fiecare salvare", async () => {
    const id = await draft();
    const ensure = await app.request(`/api/docs/documents/${id}/pdf/ensure`, { method: "POST" });
    const body = (await ensure.json()) as { stored: boolean; hasPdf: boolean };
    expect(body.stored).toBe(false);
    expect(body.hasPdf).toBe(true);

    const printed = (await (await app.request(`/api/docs/documents/${id}/print`)).json()) as {
      hasStoredPdf: boolean;
    };
    expect(printed.hasStoredPdf).toBe(false);
  });

  it("[blocant] pagina de tipărit a altui tenant nu se citește", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-print" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare" })
      .returning();
    expect((await app.request(`/api/docs/documents/${foreign.id}/print`)).status).toBe(404);
  });

  it("[blocant] mesajul de lipsuri nu repetă aceeași lipsă de două ori", async () => {
    // Owner-ul a văzut: „lipsește: Contrapartea (denumirea), Denumirea contrapărții, …" — același
    // lucru scris de două ori arată a defecțiune.
    const res = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        kind: "act_primire_predare",
        title: "Act fără parte",
        lines: [{ description: "servicii", quantity: 1, unitPriceCents: 200000 }],
      }),
    });
    const { id } = (await res.json()) as { id: string };

    const fin = await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    expect(fin.status).toBe(400);
    const body = (await fin.json()) as { missing: string[]; warnings: string[] };
    // DC-103: lipsa contrapărții a devenit întrebare, nu zid — dar tot o singură dată, oricât de
    // multe surse ar semnala-o („Contrapartea (denumirea)" și „Denumirea contrapărții" = același lucru).
    const spuse = [...body.missing, ...body.warnings];
    expect(new Set(spuse).size).toBe(spuse.length);
    expect(spuse.filter((m) => m.toLowerCase().includes("denumire"))).toHaveLength(1);
  });
});
