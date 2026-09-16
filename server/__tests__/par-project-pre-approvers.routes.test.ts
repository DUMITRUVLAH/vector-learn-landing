/**
 * @vitest-environment node
 *
 * Pre-aprobarea de proiect, capăt la capăt: PGlite, toate migrările, rutele reale.
 *
 * Cazul owner-ului (16.09.2026, proiectul LED 3/Youth Maker club): asistentul de proiect depune
 * cererea, care până acum pleca DIRECT la finanțe — managerul de proiect o vedea abia în listă,
 * „plătită sau respinsă", când o linie de buget greșită nu se mai repară printr-o semnătură.
 *
 * Ce apără testul:
 *   1. lanțul primește nivelul de pre-aprobare ÎNAINTEA pașilor din matricea DOA;
 *   2. un pre-aprobator cu rol `finance` (Cristina) își vede pasul în inbox și îl poate semna —
 *      fără să capete dreptul general de aprobare pe cererile organizației;
 *   3. aprobatorul din matrice rămâne BLOCAT până semnează toți pre-aprobatorii;
 *   4. cine depune cererea nu se pre-aprobă singur.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, asc, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parLineItems,
  parApprovals,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
  parProjects,
  parProjectMembers,
  parProjectPreApprovers,
  parDoaMatrix,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let caller: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", caller);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let submitPAR: typeof import("../lib/par/submit")["submitPAR"];
let tenantId: string;
let payerId: string;
let projectId: string;
let asistent: string;
let iulian: string;
let cristina: string;
let ana: string;

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

/** O ciornă completă a asistentului, pe proiect — gata de trimis. */
async function draft(requestNo: string, authorId = asistent): Promise<string> {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId,
      projectId,
      requestNo,
      requestedByUserId: authorId,
      purpose: "execute_payment",
      chargeTo: "program",
      endUse: "Materiale pentru atelierul de robotică",
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

const chainOf = async (parId: string) =>
  testDb
    .select({
      step: parApprovals.step,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      approverParRole: parApprovals.approverParRole,
      decision: parApprovals.decision,
      locked: parApprovals.locked,
    })
    .from(parApprovals)
    .where(eq(parApprovals.parId, parId))
    .orderBy(asc(parApprovals.step));

async function inboxAs(user: { id: string; role: string }) {
  caller = { id: user.id, tenantId, role: user.role, email: "x@atic.md" };
  const res = await app.request("/api/par/inbox");
  return (await res.json()) as { inbox: Array<{ id: string; requestNo: string; my_step: number | null }>; total: number };
}

async function approveAs(user: { id: string; role: string }, parId: string) {
  caller = { id: user.id, tenantId, role: user.role, email: "x@atic.md" };
  const res = await app.request(`/api/par/${parId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ comment: null, signatureName: null }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  ({ submitPAR } = await import("../lib/par/submit"));
  const { parApprovalsRoutes } = await import("../routes/parApprovals");
  app = new Hono();
  app.route("/api/par", parApprovalsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-pre-approvers" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
  const [project] = await testDb
    .insert(parProjects)
    .values({ tenantId, payerId, name: "LED 3/Youth Maker club" })
    .returning();
  projectId = project.id;

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "teacher" })
      .returning();
    return u.id;
  };
  asistent = await mkUser("asistent@atic.md", "Asistent Proiect");
  iulian = await mkUser("iulian@atic.md", "Iulian Lungu");
  cristina = await mkUser("cristina@atic.md", "Cristina Sirbu");
  ana = await mkUser("ana@atic.md", "Ana Chirita");

  await testDb.insert(parMembers).values([
    { tenantId, userId: asistent, role: "requestor" as const },
    { tenantId, userId: iulian, role: "approver" as const },
    // Cristina e DOAR finanțe — pre-aprobarea nu trece prin rolul general de aprobator.
    { tenantId, userId: cristina, role: "finance" as const },
    { tenantId, userId: ana, role: "approver" as const },
  ]);
  // Aria: fără apartenență la proiect/plătitor, rutele răspund „not_found" înainte de orice regulă.
  for (const userId of [asistent, iulian, cristina, ana]) {
    await testDb.insert(parPayerMembers).values({ tenantId, payerId, userId });
    await testDb.insert(parProjectMembers).values({ tenantId, projectId, userId });
  }

  // Matricea DOA: un singur pas, pe rol de aprobator — lanțul „de dinainte de pre-aprobare".
  await testDb.insert(parDoaMatrix).values({
    tenantId,
    step: 1,
    approverRoleLabel: "Aprobator",
    approverParRole: "approver" as const,
    minAmountCents: 0,
    maxAmountCents: null,
  });

  await testDb.insert(parProjectPreApprovers).values([
    { tenantId, projectId, userId: iulian },
    { tenantId, projectId, userId: cristina },
  ]);
});

describe("pre-aprobatorii proiectului", () => {
  it("lanțul începe cu pre-aprobarea, iar pasul DOA urcă un nivel și rămâne blocat", async () => {
    const parId = await draft("PAR-2026-0035");
    const result = await submitPAR({ parId, tenantId, actorUserId: asistent });
    expect(result.ok).toBe(true);

    const chain = await chainOf(parId);
    const pre = chain.filter((s) => s.step === 1);
    expect(pre.map((s) => s.approverUserId).sort()).toEqual([iulian, cristina].sort());
    expect(pre.every((s) => s.approverRoleLabel === "Pre-aprobare proiect")).toBe(true);
    // Ambele rânduri de pre-aprobare sunt DESCHISE: e un nivel paralel, se semnează în orice ordine.
    expect(pre.every((s) => s.locked === false)).toBe(true);

    // Pasul din matrice s-a mutat pe 2 și așteaptă: finanțele nu văd cererea încă.
    const doaStep = chain.filter((s) => s.step === 2);
    expect(doaStep).toHaveLength(1);
    expect(doaStep[0].approverParRole).toBe("approver");
    expect(doaStep[0].locked).toBe(true);
  });

  it("pre-aprobatorul cu rol `finance` își vede pasul în inbox și îl poate semna", async () => {
    const parId = await draft("PAR-2026-0036");
    await submitPAR({ parId, tenantId, actorUserId: asistent });

    const inbox = await inboxAs({ id: cristina, role: "teacher" });
    const row = inbox.inbox.find((r) => r.requestNo === "PAR-2026-0036");
    expect(row, "cererea trebuie să apară în inboxul Cristinei").toBeDefined();
    expect(row?.my_step).toBe(1);

    const res = await approveAs({ id: cristina, role: "teacher" }, parId);
    expect(res.status).toBe(200);

    // Un singur pre-aprobator a semnat → pasul DOA rămâne blocat, celălalt încă e așteptat.
    const chain = await chainOf(parId);
    expect(chain.find((s) => s.step === 1 && s.approverUserId === cristina)?.decision).toBe("approved");
    expect(chain.find((s) => s.step === 1 && s.approverUserId === iulian)?.decision).toBe("pending");
    expect(chain.find((s) => s.step === 2)?.locked).toBe(true);
  });

  it("după ultima pre-aprobare, pasul din matricea DOA se deschide", async () => {
    const parId = await draft("PAR-2026-0037");
    await submitPAR({ parId, tenantId, actorUserId: asistent });

    expect((await approveAs({ id: cristina, role: "teacher" }, parId)).status).toBe(200);
    expect((await approveAs({ id: iulian, role: "teacher" }, parId)).status).toBe(200);

    const chain = await chainOf(parId);
    expect(chain.find((s) => s.step === 2)?.locked).toBe(false);
    expect(chain.find((s) => s.step === 2)?.decision).toBe("pending");
    // Ana, aprobatoarea pe rol din matrice, abia acum are ce semna.
    const inbox = await inboxAs({ id: ana, role: "teacher" });
    expect(inbox.inbox.some((r) => r.requestNo === "PAR-2026-0037")).toBe(true);
  });

  it("aprobatorul pe rol NU poate sări peste pre-aprobare", async () => {
    const parId = await draft("PAR-2026-0038");
    await submitPAR({ parId, tenantId, actorUserId: asistent });

    const res = await approveAs({ id: ana, role: "teacher" }, parId);
    expect(res.status).toBe(409);
    expect(String(res.json.error)).toContain("locked");
  });

  it("cine depune cererea nu se pre-aprobă singur — lanțul lui Iulian începe la ceilalți", async () => {
    const parId = await draft("PAR-2026-0039", iulian);
    await submitPAR({ parId, tenantId, actorUserId: iulian });

    const chain = await chainOf(parId);
    const pre = chain.filter((s) => s.step === 1);
    expect(pre.map((s) => s.approverUserId)).toEqual([cristina]);
  });

  it("proiect fără pre-aprobatori → lanțul rămâne cel din matricea DOA", async () => {
    const [altProject] = await testDb
      .insert(parProjects)
      .values({ tenantId, payerId, name: "Digital Safeguard" })
      .returning();
    await testDb.insert(parProjectMembers).values({ tenantId, projectId: altProject.id, userId: asistent });

    const parId = await draft("PAR-2026-0040");
    await testDb.update(parRequests).set({ projectId: altProject.id }).where(eq(parRequests.id, parId));
    await submitPAR({ parId, tenantId, actorUserId: asistent });

    const chain = await chainOf(parId);
    expect(chain.filter((s) => s.step >= 1).map((s) => s.step)).toEqual([1]);
    expect(chain.find((s) => s.step === 1)?.approverParRole).toBe("approver");
  });
});

describe("configurarea pre-aprobatorilor", () => {
  it("un rând de pre-aprobare nu se poate dubla pe același proiect", async () => {
    await expect(
      testDb.insert(parProjectPreApprovers).values({ tenantId, projectId, userId: iulian }),
    ).rejects.toThrow();
    const rows = await testDb
      .select()
      .from(parProjectPreApprovers)
      .where(and(eq(parProjectPreApprovers.projectId, projectId), eq(parProjectPreApprovers.userId, iulian)));
    expect(rows).toHaveLength(1);
  });
});
