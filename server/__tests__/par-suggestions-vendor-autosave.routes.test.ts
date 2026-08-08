/**
 * @vitest-environment node
 *
 * Sugestii de articole + auto-salvarea beneficiarului — teste de INTEGRARE pe rutele Hono
 * reale + PGlite.
 *
 * Regula CLAUDE.md §3.5.1quater („testează ACȚIUNEA, nu butonul"): fiecare comportament nou
 * e CHEMAT cu date realiste și i se verifică statusul + forma răspunsului. Ce blochează aici:
 *   1. sugestiile nu scurg date între tenanți, și nu propun ciorne/cereri respinse
 *   2. sugestia cară cu ea rechizitele beneficiarului (asta e tot rostul funcției)
 *   3. auto-salvarea NU creează dubluri când același IBAN mai fusese folosit
 *   4. auto-salvarea completează câmpurile lipsă, dar nu suprascrie ce a curatat un om
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parLineItems, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  getSessionUser: vi.fn(async (token: string) => {
    const id = token === "a" ? userA : token === "b" ? userB : null;
    if (!id) return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, id) });
    return user ? { session: { id: "s" }, user } : null;
  }),
}));

import { parSuggestionsRoutes } from "../routes/parSuggestions";
import { autosaveVendorFromPar } from "../lib/par/vendorAutoSave";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/par/suggestions", parSuggestionsRoutes);

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

const asA = (p: string) => app.request(p, { headers: { cookie: "vl_session=a" } });
const asB = (p: string) => app.request(p, { headers: { cookie: "vl_session=b" } });

interface SuggestionsBody {
  suggestions: Array<{
    description: string;
    unit: string | null;
    unitPriceCents: number;
    currency: string;
    usageCount: number;
    sourceRequestNo: string;
    payee: { name: string | null; iban: string | null; idnp: string | null; bank: string | null };
  }>;
  total: number;
}

/** Insert a PAR plus one line item, as if it had gone through the form. */
async function seedPar(opts: {
  tenantId: string;
  userId: string;
  requestNo: string;
  status: "draft" | "paid" | "rejected" | "pending_approval";
  description: string;
  unitPriceCents: number;
  currency?: string;
  payeeName?: string;
  payeeIban?: string;
  payeeIdnp?: string;
  payeeBank?: string;
}) {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId: opts.tenantId,
      requestNo: opts.requestNo,
      requestedByUserId: opts.userId,
      status: opts.status,
      currency: opts.currency ?? "MDL",
      totalEstimatedCents: opts.unitPriceCents,
      payeeName: opts.payeeName ?? null,
      payeeIban: opts.payeeIban ?? null,
      payeeIdnp: opts.payeeIdnp ?? null,
      payeeBank: opts.payeeBank ?? null,
      payeeType: "juridic",
    })
    .returning();
  await testDb.insert(parLineItems).values({
    tenantId: opts.tenantId,
    parId: par.id,
    position: 1,
    description: opts.description,
    quantity: 1,
    unit: "servicii",
    unitPriceCents: opts.unitPriceCents,
    lineTotalCents: opts.unitPriceCents,
  });
  return par;
}

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [tA] = await testDb.insert(tenants).values({ name: "ONG A", slug: "ong-a", plan: "starter", appKind: "business" }).returning();
  tenantA = tA.id;
  const [uA] = await testDb.insert(users).values({ tenantId: tenantA, email: "a@ong.md", passwordHash: "x", name: "A", role: "admin" }).returning();
  userA = uA.id;

  const [tB] = await testDb.insert(tenants).values({ name: "ONG B", slug: "ong-b", plan: "starter", appKind: "business" }).returning();
  tenantB = tB.id;
  const [uB] = await testDb.insert(users).values({ tenantId: tenantB, email: "b@ong.md", passwordHash: "x", name: "B", role: "admin" }).returning();
  userB = uB.id;
}, 90_000);

afterAll(async () => {
  await pglite.close();
});

describe("GET /api/par/suggestions/line-items", () => {
  it("întoarce articolele din cererile trecute, cu rechizitele beneficiarului", async () => {
    await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0001", status: "paid",
      description: "Servicii de audit financiar", unitPriceCents: 1_200_00,
      payeeName: "Audit SRL", payeeIban: "MD24AG000225100013104168", payeeIdnp: "1010600012345", payeeBank: "MAIB",
    });

    const res = await asA("/api/par/suggestions/line-items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionsBody;

    const hit = body.suggestions.find((s) => s.description === "Servicii de audit financiar");
    expect(hit).toBeDefined();
    // Fără rechizite, sugestia n-ar economisi nimic — asta e tot rostul ei.
    expect(hit!.payee.name).toBe("Audit SRL");
    expect(hit!.payee.iban).toBe("MD24AG000225100013104168");
    expect(hit!.payee.idnp).toBe("1010600012345");
    expect(hit!.unitPriceCents).toBe(1_200_00);
    expect(hit!.currency).toBe("MDL");
    expect(hit!.sourceRequestNo).toBe("PAR-2026-0001");
  });

  it("numără reutilizările și ignoră diferențele de majuscule/spații", async () => {
    await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0002", status: "pending_approval",
      description: "servicii  de AUDIT financiar", unitPriceCents: 1_300_00, payeeName: "Audit SRL",
    });

    const res = await asA("/api/par/suggestions/line-items?q=audit");
    const body = (await res.json()) as SuggestionsBody;
    const hits = body.suggestions.filter((s) => s.description.toLowerCase().includes("audit"));
    expect(hits).toHaveLength(1);
    expect(hits[0].usageCount).toBe(2);
  });

  it("nu propune ciorne sau cereri respinse", async () => {
    await seedPar({ tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0003", status: "draft", description: "Ciorna netrimisa", unitPriceCents: 100 });
    await seedPar({ tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0004", status: "rejected", description: "Cerere respinsa", unitPriceCents: 100 });

    const body = (await (await asA("/api/par/suggestions/line-items")).json()) as SuggestionsBody;
    const descriptions = body.suggestions.map((s) => s.description);
    expect(descriptions).not.toContain("Ciorna netrimisa");
    expect(descriptions).not.toContain("Cerere respinsa");
  });

  it("nu scurge articolele altui tenant", async () => {
    await seedPar({
      tenantId: tenantB, userId: userB, requestNo: "PAR-B-0001", status: "paid",
      description: "Secret al lui B", unitPriceCents: 999_00, payeeName: "Furnizor B",
    });

    const body = (await (await asA("/api/par/suggestions/line-items")).json()) as SuggestionsBody;
    expect(body.suggestions.map((s) => s.description)).not.toContain("Secret al lui B");

    const bodyB = (await (await asB("/api/par/suggestions/line-items")).json()) as SuggestionsBody;
    expect(bodyB.suggestions.map((s) => s.description)).toContain("Secret al lui B");
  });

  it("cere autentificare", async () => {
    const res = await app.request("/api/par/suggestions/line-items");
    expect(res.status).toBe(401);
  });
});

describe("autosaveVendorFromPar", () => {
  it("salvează beneficiarul fără ca cineva să apese „salvează”", async () => {
    const par = await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0010", status: "pending_approval",
      description: "Chirie sala", unitPriceCents: 500_00,
      payeeName: "Imobil Plus SRL", payeeIban: "MD11AG000225100099887766", payeeIdnp: "1010600099887", payeeBank: "MAIB",
    });

    const res = await autosaveVendorFromPar(par.id, tenantA);
    expect(res.outcome).toBe("created");

    const vendor = await testDb.query.parVendors.findFirst({ where: eq(parVendors.id, res.vendorId!) });
    expect(vendor?.name).toBe("Imobil Plus SRL");
    expect(vendor?.iban).toBe("MD11AG000225100099887766");
    // Cererea trebuie să rămână legată de furnizorul creat, altfel data viitoare se face iar unul nou.
    const linked = await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, par.id) });
    expect(linked?.vendorId).toBe(res.vendorId);
  });

  it("NU creează dublură când același IBAN revine (scris cu spații/altfel)", async () => {
    const par = await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0011", status: "pending_approval",
      description: "Chirie sala (luna 2)", unitPriceCents: 500_00,
      payeeName: "IMOBIL PLUS S.R.L.", payeeIban: "md11 ag00 0225 1000 9988 7766",
    });

    const before = await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantA));
    const res = await autosaveVendorFromPar(par.id, tenantA);
    const after = await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantA));

    expect(res.outcome).not.toBe("created");
    expect(after.length).toBe(before.length);
  });

  it("completează câmpurile lipsă, dar nu suprascrie ce există deja", async () => {
    const [vendor] = await testDb
      .insert(parVendors)
      .values({ tenantId: tenantA, name: "Transport SRL", iban: "MD99AG000225100011112222", bank: "Banca curatata de om" })
      .returning();

    const par = await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0012", status: "pending_approval",
      description: "Transport participanti", unitPriceCents: 800_00,
      payeeName: "Transport SRL", payeeIban: "MD99AG000225100011112222",
      payeeIdnp: "1010600055555", payeeBank: "Alta banca din document",
    });

    await autosaveVendorFromPar(par.id, tenantA);
    const updated = await testDb.query.parVendors.findFirst({ where: eq(parVendors.id, vendor.id) });
    expect(updated?.idnp).toBe("1010600055555"); // lipsea → completat
    expect(updated?.bank).toBe("Banca curatata de om"); // exista → păstrat
  });

  it("sare peste o cerere fără nume de beneficiar în loc să creeze un rând gol", async () => {
    const par = await seedPar({
      tenantId: tenantA, userId: userA, requestNo: "PAR-2026-0013", status: "pending_approval",
      description: "Fara beneficiar", unitPriceCents: 100_00,
    });
    const res = await autosaveVendorFromPar(par.id, tenantA);
    expect(res.outcome).toBe("skipped");
  });
});
