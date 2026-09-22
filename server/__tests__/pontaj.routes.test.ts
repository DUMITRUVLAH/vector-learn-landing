/**
 * @vitest-environment node
 * PONTAJ-001 — INTEGRATION (rutele reale, PGlite, toate migrările).
 *
 * Ce închid testele: că luna se compune corect din calendar fără nicio scriere prealabilă, că o
 * corecție de zi nu se dublează la a doua salvare, că un concediu se înregistrează pe interval
 * dintr-o singură intrare, și — cel mai important pentru un modul self-service — că nimeni nu
 * vede și nu atinge pontajul altcuiva, nici măcar cu un id valid din alt cont.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string; name: string; timezone: string };

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
let ana: typeof session;
let boris: typeof session;
let adminAna: typeof session;

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

interface MonthBody {
  month: string;
  employee: { name: string; dailyMinutes: number; jobTitle: string | null };
  days: { date: string; symbol: string; minutes: number; source: string; holidayName?: string }[];
  totals: { counts: Record<string, number>; workedMinutes: number; workedDays: number };
  leaves: { id: string; symbol: string; startDate: string; endDate: string }[];
  jurisdiction: { code: string; form: { title: string } };
  org: { country: string; unitName: string | null };
}

async function getMonth(month: string): Promise<MonthBody> {
  const res = await app.request(`/api/pontaj/month?month=${month}`);
  expect(res.status).toBe(200);
  return (await res.json()) as MonthBody;
}

async function post(url: string, body: unknown, method = "POST") {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function day(month: MonthBody, date: string) {
  const found = month.days.find((d) => d.date === date);
  if (!found) throw new Error(`ziua ${date} lipsește din luna ${month.month}`);
  return found;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { pontajRoutes } = await import("../routes/pontaj");
  app = new Hono();
  app.route("/api/pontaj", pontajRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-pontaj" }).returning();
  const [anaRow] = await testDb
    .insert(users)
    .values({ tenantId: vector.id, email: "ana@vector.md", name: "Ana Rusu", role: "teacher" })
    .returning();
  const [borisRow] = await testDb
    .insert(users)
    .values({ tenantId: vector.id, email: "boris@vector.md", name: "Boris Lungu", role: "teacher" })
    .returning();

  const mk = (u: typeof anaRow, role: string) => ({
    id: u.id,
    tenantId: u.tenantId,
    role,
    email: u.email,
    name: u.name,
    timezone: "Europe/Chisinau",
  });
  ana = mk(anaRow, "teacher");
  boris = mk(borisRow, "teacher");
  adminAna = mk(anaRow, "admin");
  session = ana;
});

describe("luna se compune din calendar, fără nicio scriere prealabilă", () => {
  it("completează 8 ore implicit și pune numele omului pe tabel", async () => {
    session = ana;
    const march = await getMonth("2026-03");
    expect(march.employee.name).toBe("Ana Rusu");
    expect(march.employee.dailyMinutes).toBe(480);
    expect(march.days).toHaveLength(31);
    expect(day(march, "2026-03-02").symbol).toBe("P");
    expect(day(march, "2026-03-02").minutes).toBe(480);
    expect(day(march, "2026-03-02").source).toBe("norm");
  });

  it("aplică implicit jurisdicția moldovenească", async () => {
    const march = await getMonth("2026-03");
    expect(march.org.country).toBe("MD");
    expect(march.jurisdiction.code).toBe("MD");
    expect(march.jurisdiction.form.title).toContain("TABEL DE EVIDENȚĂ");
    // 8 martie 2026 e duminică ȘI Ziua internațională a femeii — o singură zi liberă.
    expect(day(march, "2026-03-08").symbol).toBe("Sn");
    expect(day(march, "2026-03-08").holidayName).toContain("femeii");
  });

  it("scurtează ziua din ajunul sărbătorii cu o oră", async () => {
    const january = await getMonth("2026-01");
    expect(day(january, "2026-01-06").minutes).toBe(420);
    expect(day(january, "2026-01-06").source).toBe("pre_holiday");
  });

  it("refuză o lună scrisă greșit căzând pe luna curentă, nu pe 500", async () => {
    const res = await app.request("/api/pontaj/month?month=luna-viitoare");
    expect(res.status).toBe(200);
    expect(((await res.json()) as MonthBody).month).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("corecția unei zile", () => {
  it("salvează, apoi suprascrie aceeași zi în loc să adauge un rând nou", async () => {
    session = ana;
    expect((await post("/api/pontaj/day", { date: "2026-03-03", symbol: "P", minutes: 360 }, "PUT")).status).toBe(200);
    let march = await getMonth("2026-03");
    expect(day(march, "2026-03-03").minutes).toBe(360);
    expect(day(march, "2026-03-03").source).toBe("manual");

    expect((await post("/api/pontaj/day", { date: "2026-03-03", symbol: "P", minutes: 300 }, "PUT")).status).toBe(200);
    march = await getMonth("2026-03");
    expect(day(march, "2026-03-03").minutes).toBe(300);
    expect(march.days.filter((d) => d.date === "2026-03-03")).toHaveLength(1);
  });

  it("permite ziua lucrată în weekend", async () => {
    await post("/api/pontaj/day", { date: "2026-03-07", symbol: "P", minutes: 240 }, "PUT");
    const march = await getMonth("2026-03");
    expect(day(march, "2026-03-07").symbol).toBe("P");
    expect(day(march, "2026-03-07").minutes).toBe(240);
  });

  it("nu scrie ore pe un simbol care nu e zi lucrată", async () => {
    await post("/api/pontaj/day", { date: "2026-03-04", symbol: "Cm", minutes: 480 }, "PUT");
    expect(day(await getMonth("2026-03"), "2026-03-04").minutes).toBe(0);
  });

  it("cere durata pentru o zi lucrată și refuză un simbol inventat", async () => {
    expect((await post("/api/pontaj/day", { date: "2026-03-05", symbol: "P", minutes: 0 }, "PUT")).body.error)
      .toBe("hours_required");
    expect((await post("/api/pontaj/day", { date: "2026-03-05", symbol: "ZZ" }, "PUT")).body.error)
      .toBe("unknown_symbol");
    expect((await post("/api/pontaj/day", { date: "2026-03-05", symbol: "P", minutes: 900 }, "PUT")).body.error)
      .toBe("hours_too_large");
  });

  it("readuce ziua la valoarea calculată", async () => {
    const res = await app.request("/api/pontaj/day/2026-03-03", { method: "DELETE" });
    expect(res.status).toBe(200);
    const march = await getMonth("2026-03");
    expect(day(march, "2026-03-03").minutes).toBe(480);
    expect(day(march, "2026-03-03").source).toBe("norm");
  });
});

describe("concediu pe mai multe zile, dintr-o singură intrare", () => {
  it("acoperă tot intervalul și spune câte zile lucrătoare atinge", async () => {
    session = ana;
    const created = await post("/api/pontaj/leaves", {
      symbol: "C",
      startDate: "2026-03-09",
      endDate: "2026-03-20",
      note: "cerere 12",
    });
    expect(created.status).toBe(201);
    expect(created.body.calendarDays).toBe(12);
    expect(created.body.workingDays).toBe(10); // 12 calendaristice − sâmbăta și duminica

    const march = await getMonth("2026-03");
    expect(march.days.filter((d) => d.symbol === "C")).toHaveLength(12);
    expect(march.totals.counts.c).toBe(12);
    expect(day(march, "2026-03-14").symbol).toBe("C"); // sâmbăta din interiorul concediului
  });

  it("se vede și în luna următoare când trece peste graniță", async () => {
    await post("/api/pontaj/leaves", { symbol: "Cm", startDate: "2026-03-30", endDate: "2026-04-03" });
    const april = await getMonth("2026-04");
    expect(april.days.filter((d) => d.symbol === "Cm").map((d) => d.date)).toEqual([
      "2026-04-01", "2026-04-02", "2026-04-03",
    ]);
  });

  it("refuză un interval întors sau absurd de lung", async () => {
    expect((await post("/api/pontaj/leaves", { symbol: "C", startDate: "2026-03-10", endDate: "2026-03-01" })).body.error)
      .toBe("end_before_start");
    expect((await post("/api/pontaj/leaves", { symbol: "C", startDate: "2026-01-01", endDate: "2030-01-01" })).body.error)
      .toBe("range_too_long");
    expect((await post("/api/pontaj/leaves", { symbol: "Sn", startDate: "2026-03-10", endDate: "2026-03-11" })).body.error)
      .toBe("unknown_symbol");
  });

  it("se anulează întreg, dintr-o singură ștergere", async () => {
    session = ana;
    const march = await getMonth("2026-03");
    const leave = march.leaves.find((l) => l.symbol === "C")!;
    const res = await app.request(`/api/pontaj/leaves/${leave.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const after = await getMonth("2026-03");
    expect(after.days.filter((d) => d.symbol === "C")).toHaveLength(0);
  });
});

describe("self-service înseamnă self-service", () => {
  it("nu arată nimănui pontajul altuia", async () => {
    session = ana;
    await post("/api/pontaj/leaves", { symbol: "Cs", startDate: "2026-05-04", endDate: "2026-05-08" });
    await post("/api/pontaj/day", { date: "2026-05-12", symbol: "P", minutes: 120 }, "PUT");

    session = boris;
    const borisMay = await getMonth("2026-05");
    expect(borisMay.employee.name).toBe("Boris Lungu");
    expect(borisMay.leaves).toHaveLength(0);
    expect(borisMay.days.filter((d) => d.symbol === "Cs")).toHaveLength(0);
    expect(day(borisMay, "2026-05-12").minutes).toBe(480);
  });

  it("nu lasă pe nimeni să șteargă concediul altuia, nici cu id-ul corect", async () => {
    session = ana;
    const anaMay = await getMonth("2026-05");
    const leaveId = anaMay.leaves[0].id;

    session = boris;
    const res = await app.request(`/api/pontaj/leaves/${leaveId}`, { method: "DELETE" });
    expect(res.status).toBe(404);

    session = ana;
    expect((await getMonth("2026-05")).leaves).toHaveLength(1);
  });
});

describe("setările proprii și ale organizației", () => {
  it("schimbă norma zilnică și recompune luna", async () => {
    session = boris;
    const saved = await post("/api/pontaj/settings", { dailyMinutes: 240, jobTitle: "arhivar" }, "PUT");
    expect(saved.status).toBe(200);
    const june = await getMonth("2026-06");
    expect(june.employee.dailyMinutes).toBe(240);
    expect(june.employee.jobTitle).toBe("arhivar");
    expect(day(june, "2026-06-02").minutes).toBe(240);
  });

  it("nu scurtează ajunul pentru cel cu program redus declarat", async () => {
    session = boris;
    // 25 decembrie e sărbătoare, deci 24 decembrie e zi de ajun și s-ar fi scurtat la 7 ore.
    await post("/api/pontaj/settings", { dailyMinutes: 480, reducedSchedule: true }, "PUT");
    const december = await getMonth("2026-12");
    expect(day(december, "2026-12-24").minutes).toBe(480);
    await post("/api/pontaj/settings", { reducedSchedule: false }, "PUT");
    expect(day(await getMonth("2026-12"), "2026-12-24").minutes).toBe(420);
  });

  it("lasă doar administratorii să schimbe setările organizației", async () => {
    session = boris;
    expect((await post("/api/pontaj/org", { unitName: "SRL Test" }, "PUT")).status).toBe(403);

    session = adminAna;
    const ok = await post("/api/pontaj/org", { unitName: "Vector Academy SRL", country: "RO" }, "PUT");
    expect(ok.status).toBe(200);

    session = boris;
    const july = await getMonth("2026-07");
    expect(july.org.unitName).toBe("Vector Academy SRL");
    // Jurisdicția schimbată se vede imediat: formularul nu mai e cel moldovenesc.
    expect(july.jurisdiction.code).toBe("RO");
    expect(july.jurisdiction.form.title).toContain("FOAIE COLECTIVĂ");

    session = adminAna;
    await post("/api/pontaj/org", { country: "MD" }, "PUT");
  });
});

describe("zilele nelucrătoare proprii organizației", () => {
  it("adaugă Hramul localității și îl tratează ca sărbătoare pentru toți", async () => {
    session = adminAna;
    const created = await post("/api/pontaj/holidays", { date: "2026-10-14", name: "Hramul orașului" });
    expect(created.status).toBe(201);

    session = boris;
    const october = await getMonth("2026-10");
    expect(day(october, "2026-10-14").symbol).toBe("Sn");
    expect(day(october, "2026-10-14").holidayName).toBe("Hramul orașului");
    // 13 octombrie devine ajun, exact ca înaintea unei sărbători legale.
    expect(day(october, "2026-10-13").minutes).toBe(420);
  });

  it("listează sărbătorile legale ale anului lângă cele proprii", async () => {
    session = boris;
    const res = await app.request("/api/pontaj/holidays?year=2026");
    const body = (await res.json()) as {
      legal: { date: string }[];
      company: { date: string }[];
      canEdit: boolean;
    };
    expect(body.legal.map((h) => h.date)).toContain("2026-08-27");
    expect(body.company.map((h) => h.date)).toContain("2026-10-14");
    expect(body.canEdit).toBe(false);
  });

  it("nu lasă un angajat obișnuit să scrie zile nelucrătoare", async () => {
    session = boris;
    expect((await post("/api/pontaj/holidays", { date: "2026-11-05", name: "Zi liberă inventată" })).status).toBe(403);
  });
});
