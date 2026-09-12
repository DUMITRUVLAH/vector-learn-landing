/**
 * @vitest-environment node
 * VM5-02 — cererile colegilor de pe același proiect (rute reale, PGlite).
 *
 * Cerința: „Persoanele să poată vedea inclusiv lista de PAR-uri elaborate de co-echiperi — ex. dacă
 * pleacă în concediu etc. (transparența în workplace)." Aria decisă de owner: PROIECTUL.
 *
 * O schimbare de acces se testează pe ce NU se vede, nu doar pe ce se vede — de aceea jumătate din
 * teste verifică limitele: ciornele, proiectele străine, rechizitele bancare.
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
  parProjects,
  parProjectMembers,
  parMembers,
  parPayers,
  parPayerModules,
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
let anaId: string;      // colegă pe același proiect
let iulianId: string;   // autorul cererilor
let strainId: string;   // pe alt proiect
let parTrimis: string;
let parCiorna: string;
let parAltProiect: string;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const e of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

interface ListResp { requests: Array<{ id: string; requestNo: string; payeeIban: string | null; payeeName: string | null }> }

const list = async (scope?: string): Promise<ListResp> =>
  (await app.request(`/api/par${scope ? `?scope=${scope}` : ""}`)).json() as Promise<ListResp>;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-colegi" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role: "teacher" }).returning();
    await testDb.insert(parMembers).values({ tenantId, userId: u.id, role: "requestor" });
    return u.id;
  };
  anaId = await mkUser("ana@atic.md", "Ana");
  iulianId = await mkUser("iulian@atic.md", "Iulian");
  strainId = await mkUser("strain@atic.md", "Străin");

  const [tekwill] = await testDb.insert(parProjects).values({ tenantId, name: "Tekwill", payerId: payer.id, active: true }).returning();
  const [altul] = await testDb.insert(parProjects).values({ tenantId, name: "Alt proiect", payerId: payer.id, active: true }).returning();
  for (const userId of [anaId, iulianId]) {
    await testDb.insert(parProjectMembers).values({ tenantId, projectId: tekwill.id, userId });
  }
  await testDb.insert(parProjectMembers).values({ tenantId, projectId: altul.id, userId: strainId });

  const mkPar = async (no: string, projectId: string, status: "draft" | "pending_approval") => {
    const [p] = await testDb.insert(parRequests).values({
      tenantId, payerId: payer.id, requestNo: no, requestedByUserId: iulianId, projectId, status,
      currency: "MDL", totalEstimatedCents: 100000,
      payeeName: "Prestator SRL", payeeIban: "MD24AG000225100013104168", payeeIdnp: "1006600034927",
      submittedAt: status === "draft" ? null : new Date(),
    }).returning();
    return p.id;
  };
  parTrimis = await mkPar("PAR-2026-0501", tekwill.id, "pending_approval");
  parCiorna = await mkPar("PAR-2026-0502", tekwill.id, "draft");
  parAltProiect = await mkPar("PAR-2026-0503", altul.id, "pending_approval");

  session = { id: anaId, tenantId, role: "teacher", email: "ana@atic.md" };
  // Migrările întregi pe PGlite depășesc timeout-ul implicit de 30s pe o mașină încărcată.
}, 240_000);

describe("lista: Ale mele vs Ale proiectului", () => {
  it("implicit, omul vede doar cererile lui — nimic nu se schimbă fără să ceară", async () => {
    const r = await list();
    expect(r.requests).toHaveLength(0);
  });

  it("cu scope=project, vede cererile TRIMISE ale colegilor de pe proiectele lui", async () => {
    const r = await list("project");
    expect(r.requests.map((x) => x.requestNo)).toContain("PAR-2026-0501");
  });

  it("ciorna colegului rămâne a lui", async () => {
    const r = await list("project");
    expect(r.requests.map((x) => x.requestNo)).not.toContain("PAR-2026-0502");
  });

  it("cererile altui proiect nu se văd", async () => {
    const r = await list("project");
    expect(r.requests.map((x) => x.requestNo)).not.toContain("PAR-2026-0503");
  });

  it("rechizitele bancare ale colegului NU se văd (transparență, nu date de plată)", async () => {
    const r = await list("project");
    const alColegului = r.requests.find((x) => x.requestNo === "PAR-2026-0501")!;
    expect(alColegului.payeeIban).toBeNull();
    // Numele beneficiarului rămâne: fără el, rândul nu spune nimic despre ce s-a cerut.
    expect(alColegului.payeeName).toBe("Prestator SRL");
  });
});

describe("fișa cererii", () => {
  const openPar = async (id: string) => app.request(`/api/par/${id}`);

  it("colegul de proiect poate deschide cererea trimisă", async () => {
    session = { id: anaId, tenantId, role: "teacher", email: "ana@atic.md" };
    expect((await openPar(parTrimis)).status).toBe(200);
  });

  it("ciorna colegului rămâne închisă", async () => {
    expect((await openPar(parCiorna)).status).toBe(404);
  });

  it("cineva de pe alt proiect nu o poate deschide", async () => {
    session = { id: strainId, tenantId, role: "teacher", email: "strain@atic.md" };
    expect((await openPar(parTrimis)).status).toBe(404);
  });

  it("autorul își vede în continuare propria ciornă", async () => {
    session = { id: iulianId, tenantId, role: "teacher", email: "iulian@atic.md" };
    expect((await openPar(parCiorna)).status).toBe(200);
  });
});
