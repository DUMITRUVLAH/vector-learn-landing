/**
 * @vitest-environment node
 * GET /api/par/activity — fluxul „ce s-a mișcat" de pe tabloul de bord PAR.
 *
 * Feed-ul amestecă două surse (comentarii + evenimente de audit) și e prima pagină pe care o
 * vede o organizație care are DOAR modulul PAR. Riscul lui real nu e afișarea, ci SCOPE-ul:
 * un feed care sare peste regulile listei ar arăta comentarii de pe cereri din alt proiect sau
 * din alt workspace. Testele cheamă ruta reală, pe migrările reale, și verifică exact asta.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parAudit,
  parComments,
  parMembers,
  parPayerMembers,
  parPayers,
  parProjectMembers,
  parProjects,
  parRequests,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
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
let approverA: string;
let requestorA: string;
let userB: string;
let parOfRequestor: string;
let parOfSomeoneElse: string;
let parInTenantB: string;

interface ActivityBody {
  items: {
    id: string;
    kind: "comment" | "event";
    event: string | null;
    text: string | null;
    actorName: string | null;
    requestNo: string | null;
    parId: string | null;
  }[];
}

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

const fetchActivity = async (): Promise<{ status: number; body: ActivityBody }> => {
  const res = await app.request("/api/par/activity?limit=10");
  return { status: res.status, body: (await res.json()) as ActivityBody };
};

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parActivityRoutes } = await import("../routes/parActivity");
  app = new Hono();
  app.route("/api/par/activity", parActivityRoutes);

  const mkUser = async (tenantId: string, email: string, name: string, role = "teacher") => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return u.id;
  };

  // ── Workspace A: un aprobator, un solicitant simplu, două cereri ───────────
  const [a] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-activity" }).returning();
  tenantA = a.id;
  // Nicio linie în par_payer_modules: PAR e implicitul produsului, deci organizația îl are.
  const [payerA] = await testDb.insert(parPayers).values({ tenantId: tenantA, name: "ATIC" }).returning();
  const [projectA] = await testDb
    .insert(parProjects)
    .values({ tenantId: tenantA, name: "LED", payerId: payerA.id, active: true })
    .returning();

  approverA = await mkUser(tenantA, "aprobator@atic.md", "Ana Aprobator");
  requestorA = await mkUser(tenantA, "solicitant@atic.md", "Ion Solicitant");
  await testDb.insert(parMembers).values({ tenantId: tenantA, userId: approverA, role: "approver" });
  for (const uid of [approverA, requestorA]) {
    await testDb.insert(parPayerMembers).values({ tenantId: tenantA, payerId: payerA.id, userId: uid });
    await testDb.insert(parProjectMembers).values({ tenantId: tenantA, projectId: projectA.id, userId: uid });
  }

  const mkPar = async (requestNo: string, requestedByUserId: string, tenantId: string, payerId: string, projectId: string | null) => {
    const [p] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo,
        requestedByUserId,
        payerId,
        projectId,
        purpose: "execute_payment",
        chargeTo: "program",
        status: "pending_approval",
        endUse: "Servicii",
        currency: "MDL",
        totalEstimatedCents: 120000,
        dateOfRequest: new Date("2026-08-20T00:00:00Z"),
      })
      .returning();
    return p.id;
  };

  parOfRequestor = await mkPar("PAR-2026-0001", requestorA, tenantA, payerA.id, projectA.id);
  parOfSomeoneElse = await mkPar("PAR-2026-0002", approverA, tenantA, payerA.id, projectA.id);

  // ── Workspace B: cerere + comentariu care NU au voie să apară la A ─────────
  const [b] = await testDb.insert(tenants).values({ name: "Alt Client", slug: "alt-client-activity" }).returning();
  tenantB = b.id;
  const [payerB] = await testDb.insert(parPayers).values({ tenantId: tenantB, name: "Alt Client SRL" }).returning();
  userB = await mkUser(tenantB, "cineva@alt.md", "Cineva Altcineva", "admin");
  parInTenantB = await mkPar("PAR-2026-9999", userB, tenantB, payerB.id, null);

  await testDb.insert(parComments).values([
    { tenantId: tenantA, parId: parOfRequestor, authorUserId: approverA, body: "Lipsește factura." },
    { tenantId: tenantA, parId: parOfSomeoneElse, authorUserId: approverA, body: "Comentariu pe cererea altcuiva." },
    { tenantId: tenantB, parId: parInTenantB, authorUserId: userB, body: "Secret din alt workspace." },
  ]);
  await testDb.insert(parAudit).values([
    { tenantId: tenantA, parId: parOfRequestor, actorUserId: requestorA, event: "submitted", detail: "Trimisă spre aprobare" },
    // Zgomot de audit: nu are ce căuta pe un tablou de bord.
    { tenantId: tenantA, parId: parOfRequestor, actorUserId: requestorA, event: "viewed", detail: "deschisă" },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("GET /api/par/activity", () => {
  it("[blocant] adună comentariile ȘI evenimentele notabile, cu autor și număr de cerere", async () => {
    session = { id: approverA, tenantId: tenantA, role: "teacher", email: "aprobator@atic.md" };
    const { status, body } = await fetchActivity();
    expect(status).toBe(200);

    const comment = body.items.find((i) => i.kind === "comment" && i.parId === parOfRequestor);
    expect(comment?.text).toBe("Lipsește factura.");
    expect(comment?.actorName).toBe("Ana Aprobator");
    expect(comment?.requestNo).toBe("PAR-2026-0001");

    const submitted = body.items.find((i) => i.kind === "event" && i.event === "submitted");
    expect(submitted?.actorName).toBe("Ion Solicitant");
    expect(submitted?.requestNo).toBe("PAR-2026-0001");
  });

  it("[blocant] nu scoate zgomotul de audit pe tabloul de bord", async () => {
    session = { id: approverA, tenantId: tenantA, role: "teacher", email: "aprobator@atic.md" };
    const { body } = await fetchActivity();
    expect(body.items.some((i) => i.event === "viewed")).toBe(false);
  });

  it("[blocant] nu arată nimic din alt workspace", async () => {
    session = { id: approverA, tenantId: tenantA, role: "teacher", email: "aprobator@atic.md" };
    const { body } = await fetchActivity();
    expect(body.items.some((i) => i.requestNo === "PAR-2026-9999")).toBe(false);
    expect(body.items.some((i) => i.text === "Secret din alt workspace.")).toBe(false);
  });

  it("[blocant] cine n-are rol de aprobare vede doar activitatea propriilor cereri", async () => {
    session = { id: requestorA, tenantId: tenantA, role: "teacher", email: "solicitant@atic.md" };
    const { body } = await fetchActivity();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i) => i.requestNo === "PAR-2026-0001")).toBe(true);
    expect(body.items.some((i) => i.text === "Comentariu pe cererea altcuiva.")).toBe(false);
  });

  it("ordonează descrescător după timp — cel mai proaspăt lucru primul", async () => {
    session = { id: approverA, tenantId: tenantA, role: "teacher", email: "aprobator@atic.md" };
    const { body } = await fetchActivity();
    const dates = body.items.map((i) => (i as unknown as { createdAt: string }).createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
