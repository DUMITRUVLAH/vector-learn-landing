/**
 * @vitest-environment node
 * VM5-19 — pragul anual per prestator, pe rutele reale (PGlite, toate migrările).
 *
 * Cerința owner-ului (12.09.2026): „dacă un prestator într-un an trece de suma X, nu contează euro,
 * usd, mdl, să apară un semn al exclamării când faci PAR că trebuie de făcut tender. Și finance
 * manager poate după să bifeze că s-a făcut și după să nu apară pentru acel an."
 *
 * Se testează ce ține de bază — adunarea pe prestator peste monede, drepturile la bifă și efectul
 * ei — nu formula, care e verificată separat în `server/lib/par/__tests__/tenderThreshold.test.ts`.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parSettings,
  parMembers,
  parPayers,
  parPayerModules,
  parVendors,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() { return testDb; },
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
let plainUser: string;
let vendorId: string;
const YEAR = 2026;
const L = (lei: number) => lei * 100;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

interface CheckResult {
  applies: boolean; exceeds: boolean; warn: boolean; cleared: boolean;
  thresholdCents: number; yearToDateCents: number; projectedCents: number; overByCents: number;
  year: number; vendorKey?: string; vendorName?: string | null;
}

const check = async (params: Record<string, string>): Promise<CheckResult> => {
  const qs = new URLSearchParams(params).toString();
  const res = await app.request(`/api/par/tender/check?${qs}`);
  return (await res.json()) as CheckResult;
};

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parTenderRoutes } = await import("../routes/parTender");
  app = new Hono();
  app.route("/api/par/tender", parTenderRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-tender" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role: "teacher" }).returning();
    return u.id;
  };
  financeUser = await mkUser("finante@atic.md", "Violeta");
  plainUser = await mkUser("solicitant@atic.md", "Iulian Lungu");
  await testDb.insert(parMembers).values({ tenantId, userId: financeUser, role: "finance" });
  await testDb.insert(parMembers).values({ tenantId, userId: plainUser, role: "requestor" });

  // Pragul organizației: 100.000 lei pe an, per prestator.
  await testDb.insert(parSettings).values({ tenantId, tenderThresholdCents: L(100000) });

  const [vendor] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "Prestator Mare SRL", idno: "1006600034927" })
    .returning();
  vendorId = vendor.id;

  const mkPar = async (no: string, cents: number, currency: string, mdlCents: number | null, extra: Record<string, unknown> = {}) => {
    await testDb.insert(parRequests).values({
      tenantId, payerId: payer.id, requestNo: no, requestedByUserId: plainUser,
      status: "approved", currency, totalEstimatedCents: cents, totalMdlCents: mdlCents,
      vendorId, dateOfRequest: new Date(`${YEAR}-03-01T00:00:00Z`), submittedAt: new Date(`${YEAR}-03-01T00:00:00Z`),
      ...extra,
    });
  };

  // 60.000 lei în lei + 2.000 EUR ≈ 40.000 lei → 100.000 lei angajați anul acesta.
  await mkPar("PAR-2026-0201", L(60000), "MDL", L(60000));
  await mkPar("PAR-2026-0202", L(2000), "EUR", L(40000));
  // Zgomot care NU trebuie numărat: o ciornă, o cerere respinsă și una din alt an.
  await mkPar("PAR-2026-0203", L(500000), "MDL", L(500000), { status: "draft" });
  await mkPar("PAR-2026-0204", L(500000), "MDL", L(500000), { status: "rejected" });
  await mkPar("PAR-2025-0205", L(500000), "MDL", L(500000), { dateOfRequest: new Date("2025-03-01T00:00:00Z") });

  session = { id: plainUser, tenantId, role: "teacher", email: "solicitant@atic.md" };
});

describe("GET /api/par/tender/check", () => {
  it("adună toate monedele la echivalentul în lei", async () => {
    const r = await check({ vendor_id: vendorId, amount_cents: "0", year: String(YEAR) });
    // 60.000 + 40.000 (cei 2.000 EUR), fără ciornă, respinsă sau anul trecut.
    expect(r.yearToDateCents).toBe(L(100000));
  });

  it("avertizează pe chiar cererea care trece pragul", async () => {
    const r = await check({ vendor_id: vendorId, amount_cents: String(L(1)), year: String(YEAR) });
    expect(r.exceeds).toBe(true);
    expect(r.warn).toBe(true);
    expect(r.overByCents).toBe(L(1));
  });

  it("tace când cererea nu trece pragul", async () => {
    const [alt] = await testDb
      .insert(parVendors)
      .values({ tenantId, name: "Prestator Mic SRL", idno: "1009900011122" })
      .returning();
    const r = await check({ vendor_id: alt.id, amount_cents: String(L(5000)), year: String(YEAR) });
    expect(r.warn).toBe(false);
    expect(r.yearToDateCents).toBe(0);
  });

  it("numără și prestatorii nesalvați, după codul fiscal", async () => {
    await testDb.insert(parRequests).values({
      tenantId, requestNo: "PAR-2026-0206", requestedByUserId: plainUser, status: "paid",
      currency: "USD", totalEstimatedCents: L(6000), totalMdlCents: L(110000),
      payeeName: "Firmă Nesalvată SRL", payeeIdnp: "1004400055566",
      dateOfRequest: new Date(`${YEAR}-04-01T00:00:00Z`),
    });
    const r = await check({ payee_idnp: "1004400055566", payee_name: "Firmă Nesalvată SRL", amount_cents: "0", year: String(YEAR) });
    expect(r.yearToDateCents).toBe(L(110000));
    expect(r.warn).toBe(true);
  });

  it("nu se pronunță fără prestator identificabil", async () => {
    const r = await check({ amount_cents: String(L(999999)), year: String(YEAR) });
    expect(r.applies).toBe(false);
    expect(r.warn).toBe(false);
  });
});

describe("bifa finanțelor", () => {
  const postClearance = async (body: unknown) =>
    app.request("/api/par/tender/clearances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("un solicitant NU-și poate ridica singur semnul", async () => {
    session = { id: plainUser, tenantId, role: "teacher", email: "solicitant@atic.md" };
    const res = await postClearance({ vendor_key: `v:${vendorId}`, year: YEAR, vendor_name: "Prestator Mare SRL" });
    expect(res.status).toBe(403);
  });

  it("finanțele bifează, iar semnul dispare pentru acel an", async () => {
    session = { id: financeUser, tenantId, role: "teacher", email: "finante@atic.md" };
    const res = await postClearance({
      vendor_key: `v:${vendorId}`, vendor_id: vendorId, vendor_name: "Prestator Mare SRL",
      year: YEAR, note: "Procedura COP nr. 12 din 10.09.2026",
    });
    expect(res.status).toBe(201);

    const dupa = await check({ vendor_id: vendorId, amount_cents: String(L(50000)), year: String(YEAR) });
    expect(dupa.warn).toBe(false);
    expect(dupa.cleared).toBe(true);
    // Suma continuă să se numere — bifa scutește de avertisment, nu de evidență.
    expect(dupa.exceeds).toBe(true);
    expect(dupa.projectedCents).toBe(L(150000));
  });

  it("bifa e doar pentru anul ei", async () => {
    const altAn = await check({ vendor_id: vendorId, amount_cents: "0", year: String(YEAR + 1) });
    expect(altAn.cleared).toBe(false);
  });

  it("a doua bifă pe același prestator și an nu creează un rând nou", async () => {
    const res = await postClearance({ vendor_key: `v:${vendorId}`, year: YEAR });
    expect(res.status).toBe(200);
    const list = await (await app.request(`/api/par/tender/clearances?year=${YEAR}`)).json() as { items: unknown[] };
    expect(list.items).toHaveLength(1);
  });

  it("bifa pusă din greșeală se poate retrage", async () => {
    const list = await (await app.request(`/api/par/tender/clearances?year=${YEAR}`)).json() as { items: { id: string }[] };
    const res = await app.request(`/api/par/tender/clearances/${list.items[0].id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const dupa = await check({ vendor_id: vendorId, amount_cents: String(L(1)), year: String(YEAR) });
    expect(dupa.warn).toBe(true);
  });
});
