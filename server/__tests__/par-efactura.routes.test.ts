/**
 * @vitest-environment node
 * PAR-EFP — e-Factura de la prestator: rutele reale, pe PGlite, cu toate migrările aplicate.
 *
 * Testăm ACȚIUNEA, nu afișarea (CLAUDE.md §3.5.1quater): fiecare endpoint e chiar apelat și se
 * verifică efectul lui în baza de date — reminderul chiar scrie un email în `messages` și un rând
 * în `par_audit`, marcarea manuală chiar schimbă starea, iar scanarea fără credențiale SFS NU are
 * voie să declare „lipsește".
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, messages } from "../db/schema";
import {
  parRequests,
  parPayments,
  parMembers,
  parPayers,
  parPayerMembers,
  parAudit,
  parVendors,
} from "../db/schema/par";
import { parEinvoices } from "../db/schema/parEinvoices";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantId: string;
let financeUser: string;
let requestorUser: string;
let parJuridic: string;
let parFizic: string;

const SUPPLIER_IDNO = "1002600001234";

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parEfacturaRoutes } = await import("../routes/parEfactura");
  app = new Hono();
  app.route("/api/par/efactura", parEfacturaRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-efp" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb
    .insert(parPayers)
    .values({ tenantId, name: "ATIC", idno: "1003600009999" })
    .returning();

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "teacher" })
      .returning();
    return u.id;
  };
  financeUser = await mkUser("finante@atic.example", "Finanțe");
  requestorUser = await mkUser("solicitant@atic.example", "Solicitant");

  await testDb.insert(parMembers).values({ tenantId, userId: financeUser, role: "finance" });
  await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId: financeUser });
  await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId: requestorUser });

  const [vendor] = await testDb
    .insert(parVendors)
    .values({
      tenantId,
      name: "Consultanți SRL",
      idnp: SUPPLIER_IDNO,
      kind: "company",
      contactEmail: "contact@consultanti.invalid",
    })
    .returning();

  const [juridic] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId: payer.id,
      requestNo: "PAR-2026-0001",
      requestedByUserId: requestorUser,
      purpose: "execute_payment",
      vendorId: vendor.id,
      payeeName: "Consultanți SRL",
      payeeIdnp: SUPPLIER_IDNO,
      payeeType: "juridic",
      endUse: "Servicii de consultanță pentru proiectul X",
      currency: "MDL",
      totalEstimatedCents: 120000,
      status: "paid",
      paidAt: new Date("2026-08-12T00:00:00.000Z"),
    })
    .returning();
  parJuridic = juridic.id;
  await testDb.insert(parPayments).values({
    tenantId,
    parId: parJuridic,
    actualAmountCents: 120000,
    paymentDate: new Date("2026-08-12T00:00:00.000Z"),
  });

  const [fizic] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId: payer.id,
      requestNo: "PAR-2026-0002",
      requestedByUserId: requestorUser,
      purpose: "execute_payment",
      payeeName: "Ion Popescu",
      payeeIdnp: "2000000000000",
      payeeType: "fizic",
      currency: "MDL",
      totalEstimatedCents: 50000,
      status: "paid",
      paidAt: new Date("2026-08-12T00:00:00.000Z"),
    })
    .returning();
  parFizic = fizic.id;

  session = { id: financeUser, tenantId, role: "teacher", email: "finante@atic.example" };
});

describe("coada e-Factura", () => {
  it("arată cererea plătită către o persoană juridică drept „lipsă factură”", async () => {
    const res = await app.request("/api/par/efactura?filter=missing");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { parId: string; requestNo: string; payeeName: string; state: { status: string } }[];
      counts: { missing: number; notApplicable: number };
      sfs: { configured: boolean };
    };
    const ids = body.items.map((i) => i.parId);
    expect(ids).toContain(parJuridic);
    expect(ids).not.toContain(parFizic);
    expect(body.items.find((i) => i.parId === parJuridic)!.state.status).toBe("expected");
    // Fără credențiale SFS, interfața trebuie să știe că verificarea automată nu e disponibilă.
    expect(body.sfs.configured).toBe(false);
  });

  it("marchează plata către persoana fizică drept fără obligație de e-Factura", async () => {
    const [row] = await testDb
      .select()
      .from(parEinvoices)
      .where(and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.parId, parFizic)));
    expect(row.status).toBe("not_applicable");
  });

  it("refuză accesul cuiva fără rol de finanțe sau administrator PAR", async () => {
    const saved = session;
    session = { id: requestorUser, tenantId, role: "teacher", email: "solicitant@atic.example" };
    const res = await app.request("/api/par/efactura");
    expect(res.status).toBe(403);
    session = saved;
  });
});

describe("scanarea fără credențiale SFS", () => {
  it("NU declară că lipsește — spune că verificarea nu s-a putut face", async () => {
    const res = await app.request("/api/par/efactura/scan", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { available: boolean; source: string; message: string } };
    expect(body.result.available).toBe(false);
    expect(body.result.source).toBe("mock");
    expect(body.result.message).toMatch(/nu este configurat|simulat/i);

    // Starea rămâne neatinsă: nicio verificare nu s-a înregistrat.
    const [row] = await testDb
      .select()
      .from(parEinvoices)
      .where(and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.parId, parJuridic)));
    expect(row.lastScanAt).toBeNull();
    expect(row.status).toBe("expected");
  });
});

describe("reminderul către solicitant", () => {
  it("trimite emailul solicitantului cererii și îl înregistrează", async () => {
    const res = await app.request(`/api/par/efactura/requests/${parJuridic}/reminder`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: boolean; toAddress: string | null; reminderCount: number };
    expect(body.sent).toBe(true);
    expect(body.toAddress).toBe("solicitant@atic.example");
    expect(body.reminderCount).toBe(1);

    // Emailul chiar a plecat prin sistemul de mesagerie existent…
    const mails = await testDb.select().from(messages).where(eq(messages.tenantId, tenantId));
    const mail = mails.find((m) => m.toAddress === "solicitant@atic.example");
    expect(mail).toBeTruthy();
    expect(mail!.subject).toContain("PAR-2026-0001");
    expect(mail!.body).toContain("Consultanți SRL");
    expect(mail!.body).toContain("1.200,00 MDL");
    expect(mail!.body).toContain("Servicii de consultanță pentru proiectul X");

    // …și a lăsat urmă în jurnalul cererii.
    const audit = await testDb.select().from(parAudit).where(eq(parAudit.parId, parJuridic));
    expect(audit.some((a) => a.event === "efactura_reminder")).toBe(true);
  });

  it("nu permite un al doilea reminder în aceeași zi", async () => {
    const res = await app.request(`/api/par/efactura/requests/${parJuridic}/reminder`, { method: "POST" });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; nextAllowedAt: string };
    expect(body.error).toBe("too_soon");
    expect(body.nextAllowedAt).toBeTruthy();
  });

  it("nu trimite reminder pentru o plată către persoană fizică", async () => {
    const res = await app.request(`/api/par/efactura/requests/${parFizic}/reminder`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_expected");
  });

  it("întoarce 404 pentru un identificator care nu e uuid", async () => {
    const res = await app.request("/api/par/efactura/requests/nu-e-uuid/reminder", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("marcarea manuală", () => {
  it("scoate cererea din coadă și reține seria/numărul", async () => {
    const res = await app.request(`/api/par/efactura/requests/${parJuridic}/mark-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seria: "EFMD", number: "000000123", note: "primită pe hârtie" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { status: string; sfsSeria: string; sfsNumber: string } };
    expect(body.state.status).toBe("received_manual");
    expect(body.state.sfsSeria).toBe("EFMD");
    expect(body.state.sfsNumber).toBe("000000123");

    const list = await app.request("/api/par/efactura?filter=missing");
    const listBody = (await list.json()) as { items: { parId: string }[] };
    expect(listBody.items.map((i) => i.parId)).not.toContain(parJuridic);

    const audit = await testDb.select().from(parAudit).where(eq(parAudit.parId, parJuridic));
    expect(audit.some((a) => a.event === "efactura_marked_received")).toBe(true);
  });

  it("nu retrogradează o factură deja înregistrată la următoarea sincronizare", async () => {
    await app.request("/api/par/efactura?filter=all");
    const [row] = await testDb
      .select()
      .from(parEinvoices)
      .where(and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.parId, parJuridic)));
    expect(row.status).toBe("received_manual");
  });

  it("refuză marcarea manuală făcută de cineva fără rol de finanțe", async () => {
    const saved = session;
    session = { id: requestorUser, tenantId, role: "teacher", email: "solicitant@atic.example" };
    const res = await app.request(`/api/par/efactura/requests/${parFizic}/mark-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    session = saved;
  });
});
