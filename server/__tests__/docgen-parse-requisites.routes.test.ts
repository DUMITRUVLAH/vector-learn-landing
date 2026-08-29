/**
 * @vitest-environment node
 *
 * DG-110 — blocul de rechizite lipit din e-mail.
 *
 * Formatele sunt reale (așa arată semnăturile firmelor din Moldova): eticheta compusă
 * „c.f./ nr.TVA", codul bancar lipit după numele băncii, IBAN-ul pe alt rând. Dacă parsarea
 * greșește aici, greșeala ajunge în fișa furnizorului și de acolo în toate actele viitoare.
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

// Rolurile PAR se verifică în alt test (PARQA-005); aici ne interesează parsarea.
vi.mock("../middleware/requirePARRole", () => ({
  requirePARRole: () => async (_c: unknown, next: () => Promise<void>) => {
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

  const { parVendorsRoutes } = await import("../routes/parVendors");
  app = new Hono();
  app.route("/api/par/vendors", parVendorsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-req" }).returning();
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

async function parse(text: string) {
  const res = await app.request("/api/par/vendors/actions/parse-requisites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string | null> };
}

describe("DG-110 — rechizitele lipite ajung în câmpurile corecte", () => {
  it("[blocant] bloc clasic: denumire, cod fiscal, bancă cu cod, IBAN pe alt rând", async () => {
    const { status, body } = await parse(
      [
        'SRL "Tehnica Nouă"',
        "c.f. 1234567890123",
        "BC Moldindconbank SA, MOLDMD2X309",
        "IBAN: MD48ML000002259A19498121",
      ].join("\n")
    );
    expect(status).toBe(200);
    expect(body.name).toBe('SRL "Tehnica Nouă"');
    expect(body.idnp).toBe("1234567890123");
    expect(body.iban).toBe("MD48ML000002259A19498121");
    expect(body.bank).toContain("Moldindconbank");
    expect(body.bic_swift).toBe("MOLDMD2X309");
  });

  it("[blocant] eticheta compusă cod fiscal + nr.TVA nu umple greșit coloana de TVA", async () => {
    const { body } = await parse('SRL "Alfa"\nc.f./ nr.TVA 1002600012345\nIBAN MD24AG000225100013104168');
    expect(body.idnp).toBe("1002600012345");
    // 13 cifre = IDNO, deci coloana TVA rămâne goală în loc să repete codul fiscal.
    expect(body.vat_code).toBeNull();
  });

  it("[blocant] IBAN-ul se recunoaște și fără etichetă", async () => {
    const { body } = await parse("Furnizor SRL\nMD24AG000225100013104168\nBC Moldova-Agroindbank SA");
    expect(body.iban).toBe("MD24AG000225100013104168");
  });

  it("[normal] text gol → 400, nu un obiect gol care pare un răspuns bun", async () => {
    const { status } = await parse("   ");
    expect(status).toBe(400);
  });
});
