/**
 * @vitest-environment node
 *
 * DG-118 — din cerere de plată în act.
 *
 * Închide bucla „am plătit, unde e actul semnat?". Regula care contează: actul se compune din ce
 * s-a PRIMIT, nu din ce s-a comandat. Dacă din 5 bucăți au sosit 3, actul trebuie să spună 3 —
 * altfel semnătura acoperă o predare care nu a avut loc.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parVendors,
  parPayers,
  parProjects,
  parRequests,
  parLineItems,
  parReceipts,
  parReceiptLines,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-frompar" }).returning();
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
    .values({ tenantId, name: "SRL Alfa", idnp: "1111111111111", iban: "MD48ML000002259A19498121", bank: "MICB" })
    .returning();
  vendorId = v.id;

  await app.request("/api/docs/templates"); // instalează șabloanele standard
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function makePar(opts: { withVendor?: boolean; qty?: number } = {}) {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: `PAR-2026-${String(Math.floor(Math.random() * 8999) + 1000)}`,
      requestedByUserId: userId,
      projectId,
      vendorId: opts.withVendor === false ? null : vendorId,
      payeeName: opts.withVendor === false ? "II Beneficiar Direct" : "SRL Alfa",
      payeeIdnp: opts.withVendor === false ? "2002002002002" : null,
      payeeIban: opts.withVendor === false ? "MD24AG000225100013104168" : null,
      currency: "MDL",
      status: "approved",
      totalEstimatedCents: 500000,
    })
    .returning();
  const [line] = await testDb
    .insert(parLineItems)
    .values({
      tenantId,
      parId: par.id,
      position: 1,
      description: "Laptop Dell",
      quantity: opts.qty ?? 5,
      unit: "buc",
      unitPriceCents: 100000,
      lineTotalCents: (opts.qty ?? 5) * 100000,
    })
    .returning();
  return { par, line };
}

describe("DG-118 — actul se naște din cererea de plată", () => {
  it("[blocant] preia beneficiarul, proiectul și pozițiile comandate", async () => {
    const { par } = await makePar();

    const res = await app.request(`/api/docs/from-par/${par.id}`, { method: "POST" });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as {
      id: string;
      counterpartyName: string;
      projectId: string;
      totalCents: number;
      basedOn: string;
      fromReceipt: boolean;
      bodyHtml: string;
    };

    expect(doc.counterpartyName).toBe("SRL Alfa");
    expect(doc.projectId).toBe(projectId);
    expect(doc.totalCents).toBe(500000);
    expect(doc.basedOn).toContain(par.requestNo);
    expect(doc.fromReceipt).toBe(false);
    expect(doc.bodyHtml).toContain("MD48ML000002259A19498121");

    const full = (await (await app.request(`/api/docs/documents/${doc.id}`)).json()) as {
      lines: { description: string; quantity: number }[];
      links: { toKind: string; toParId: string | null }[];
    };
    expect(full.lines).toEqual([expect.objectContaining({ description: "Laptop Dell", quantity: 5 })]);
    expect(full.links.some((l) => l.toKind === "par" && l.toParId === par.id)).toBe(true);
  });

  it("[blocant] cu recepție parțială, actul spune cât S-A PRIMIT, nu cât s-a comandat", async () => {
    const { par, line } = await makePar({ qty: 5 });
    const [receipt] = await testDb
      .insert(parReceipts)
      .values({ tenantId, parId: par.id, receivedByUserId: userId, complete: false })
      .returning();
    await testDb
      .insert(parReceiptLines)
      .values({ tenantId, receiptId: receipt.id, lineItemId: line.id, qtyReceived: 3 });

    const res = await app.request(`/api/docs/from-par/${par.id}`, { method: "POST" });
    const doc = (await res.json()) as { id: string; totalCents: number; fromReceipt: boolean };
    expect(doc.fromReceipt).toBe(true);
    expect(doc.totalCents, "3 × 1.000,00 lei, nu 5").toBe(300000);

    const full = (await (await app.request(`/api/docs/documents/${doc.id}`)).json()) as {
      lines: { quantity: number }[];
    };
    expect(full.lines[0].quantity).toBe(3);
  });

  it("[blocant] beneficiarul scris direct pe cerere (fără fișă în registru) ajunge pe act", async () => {
    const { par } = await makePar({ withVendor: false });
    const res = await app.request(`/api/docs/from-par/${par.id}`, { method: "POST" });
    const doc = (await res.json()) as { counterpartyName: string; bodyHtml: string };
    expect(doc.counterpartyName).toBe("II Beneficiar Direct");
    expect(doc.bodyHtml).toContain("MD24AG000225100013104168");
  });

  it("[blocant] cererea altui tenant nu produce niciun act", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-frompar" }).returning();
    const [foreign] = await testDb
      .insert(parRequests)
      .values({
        tenantId: other.id,
        requestNo: "PAR-2026-9999",
        requestedByUserId: userId,
        currency: "MDL",
        status: "approved",
      })
      .returning();

    const res = await app.request(`/api/docs/from-par/${foreign.id}`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
