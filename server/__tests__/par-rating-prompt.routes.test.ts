/**
 * @vitest-environment node
 *
 * „Iar m-am logat și mi-a apărut să dau feedback" (owner, 2026-08-31).
 *
 * Urma că întrebarea a fost pusă stătea doar în `localStorage`, deci nu ajungea nicăieri altundeva:
 * alt calculator, altă fereastră, stocare curățată → aceeași întrebare, despre aceeași cerere. Acum
 * urma e o coloană (`par_requests.rating_prompted_at`), iar testele de aici CHEMĂ rutele reale
 * (CLAUDE.md §3.5.1quater): întreabă lista, marchează, întreabă din nou.
 *
 * Pe codul vechi (fără coloană și fără ruta de marcare) al doilea GET întorcea din nou cererea —
 * exact bug-ul raportat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parRequests } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let userA: string;
let userB: string;
let vendorId: string;

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

import { parVendorProfileRoutes } from "../routes/parVendorProfile";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/par/vendors", parVendorProfileRoutes);

const get = (p: string, who = "a") => app.request(p, { headers: { cookie: `vl_session=${who}` } });
const post = (p: string, body: unknown, who = "a") =>
  app.request(p, {
    method: "POST",
    headers: { cookie: `vl_session=${who}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000);

async function paidRequest(opts: { requestNo: string; by: string; paidAt: Date }) {
  const [row] = await testDb
    .insert(parRequests)
    .values({
      tenantId: tenantA,
      requestNo: opts.requestNo,
      requestedByUserId: opts.by,
      vendorId,
      payeeName: "Centrul de Resurse Juridice",
      status: "paid",
      paidAt: opts.paidAt,
      totalEstimatedCents: 600_000,
    })
    .returning();
  return row;
}

interface PendingBody {
  pending: { parId: string; requestNo: string; vendorName: string }[];
}

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [t] = await testDb
    .insert(tenants)
    .values({ name: "ONG A", slug: "ong-a", plan: "starter", appKind: "business" })
    .returning();
  tenantA = t.id;
  const [a] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "a@ong.md", passwordHash: "x", name: "Solicitant", role: "admin" })
    .returning();
  userA = a.id;
  const [b] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "b@ong.md", passwordHash: "x", name: "Coleg", role: "admin" })
    .returning();
  userB = b.id;
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId: tenantA, name: "Centrul de Resurse Juridice", active: true })
    .returning();
  vendorId = v.id;
}, 90_000);

afterAll(async () => {
  await pglite.close();
});

describe("întrebarea de evaluare se pune o singură dată", () => {
  it("apare o dată, apoi nu mai apare nici la o autentificare nouă", async () => {
    const par = await paidRequest({ requestNo: "PAR-2026-0025", by: userA, paidAt: daysAgo(1) });

    const first = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(first.pending.map((p) => p.parId)).toContain(par.id);
    expect(first.pending.find((p) => p.parId === par.id)?.vendorName).toBe("Centrul de Resurse Juridice");

    const marked = await post("/api/par/vendors/pending-ratings/asked", { par_id: par.id });
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ ok: true, marked: true });

    // „Sesiune nouă": același om, alt browser. Aici pica înainte — urma nu ajungea pe server.
    const second = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(second.pending.map((p) => p.parId)).not.toContain(par.id);

    const stored = await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, par.id) });
    expect(stored?.ratingPromptedAt).toBeInstanceOf(Date);
  });

  it("a doua marcare nu rescrie momentul primei întrebări și tot răspunde 200", async () => {
    const par = await paidRequest({ requestNo: "PAR-2026-0026", by: userA, paidAt: daysAgo(2) });
    await post("/api/par/vendors/pending-ratings/asked", { par_id: par.id });
    const firstAt = (await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, par.id) }))
      ?.ratingPromptedAt;

    const again = await post("/api/par/vendors/pending-ratings/asked", { par_id: par.id });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, marked: false });

    const after = await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, par.id) });
    expect(after?.ratingPromptedAt?.toISOString()).toBe(firstAt?.toISOString());
  });

  it("nimeni nu poate stinge întrebarea altcuiva", async () => {
    const par = await paidRequest({ requestNo: "PAR-2026-0027", by: userA, paidAt: daysAgo(1) });
    const res = await post("/api/par/vendors/pending-ratings/asked", { par_id: par.id }, "b");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, marked: false });

    const mine = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(mine.pending.map((p) => p.parId)).toContain(par.id);
  });

  it("o plată veche nu mai declanșează popup — se poate evalua oricând din fișă", async () => {
    const old = await paidRequest({ requestNo: "PAR-2026-0002", by: userA, paidAt: daysAgo(60) });
    const body = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(body.pending.map((p) => p.parId)).not.toContain(old.id);
  });

  it("cererea altui coleg nu intră în popup-ul meu", async () => {
    const his = await paidRequest({ requestNo: "PAR-2026-0028", by: userB, paidAt: daysAgo(1) });
    const body = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(body.pending.map((p) => p.parId)).not.toContain(his.id);
  });

  it("nota dată dispare din listă și se vede în fișa furnizorului, la cererea ei", async () => {
    const par = await paidRequest({ requestNo: "PAR-2026-0029", by: userA, paidAt: daysAgo(1) });

    const rated = await post(`/api/par/vendors/${vendorId}/ratings`, {
      stars: 4,
      par_id: par.id,
      comment: "Au livrat la timp, dar factura a venit greu.",
      would_use_again: true,
    });
    expect(rated.status).toBe(201);

    const pending = (await (await get("/api/par/vendors/pending-ratings")).json()) as PendingBody;
    expect(pending.pending.map((p) => p.parId)).not.toContain(par.id);

    // Ce a cerut owner-ul să se VADĂ pe fișă: nota, comentariul, autorul și cererea de la care vine.
    const list = (await (await get(`/api/par/vendors/${vendorId}/ratings`)).json()) as {
      ratings: { stars: number; comment: string | null; authorName: string; requestNo: string | null }[];
      summary: { count: number; avg: number | null };
    };
    const mine = list.ratings.find((r) => r.requestNo === "PAR-2026-0029");
    expect(mine).toBeDefined();
    expect(mine?.stars).toBe(4);
    expect(mine?.comment).toBe("Au livrat la timp, dar factura a venit greu.");
    expect(mine?.authorName).toBe("Solicitant");
    expect(list.summary.count).toBeGreaterThanOrEqual(1);
    expect(list.summary.avg).not.toBeNull();
  });
});
