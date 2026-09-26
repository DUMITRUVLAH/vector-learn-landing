/**
 * @vitest-environment node
 * CONTPLATA-faza-1 — contul de plată, de la ciornă la PDF, pe o bază reală (PGlite + migrări).
 *
 * Owner-ul, 26.09.2026: numărul să fie automat (manual doar dacă vrea), previzualizarea să meargă,
 * toate datele clientului să intre, serviciile să vină din CRM/stoc/conturi anterioare, șabloane
 * ca la PAR, și un PDF adevărat, personalizabil. Fiecare `it` de aici e una dintre promisiuni —
 * testată prin ACȚIUNE (cererea reală + forma răspunsului), nu prin „butonul există”.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, paymentAccounts, finInventoryItems } from "../db/schema";
import { crmProducts } from "../db/schema/crmProducts";
import { finOrgProfile } from "../db/schema/finCore";

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
let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const json = (body: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const BUYER = {
  buyerName: 'Casa de Schimb Valutar "VECTOR-AP" SRL',
  buyerIdno: "1016600016713",
  buyerVatCode: "0409876",
  buyerAddress: "str. Ismail 33",
  buyerCity: "Chișinău",
  buyerEmail: "contabil@vector-ap.md",
  buyerPhone: "+373 22 123 456",
  buyerIban: "md24 ag00 0225 1000 1310 4168",
  buyerBankName: "Moldova Agroindbank",
  buyerContact: "Ion Popescu",
};

async function draft(overrides: Record<string, unknown> = {}) {
  const res = await app.request(
    "/api/payment-accounts",
    json({
      ...BUYER,
      items: [{ description: "Servicii consultanță", unit: "oră", quantity: 2, unitPriceCents: 30_000, vatRate: 20 }],
      ...overrides,
    })
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data;
}

async function issue(id: string, documentNumber?: string) {
  return app.request(`/api/payment-accounts/${id}/issue`, json(documentNumber ? { documentNumber } : {}));
}

async function issuedNumber(id: string, documentNumber?: string): Promise<string> {
  const res = await issue(id, documentNumber);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { documentNumber: string } }).data.documentNumber;
}

const YEAR = new Date().getFullYear();

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { paymentAccountRoutes } = await import("../routes/paymentAccounts");
  app = new Hono();
  app.route("/api/payment-accounts", paymentAccountRoutes);

  const [a] = await testDb.insert(tenants).values({ name: "Vector Academy", slug: "vector-pa" }).returning();
  const [b] = await testDb.insert(tenants).values({ name: "Alt client", slug: "alt-pa" }).returning();
  tenantA = a.id;
  tenantB = b.id;
  const [ua] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "a@pa.test", name: "A", role: "admin", passwordHash: "x" })
    .returning();
  const [ub] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "b@pa.test", name: "B", role: "admin", passwordHash: "x" })
    .returning();
  userA = ua.id;
  userB = ub.id;
  await testDb.insert(finOrgProfile).values({
    tenantId: tenantA,
    legalName: 'SRL "Vector Academy"',
    idno: "1019600012345",
    iban: "MD24AG000225100013104168",
    bankName: "Moldova Agroindbank",
    bic: "AGRNMD2X",
    administratorName: "Dumitru Vlah",
  });
});

beforeEach(() => {
  session = { id: userA, tenantId: tenantA, role: "admin", email: "a@pa.test" };
});

describe("CONTPLATA — numerotare automată cu suprascriere manuală", () => {
  it("[blocant] numărul se pune singur, în ordine: …0001, apoi …0002", async () => {
    const peek = await app.request("/api/payment-accounts/next-number");
    expect(((await peek.json()) as { data: { documentNumber: string } }).data.documentNumber).toBe(`CP-${YEAR}-0001`);

    expect(await issuedNumber((await draft()).id)).toBe(`CP-${YEAR}-0001`);
    expect(await issuedNumber((await draft()).id)).toBe(`CP-${YEAR}-0002`);
  });

  it("[blocant] numărul manual deja folosit → 409, nu un duplicat", async () => {
    const res = await issue((await draft()).id, `CP-${YEAR}-0001`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("number_taken");
  });

  it("[blocant] un număr manual în forma seriei mută secvența: după 0300 urmează 0301", async () => {
    expect(await issuedNumber((await draft()).id, `CP-${YEAR}-0300`)).toBe(`CP-${YEAR}-0300`);
    expect(await issuedNumber((await draft()).id)).toBe(`CP-${YEAR}-0301`);
  });

  it("[blocant] un număr manual liber („Avans-mai”) nu strică secvența automată", async () => {
    expect(await issuedNumber((await draft()).id, "Avans-mai")).toBe("Avans-mai");
    expect(await issuedNumber((await draft()).id)).toBe(`CP-${YEAR}-0302`);
  });

  it("[blocant] 10 emiteri simultane primesc 10 numere diferite", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => draft().then((d) => d.id)));
    const numbers = await Promise.all(ids.map((id) => issuedNumber(id)));
    expect(new Set(numbers).size).toBe(10);
  });

  it("[blocant] numărul de start din setări (vii din alt program) e respectat într-o serie nouă", async () => {
    const put = await app.request("/api/payment-accounts/settings", json({ series: "VA", numberStart: 279 }, "PUT"));
    expect(put.status).toBe(200);
    expect(await issuedNumber((await draft()).id)).toBe(`VA-${YEAR}-0279`);
    expect(await issuedNumber((await draft()).id)).toBe(`VA-${YEAR}-0280`);
    await app.request("/api/payment-accounts/settings", json({ series: "CP", numberStart: 1 }, "PUT"));
  });

  it("[normal] contul emis nu se mai editează și nu se emite de două ori", async () => {
    const { id } = await draft();
    await issuedNumber(id);
    expect((await issue(id)).status).toBe(409);
    const patch = await app.request(`/api/payment-accounts/${id}`, json({ ...BUYER, items: [{ description: "x", quantity: 1, unitPriceCents: 1 }] }, "PATCH"));
    expect(patch.status).toBe(409);
  });

  it("[blocant] un cont cu totalul 0 nu se emite (n-ar trebui să consume un număr)", async () => {
    const { id } = await draft({ items: [{ description: "Fără preț", unit: "buc", quantity: 1, unitPriceCents: 0, vatRate: 0 }] });
    const peekBefore = (await (await app.request("/api/payment-accounts/next-number")).json()) as { data: { documentNumber: string } };
    const res = await issue(id);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("empty_total");
    const peekAfter = (await (await app.request("/api/payment-accounts/next-number")).json()) as { data: { documentNumber: string } };
    expect(peekAfter.data.documentNumber).toBe(peekBefore.data.documentNumber);
  });

  it("[normal] ciorna nu poate fi marcată plătită (n-are număr)", async () => {
    const res = await app.request(`/api/payment-accounts/${(await draft()).id}/status`, json({ status: "paid" }));
    expect(res.status).toBe(409);
  });
});

describe("CONTPLATA — toate datele clientului și ale noastre", () => {
  it("[blocant] clientul se salvează complet (contacte, IBAN normalizat, bancă, persoană)", async () => {
    const { id } = await draft();
    const res = await app.request(`/api/payment-accounts/${id}`);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      buyerVatCode: "0409876",
      buyerEmail: "contabil@vector-ap.md",
      buyerPhone: "+373 22 123 456",
      buyerIban: "MD24AG000225100013104168",
      buyerBankName: "Moldova Agroindbank",
      buyerContact: "Ion Popescu",
      buyerCity: "Chișinău",
    });
  });

  it("[blocant] la emitere se îngheață rechizitele din „Datele firmei”", async () => {
    const { id } = await draft();
    await issuedNumber(id);
    const [row] = await testDb.select().from(paymentAccounts).where(eq(paymentAccounts.id, id));
    expect(row).toMatchObject({
      sellerName: 'SRL "Vector Academy"',
      sellerIdno: "1019600012345",
      sellerIban: "MD24AG000225100013104168",
      sellerBic: "AGRNMD2X",
      sellerAdministrator: "Dumitru Vlah",
    });
  });

  it("[blocant] totalurile se calculează pe server (2 × 300,00 + 20% TVA = 720,00)", async () => {
    const { id } = await draft();
    const [row] = await testDb.select().from(paymentAccounts).where(eq(paymentAccounts.id, id));
    expect(row.subtotalCents).toBe(60_000);
    expect(row.vatCents).toBe(12_000);
    expect(row.totalCents).toBe(72_000);
  });
});

describe("CONTPLATA — PDF adevărat, personalizabil", () => {
  it("[blocant] ciorna și contul emis ies ca PDF (nu HTML), inline pentru previzualizare", async () => {
    const { id } = await draft();
    for (const when of ["draft", "issued"]) {
      if (when === "issued") await issuedNumber(id);
      const res = await app.request(`/api/payment-accounts/${id}/pdf`);
      expect(res.status, when).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toMatch(/^inline/);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    }
    const dl = await app.request(`/api/payment-accounts/${id}/pdf?download=1`);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment; filename="cont-de-plata-CP-/);
  });

  it("[blocant] setările de design se salvează și mostra iese pe fiecare machetă", async () => {
    for (const layout of ["modern", "clasic", "compact"]) {
      const put = await app.request(
        "/api/payment-accounts/settings",
        json({ layout, accentColor: "#1f3a68", showStamp: true, footerText: "Mulțumim!" }, "PUT")
      );
      expect(put.status, layout).toBe(200);
      const { data } = (await put.json()) as { data: { settings: { layout: string; accentColor: string } } };
      expect(data.settings).toMatchObject({ layout, accentColor: "#1F3A68" });
      const pdf = await app.request("/api/payment-accounts/settings/sample.pdf");
      expect(pdf.status, layout).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    }
  });

  it("[blocant] culoare invalidă sau format fără {nr} → 400 cu mesaj, nu salvare stricată", async () => {
    const bad = await app.request("/api/payment-accounts/settings", json({ accentColor: "red" }, "PUT"));
    expect(bad.status).toBe(400);
    const badPattern = await app.request("/api/payment-accounts/settings", json({ numberPattern: "CP-{an}" }, "PUT"));
    expect(badPattern.status).toBe(400);
  });

  it("[normal] setările GET arată emitentul și ce îi lipsește", async () => {
    const res = await app.request("/api/payment-accounts/settings");
    const { data } = (await res.json()) as { data: { issuer: { name: string }; missing: string[]; nextNumber: string } };
    expect(data.issuer.name).toBe('SRL "Vector Academy"');
    // Fără cod TVA în „Datele firmei” → TVA implicit 0%, și rămâne 0 după prima salvare a setărilor.
    expect((data as unknown as { settings: { defaultVatRate: number } }).settings.defaultVatRate).toBe(0);
    expect(data.missing).toEqual([]);
    expect(data.nextNumber).toMatch(new RegExp(`^CP-${YEAR}-\\d{4}$`));
  });
});

describe("CONTPLATA — catalog: produse CRM, stoc, servicii anterioare", () => {
  it("[blocant] produsele CRM vin cu stocul din inventar; ale altui tenant nu apar", async () => {
    const [inv] = await testDb
      .insert(finInventoryItems)
      .values({ tenantId: tenantA, sku: "MAN-B1", name: "Manual B1", unit: "buc", qtyOnHand: 7 })
      .returning();
    await testDb.insert(crmProducts).values([
      { tenantId: tenantA, name: "Manual B1", unit: "buc", listPriceCents: 35_000, inventoryItemId: inv.id },
      { tenantId: tenantA, name: "Curs engleză B1", unit: "curs", listPriceCents: 450_000, vatPercent: "0" },
      { tenantId: tenantB, name: "Produs secret B", unit: "buc", listPriceCents: 1 },
    ]);
    const res = await app.request("/api/payment-accounts/catalog");
    const { data } = (await res.json()) as {
      data: { products: Array<{ name: string; qtyOnHand: number | null; tracksStock: boolean }> };
    };
    const names = data.products.map((p) => p.name);
    expect(names).toContain("Manual B1");
    expect(names).not.toContain("Produs secret B");
    expect(data.products.find((p) => p.name === "Manual B1")).toMatchObject({ qtyOnHand: 7, tracksStock: true });
    expect(data.products.find((p) => p.name === "Curs engleză B1")).toMatchObject({ tracksStock: false });
  });

  it("[normal] un serviciu folosit de mai multe ori apare o singură dată la „folosite anterior”", async () => {
    const res = await app.request("/api/payment-accounts/catalog?q=consult");
    const { data } = (await res.json()) as { data: { recent: Array<{ description: string; uses: number }> } };
    const hits = data.recent.filter((r) => r.description === "Servicii consultanță");
    expect(hits).toHaveLength(1);
    expect(hits[0].uses).toBeGreaterThan(3);
  });

  it("[normal] linia păstrează legătura cu produsul din catalog", async () => {
    const [p] = await testDb.select().from(crmProducts).where(eq(crmProducts.name, "Curs engleză B1"));
    const { id } = await draft({ items: [{ description: p.name, unit: "curs", quantity: 1, unitPriceCents: 450_000, vatRate: 0, productId: p.id }] });
    const res = await app.request(`/api/payment-accounts/${id}`);
    const { data } = (await res.json()) as { data: { items: Array<{ productId: string }> } };
    expect(data.items[0].productId).toBe(p.id);
  });
});

describe("CONTPLATA — șabloane (ca la PAR) și duplicare", () => {
  it("[blocant] salvezi un cont ca șablon și pornești din el: același client și poziții, număr NOU", async () => {
    const source = await draft({ notes: "Plata în 5 zile", items: [{ description: "Abonament lunar", unit: "lună", quantity: 1, unitPriceCents: 120_000, vatRate: 0 }] });
    const firstNumber = await issuedNumber(source.id);

    const saved = await app.request("/api/payment-accounts/templates", json({ name: "Abonament VECTOR-AP", fromAccountId: source.id }));
    expect(saved.status).toBe(201);
    const tpl = ((await saved.json()) as { data: { id: string; buyer: { buyerName: string } } }).data;
    expect(tpl.buyer.buyerName).toBe(BUYER.buyerName);

    const used = await app.request(`/api/payment-accounts/templates/${tpl.id}/use`, json({}));
    expect(used.status).toBe(201);
    const fresh = ((await used.json()) as { data: { id: string; status: string; buyerEmail: string; notes: string } }).data;
    expect(fresh).toMatchObject({ status: "draft", buyerEmail: BUYER.buyerEmail, notes: "Plata în 5 zile" });
    const detail = (await (await app.request(`/api/payment-accounts/${fresh.id}`)).json()) as {
      data: { items: Array<{ description: string; unitPriceCents: number }> };
    };
    expect(detail.data.items).toEqual([expect.objectContaining({ description: "Abonament lunar", unitPriceCents: 120_000 })]);
    const nextNumber = await issuedNumber(fresh.id);
    expect(nextNumber).not.toBe(firstNumber);
  });

  it("[blocant] un șablon fără client cere clientul la folosire; cu client din editor merge", async () => {
    const saved = await app.request(
      "/api/payment-accounts/templates",
      json({ name: "Pachet curs", includeBuyer: false, items: [{ description: "Curs", unit: "curs", quantity: 1, unitPriceCents: 100_000 }] })
    );
    const tpl = ((await saved.json()) as { data: { id: string } }).data;
    expect((await app.request(`/api/payment-accounts/templates/${tpl.id}/use`, json({}))).status).toBe(400);
    const ok = await app.request(`/api/payment-accounts/templates/${tpl.id}/use`, json({ buyerName: "Client nou SRL" }));
    expect(ok.status).toBe(201);
  });

  it("[blocant] șabloanele și conturile sunt izolate pe organizație", async () => {
    session = { id: userB, tenantId: tenantB, role: "admin", email: "b@pa.test" };
    const list = (await (await app.request("/api/payment-accounts/templates")).json()) as { data: unknown[] };
    expect(list.data).toHaveLength(0);
    const accounts = (await (await app.request("/api/payment-accounts")).json()) as { data: unknown[] };
    expect(accounts.data).toHaveLength(0);
    // Numărul tenantului B începe de la 1, independent de A.
    expect(await issuedNumber((await draft()).id)).toBe(`CP-${YEAR}-0001`);
  });

  it("[normal] „Duplică” face o ciornă nouă cu același client și aceleași poziții", async () => {
    const source = await draft();
    await issuedNumber(source.id);
    const res = await app.request(`/api/payment-accounts/${source.id}/duplicate`, json({}));
    expect(res.status).toBe(201);
    const copy = ((await res.json()) as { data: { id: string; status: string; buyerIban: string; documentNumber: string | null } }).data;
    expect(copy).toMatchObject({ status: "draft", buyerIban: "MD24AG000225100013104168", documentNumber: null });
  });
});
