/**
 * @vitest-environment node
 * PAR-ARH — arhiva cererilor. INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * De ce există: cererile nefinalizate rămâneau pentru totdeauna în lista de lucru. Cererea
 * utilizatoarei (22.09.2026): „acest PAR nefinalizat a rămas ca «ciornă», care rămâne în toată
 * lista cereri. Se poate de avut opțiunea de a face curat […]? Ele duc în eroare."
 *
 * Se testează ACȚIUNEA, nu afișarea (§3.5.1quater): fiecare scenariu chiar cheamă ruta și verifică
 * ce s-a schimbat în listă, în rând și în jurnal.
 *
 * Acoperit:
 *   1. POST /:id/archive → 200; cererea dispare din GET /api/par, apare în GET /api/par?archived=1;
 *      statusul NU se schimbă; jurnalul primește `archived`.
 *   2. POST /:id/unarchive → cererea revine în lista de lucru; jurnal `unarchived`.
 *   3. O cerere aflată în flux (trimisă spre aprobare) NU se arhivează → 409, cu ce e de făcut.
 *   4. Doar autorul sau un par_admin pot arhiva; un coleg primește 403.
 *   5. REGRESIE: o ciornă arhivată, apoi TRIMISĂ, iese singură din arhivă — altfel ar fi dispărut
 *      tăcut din listă exact când ajungea „plătită".
 *   6. A doua arhivare e idempotentă (200, fără a doua intrare în jurnal); nota rămâne în jurnal.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parLineItems,
  parAudit,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
  parDoaMatrix,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let payerId: string;
let authorId: string;
let colleagueId: string;
let adminId: string;
let approverId: string;

/** Cine face cererea HTTP acum (rutele citesc `user` din context). */
let caller: { id: string; role: string } = { id: "", role: "teacher" };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: caller.id, tenantId, role: caller.role, email: "user@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

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

const post = (p: string, body?: unknown) =>
  app.request(p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

interface ListBody {
  requests: { id: string; status: string; archivedAt?: string | null }[];
  total: number;
  archived_total?: number;
}

async function list(archived = false): Promise<ListBody> {
  const res = await app.request(`/api/par${archived ? "?archived=1" : ""}`);
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}

async function auditEvents(parId: string): Promise<string[]> {
  const rows = await testDb
    .select({ event: parAudit.event })
    .from(parAudit)
    .where(and(eq(parAudit.parId, parId), eq(parAudit.tenantId, tenantId)));
  return rows.map((r) => r.event);
}

async function rowOf(parId: string) {
  const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
  return row;
}

let seq = 100;
/** O ciornă completă, gata de trimis (are tot ce cere submit-ul: scop, beneficiar, articole). */
async function draft(): Promise<string> {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId,
      requestNo: `PAR-2026-0${seq++}`,
      requestedByUserId: authorId,
      purpose: "execute_payment",
      chargeTo: "program",
      endUse: "Materiale pentru atelier",
      payeeName: "Robotics Supply SRL",
      payeeIban: "MD24AG000225100013104168",
      currency: "MDL",
      totalEstimatedCents: 340090,
      status: "draft",
    })
    .returning();
  await testDb.insert(parLineItems).values({
    tenantId,
    parId: par.id,
    position: 1,
    description: "Kituri Arduino",
    quantity: "10",
    unitPriceCents: 34009,
    lineTotalCents: 340090,
  });
  return par.id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-archive-par" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string, role: "manager" | "teacher") => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return u.id;
  };
  authorId = await mkUser("ana@atic.md", "Ana Solicitanta", "teacher");
  colleagueId = await mkUser("ion@atic.md", "Ion Coleg", "teacher");
  adminId = await mkUser("admin@atic.md", "Admin Workspace", "manager");
  approverId = await mkUser("iulian@atic.md", "Iulian Aprobator", "teacher");

  await testDb.insert(parMembers).values([
    { tenantId, userId: authorId, role: "requestor" as const },
    { tenantId, userId: colleagueId, role: "requestor" as const },
    { tenantId, userId: approverId, role: "approver" as const },
  ]);
  for (const userId of [authorId, colleagueId, adminId, approverId]) {
    await testDb.insert(parPayerMembers).values({ tenantId, payerId, userId });
  }

  // Un singur pas de aprobare — atât cât să existe un lanț valid la trimitere.
  await testDb.insert(parDoaMatrix).values({
    tenantId,
    step: 1,
    approverRoleLabel: "Aprobator",
    approverParRole: "approver" as const,
    minAmountCents: 0,
    maxAmountCents: null,
  });

  caller = { id: authorId, role: "teacher" };
  // 240s: sub paralelism, migrarea completă pe PGlite poate depăși 120s.
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("PAR-ARH — arhivarea unei cereri", () => {
  it("[blocant] arhivarea scoate ciorna din lista de cereri și o mută în arhivă, fără să-i schimbe statusul", async () => {
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();

    expect((await list()).requests.map((r) => r.id)).toContain(parId);

    const res = await post(`/api/par/${parId}/archive`, { note: "am renunțat, am făcut alta" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { archived: boolean }).toMatchObject({ archived: true });

    expect((await list()).requests.map((r) => r.id)).not.toContain(parId);
    expect((await list(true)).requests.map((r) => r.id)).toContain(parId);

    // Nimic nu s-a șters și nimic nu s-a mutat: statusul e tot ciornă, doar că iese din listă.
    const row = await rowOf(parId);
    expect(row.status).toBe("draft");
    expect(row.archivedAt).not.toBeNull();
    expect(row.archivedByUserId).toBe(authorId);

    expect(await auditEvents(parId)).toContain("archived");

    // Contorul filei „Arhivate" vine în ACELAȘI răspuns cu lista de lucru — fila își poartă
    // numărul fără o a doua cerere la server.
    const work = await list();
    expect(work.archived_total).toBeGreaterThanOrEqual(1);
    expect(work.archived_total).toBe((await list(true)).total);
  });

  it("[blocant] nota de arhivare rămâne în jurnal, iar a doua arhivare nu scrie una nouă", async () => {
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();

    expect((await post(`/api/par/${parId}/archive`, { note: "nu mai avem nevoie" })).status).toBe(200);
    // Al doilea click (sau a doua filă) — răspuns identic, fără o a doua urmă în jurnal.
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(200);

    const [entry] = await testDb
      .select({ detail: parAudit.detail })
      .from(parAudit)
      .where(and(eq(parAudit.parId, parId), eq(parAudit.event, "archived")));
    expect(entry.detail).toContain("nu mai avem nevoie");
    expect((await auditEvents(parId)).filter((e) => e === "archived")).toHaveLength(1);
  });

  it("[blocant] restaurarea readuce cererea în lista de lucru", async () => {
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(200);

    const res = await post(`/api/par/${parId}/unarchive`);
    expect(res.status).toBe(200);

    expect((await list()).requests.map((r) => r.id)).toContain(parId);
    expect((await list(true)).requests.map((r) => r.id)).not.toContain(parId);
    expect((await rowOf(parId)).archivedAt).toBeNull();
    expect(await auditEvents(parId)).toContain("unarchived");
  });

  it("[blocant] o cerere aflată la aprobare NU se arhivează, iar răspunsul spune ce e de făcut", async () => {
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();
    expect((await post(`/api/par/${parId}/submit`)).status).toBe(200);

    const res = await post(`/api/par/${parId}/archive`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; status: string; message: string };
    expect(body.status).toBe("pending_approval");
    // Nu „conflict" sec: omul trebuie să afle că întâi retrage cererea.
    expect(body.message).toMatch(/[Rr]etrage/);

    // Cererea a rămas exact unde era — vizibilă pentru toată lumea.
    expect((await rowOf(parId)).archivedAt).toBeNull();
    expect((await list()).requests.map((r) => r.id)).toContain(parId);
  });

  it("[blocant] un coleg nu poate arhiva cererea altuia; un par_admin poate", async () => {
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();

    caller = { id: colleagueId, role: "teacher" };
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(403);
    expect((await rowOf(parId)).archivedAt).toBeNull();

    caller = { id: adminId, role: "manager" };
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(200);
    expect((await rowOf(parId)).archivedAt).not.toBeNull();
    expect((await rowOf(parId)).archivedByUserId).toBe(adminId);
  });

  it("[blocant] REGRESIE: o ciornă arhivată care e trimisă spre aprobare iese singură din arhivă", async () => {
    // Fără asta, cererea ar fi rămas marcată arhivată tot drumul și ar fi dispărut tăcut din lista
    // de lucru fix când ajungea „plătită" — adică exact cererea la care ții s-ar fi ascuns la final.
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(200);

    const res = await post(`/api/par/${parId}/submit`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { archivedAt: string | null }).archivedAt).toBeNull();

    const row = await rowOf(parId);
    expect(row.status).toBe("pending_approval");
    expect(row.archivedAt).toBeNull();

    expect((await list()).requests.map((r) => r.id)).toContain(parId);
    expect((await list(true)).requests.map((r) => r.id)).not.toContain(parId);
  });

  it("[blocant] o cerere arhivată care se mișcă pe altă cale reapare în lista de lucru", async () => {
    // Plasa de siguranță a regulii din SQL: arhiva ascunde DOAR cât timp cererea stă pe loc.
    // (Aici mutarea e simulată direct în baza de date — e calea pe care o pot lua alte rute,
    // de pildă anularea unei plăți care întoarce cererea la finanțe.)
    caller = { id: authorId, role: "teacher" };
    const parId = await draft();
    expect((await post(`/api/par/${parId}/archive`)).status).toBe(200);
    expect((await list()).requests.map((r) => r.id)).not.toContain(parId);

    await testDb.update(parRequests).set({ status: "in_finance" }).where(eq(parRequests.id, parId));

    expect((await list()).requests.map((r) => r.id)).toContain(parId);
    expect((await list(true)).requests.map((r) => r.id)).not.toContain(parId);
  });
});
