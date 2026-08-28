/**
 * @vitest-environment node
 *
 * FX-001: cursul oficial BNM în PAR — pe o bază PGlite reală, cu BNM înlocuit de un fetch fals.
 *
 * Ce blochează testele (fiecare a fost o greșeală posibilă, nu o ipoteză):
 *  - fiecare endpoint e CHEMAT efectiv (200 + forma răspunsului), nu doar „ruta există";
 *  - `value` vs `mdl_per_unit`: BNM publică 10 lei albanezi ca un singur număr; dacă am confunda
 *    cele două coloane, un calcul cu ALL/JPY ar da de 10–100× greșit;
 *  - o dată fără publicare (weekend/viitor) NU e „zero", ci cursul zilei anterioare, marcat stale;
 *  - conversia dintre două valute străine trece prin leu (cross-rate), cum cotează BNM;
 *  - a doua cerere pentru aceeași zi nu mai lovește bnm.md (se citește din oglinda locală).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { bnmRates } from "../db/schema/bnmRates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u1", tenantId: "t1", role: "admin", email: "violeta@atic.md" });
    c.set("tenantId", "t1");
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

/** Un XML BNM realist: EUR/USD nominal 1, ALL nominal 10 (capcana clasică). */
function xmlFor(dateDdMmYyyy: string, eur: number, usd: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ValCurs Date="${dateDdMmYyyy}" name="Cursul oficial de schimb">
  <Valute ID="47"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Euro</Name><Value>${eur}</Value></Valute>
  <Valute ID="44"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Dolar S.U.A.</Name><Value>${usd}</Value></Valute>
  <Valute ID="64"><NumCode>008</NumCode><CharCode>ALL</CharCode><Nominal>10</Nominal><Name>Leka albaneza</Name><Value>2.0500</Value></Valute>
</ValCurs>`;
}

/** Zilele pe care „BNM" le publică în test; restul întorc XML gol (zi nepublicată). */
const published = new Map<string, string>();
let fetchCalls: string[] = [];

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

/** Ieri / azi în forma locală ISO, ca testul să nu depindă de ziua în care rulează. */
function iso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function ddmmyyyy(isoStr: string): string {
  const [y, m, d] = isoStr.split("-");
  return `${d}.${m}.${y}`;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parFxRoutes } = await import("../routes/parFx");
  app = new Hono();
  app.route("/api/par/fx", parFxRoutes);
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(bnmRates);
  published.clear();
  fetchCalls = [];
  // Azi 20.10 / ieri 20.00 la EUR — o creștere pe care testul o verifică explicit.
  published.set(ddmmyyyy(iso(0)), xmlFor(ddmmyyyy(iso(0)), 20.1, 17.28));
  published.set(ddmmyyyy(iso(-1)), xmlFor(ddmmyyyy(iso(-1)), 20.0, 17.2));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetchCalls.push(String(url));
      const date = String(url).split("date=")[1] ?? "";
      const body = published.get(date) ?? `<?xml version="1.0"?><ValCurs Date="${date}"></ValCurs>`;
      return { ok: true, text: async () => body } as unknown as Response;
    })
  );
});

describe("GET /api/par/fx/rates", () => {
  it("întoarce tabloul zilei, cu variația față de ziua precedentă", async () => {
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.effective_date).toBe(iso(0));
    expect(body.is_stale).toBe(false);
    expect(body.base).toBe("MDL");
    expect(body.source).toBe("BNM");

    const eur = body.rates.find((r: { code: string }) => r.code === "EUR");
    expect(eur.mdl_per_unit).toBeCloseTo(20.1, 6);
    expect(eur.previous_mdl_per_unit).toBeCloseTo(20.0, 6);
    expect(eur.change).toBeCloseTo(0.1, 6);
    expect(eur.change_pct).toBeCloseTo(0.5, 4);
    expect(eur.pinned).toBe(true);
  });

  it("separă cursul publicat de cursul pe o unitate (ALL are nominal 10)", async () => {
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    const body = await res.json();
    const all = body.rates.find((r: { code: string }) => r.code === "ALL");
    expect(all.nominal).toBe(10);
    expect(all.value).toBeCloseTo(2.05, 6);
    expect(all.mdl_per_unit).toBeCloseTo(0.205, 6);
  });

  it("scoate EUR și USD în față, restul alfabetic", async () => {
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    const body = await res.json();
    expect(body.rates.map((r: { code: string }) => r.code).slice(0, 2)).toEqual(["EUR", "USD"]);
  });

  it("pentru o zi fără publicare aplică ultimul curs și o marchează ca atare", async () => {
    published.delete(ddmmyyyy(iso(0)));
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_stale).toBe(true);
    expect(body.effective_date).toBe(iso(-1));
    const eur = body.rates.find((r: { code: string }) => r.code === "EUR");
    expect(eur.mdl_per_unit).toBeCloseTo(20.0, 6);
  });

  it("respinge o dată invalidă în loc s-o trimită la BNM", async () => {
    const res = await app.request("/api/par/fx/rates?date=2026-02-31");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_date");
    expect(fetchCalls).toHaveLength(0);
  });

  it("răspunde 503 când BNM nu are nimic, nu cu o listă goală", async () => {
    published.clear();
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("bnm_unavailable");
  });

  it("nu mai lovește BNM a doua oară pentru aceeași zi", async () => {
    await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    const afterFirst = fetchCalls.length;
    expect(afterFirst).toBeGreaterThan(0);
    fetchCalls = [];
    const res = await app.request(`/api/par/fx/rates?date=${iso(0)}`);
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("GET /api/par/fx/convert", () => {
  it("convertește valută → lei pe cursul zilei", async () => {
    const res = await app.request(`/api/par/fx/convert?from=EUR&to=MDL&amount=100&date=${iso(0)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rate).toBeCloseTo(20.1, 6);
    expect(body.result).toBeCloseTo(2010, 6);
    expect(body.effective_date).toBe(iso(0));
  });

  it("convertește lei → valută (inversul)", async () => {
    const res = await app.request(`/api/par/fx/convert?from=MDL&to=EUR&amount=2010&date=${iso(0)}`);
    const body = await res.json();
    expect(body.result).toBeCloseTo(100, 6);
  });

  it("face cross-rate între două valute străine, prin leu", async () => {
    const res = await app.request(`/api/par/fx/convert?from=EUR&to=USD&amount=1&date=${iso(0)}`);
    const body = await res.json();
    expect(body.rate).toBeCloseTo(20.1 / 17.28, 6);
  });

  it("404 pentru o valută pe care BNM n-o cotează", async () => {
    const res = await app.request(`/api/par/fx/convert?from=XYZ&to=MDL&amount=1&date=${iso(0)}`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("currency_not_quoted");
  });

  it("respinge o sumă care nu e număr", async () => {
    const res = await app.request(`/api/par/fx/convert?from=EUR&to=MDL&amount=abc&date=${iso(0)}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/par/fx/series", () => {
  it("întoarce doar zilele publicate, cu cursul pe unitate", async () => {
    const res = await app.request(`/api/par/fx/series?codes=EUR,USD&days=5&date=${iso(0)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.points.length).toBe(2); // doar azi și ieri sunt publicate
    const last = body.points[body.points.length - 1];
    expect(last.date).toBe(iso(0));
    expect(last.rates.EUR).toBeCloseTo(20.1, 6);
    expect(last.rates.USD).toBeCloseTo(17.28, 6);
  });

  it("plafonează intervalul cerut (nu descarcă un an la o cerere)", async () => {
    const res = await app.request(`/api/par/fx/series?codes=EUR&days=9999&date=${iso(0)}`);
    expect(res.status).toBe(200);
    expect((await res.json()).days).toBe(90);
  });
});
