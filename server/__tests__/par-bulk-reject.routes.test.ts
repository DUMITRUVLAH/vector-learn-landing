/**
 * @vitest-environment node
 * VM5-13 — „Respinge toate": ruta reală, PGlite, toate migrările.
 *
 * Din ședința de prezentare: „trebuie buton aprobă toate sau respinse toate". Aprobarea în masă
 * exista din VF-102; respingerea nu. Testul apasă ENDPOINTUL, nu o funcție pură — pentru că exact
 * aici s-au strecurat driftările anterioare (PARQA-010: respingerea individuală ignora regulile pe
 * care aprobarea le aplica).
 *
 * Ce se verifică:
 *   1. motivul e obligatoriu — fără el nu se respinge NIMIC (400, nicio cerere atinsă);
 *   2. lotul e independent — o cerere pe care nu am autoritate eșuează singură, restul trec;
 *   3. respingerea e terminală și trece prin aceeași logică ca `/:id/reject` (status, motiv salvat).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { inAppNotifications } from "../db/schema/inAppNotifications";
import {
  parRequests,
  parApprovals,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
} from "../db/schema/par";

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
let tenantId: string;
let aprobator: string;
let solicitant: string;
/** Trei cereri în așteptare: două ale solicitantului, una a aprobatorului însuși. */
let parA: string;
let parB: string;
let parPropriu: string;
/** Entitatea plătitoare — aria pe care o au ambii utilizatori (fără ea, orice cerere e „not_found"). */
let payerId: string;

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

async function bulkReject(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.request("/api/par/bulk-reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const statusOf = async (id: string) =>
  (await testDb.select().from(parRequests).where(eq(parRequests.id, id)))[0]?.status;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parApprovalsRoutes } = await import("../routes/parApprovals");
  app = new Hono();
  app.route("/api/par", parApprovalsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-bulk-reject" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "teacher" })
      .returning();
    return u.id;
  };
  aprobator = await mkUser("ana@atic.md", "Ana Chirita");
  solicitant = await mkUser("iulian@atic.md", "Iulian Lungu");
  await testDb.insert(parMembers).values({ tenantId, userId: aprobator, role: "approver" });
  await testDb.insert(parMembers).values({ tenantId, userId: solicitant, role: "requestor" });
  // Aria: fără apartenența la plătitor, ruta răspunde „not_found" înainte de orice regulă de decizie.
  for (const userId of [aprobator, solicitant]) {
    await testDb.insert(parPayerMembers).values({ tenantId, payerId, userId });
  }

  const mkPar = async (requestNo: string, authorId: string) => {
    const [par] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        payerId,
        requestNo,
        requestedByUserId: authorId,
        status: "pending_approval",
        totalEstimatedCents: 100000,
        submittedAt: new Date(),
      })
      .returning();
    await testDb.insert(parApprovals).values({
      tenantId,
      parId: par.id,
      step: 0,
      approverUserId: authorId,
      approverRoleLabel: "Requestor",
      decision: "approved",
      locked: false,
      decidedAt: new Date(),
    });
    await testDb.insert(parApprovals).values({
      tenantId,
      parId: par.id,
      step: 1,
      approverUserId: aprobator,
      approverRoleLabel: "Aprobator",
      decision: "pending",
      locked: false,
    });
    return par.id;
  };

  parA = await mkPar("PAR-2026-0101", solicitant);
  parB = await mkPar("PAR-2026-0102", solicitant);
  // Cererea aprobatorului însuși: segregarea atribuțiilor o ține în afara lotului lui.
  parPropriu = await mkPar("PAR-2026-0103", aprobator);

  session = { id: aprobator, tenantId, role: "teacher", email: "ana@atic.md" };
});

describe("POST /api/par/bulk-reject", () => {
  it("refuză lotul fără motiv și nu atinge nicio cerere", async () => {
    const { status } = await bulkReject({ par_ids: [parA, parB], comment: "" });
    expect(status).toBe(400);
    expect(await statusOf(parA)).toBe("pending_approval");
    expect(await statusOf(parB)).toBe("pending_approval");
  });

  it("respinge cererile lotului și salvează motivul pe fiecare", async () => {
    const { status, json } = await bulkReject({
      par_ids: [parA, parB],
      comment: "Bugetul liniei e epuizat pentru trimestrul curent",
      signatureName: "Ana Chirita",
    });

    expect(status).toBe(200);
    expect(json.rejected).toBe(2);
    expect(json.failed).toBe(0);
    expect(await statusOf(parA)).toBe("rejected");
    expect(await statusOf(parB)).toBe("rejected");

    const pasi = await testDb.select().from(parApprovals).where(eq(parApprovals.parId, parA));
    const pasulMeu = pasi.find((p) => p.step === 1);
    expect(pasulMeu?.decision).toBe("rejected");
    expect(pasulMeu?.comment).toContain("Bugetul liniei e epuizat");
    expect(pasulMeu?.signatureName).toBe("Ana Chirita");
    expect(pasulMeu?.decidedAt).toBeTruthy();
  });

  /**
   * VM5-01: „persoana care a elaborat PAR să primească feedback cu statutul PAR-ului și motivul".
   * Feedbackul exista, dar în engleză („PAR-2026-0018 was rejected") și fără să spună cine a decis.
   */
  it("trimite solicitantului un feedback în română, cu motivul și cu cine a decis", async () => {
    const notificari = await testDb
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientUserId, solicitant));
    const corpuri = notificari.map((n) => String((n.payload as { body?: string })?.body ?? ""));
    const despreParA = corpuri.find((b) => b.includes("PAR-2026-0101"));

    expect(despreParA).toBeTruthy();
    expect(despreParA).toContain("RESPINSĂ");
    expect(despreParA).toContain("Ana Chirita");
    expect(despreParA).toContain("Bugetul liniei e epuizat");
    expect(despreParA).toMatch(/revizui/i);
    // Niciun rest de engleză în textul pe care îl citește omul.
    expect(despreParA).not.toMatch(/\b(was rejected|requires changes|has been paid|Reason:)\b/i);
  });

  /**
   * VM5-12: „ce se întâmplă când unul respinge, iar altul aprobă". Răspunsul aplicației e că prima
   * respingere oprește tot — corect, dar trebuie SPUS: până acum cererea dispărea din inboxul
   * celorlalți fără o vorbă.
   */
  it("ceilalți aprobatori ai lanțului află că cererea s-a oprit", async () => {
    const [alDoilea] = await testDb
      .insert(users)
      .values({ tenantId, email: "irina@atic.md", passwordHash: "x", name: "Irina Oriol", role: "teacher" })
      .returning();
    await testDb.insert(parMembers).values({ tenantId, userId: alDoilea.id, role: "approver" });
    await testDb.insert(parPayerMembers).values({ tenantId, payerId, userId: alDoilea.id });

    const [par] = await testDb
      .insert(parRequests)
      .values({
        tenantId, payerId, requestNo: "PAR-2026-0106", requestedByUserId: solicitant,
        status: "pending_approval", totalEstimatedCents: 70000, submittedAt: new Date(),
      })
      .returning();
    // Nivel paralel: eu și Irina, amândoi pe pasul 1.
    await testDb.insert(parApprovals).values([
      { tenantId, parId: par.id, step: 1, approverUserId: aprobator, approverRoleLabel: "Aprobator", decision: "pending", locked: false },
      { tenantId, parId: par.id, step: 1, approverUserId: alDoilea.id, approverRoleLabel: "Aprobator", decision: "pending", locked: false },
    ]);

    await bulkReject({ par_ids: [par.id], comment: "nu se justifică" });

    const notificari = await testDb
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientUserId, alDoilea.id));
    const corp = String((notificari[0]?.payload as { body?: string })?.body ?? "");
    expect(corp).toContain("PAR-2026-0106");
    expect(corp).toMatch(/nu mai așteaptă decizia ta/i);
    expect(corp).toContain("nu se justifică");
  });

  it("o cerere pe care nu o pot decide eșuează singură, restul lotului trece", async () => {
    // parA e deja respinsă (testul anterior) → conflict; parPropriu e a mea → segregare.
    const [parC] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        payerId,
        requestNo: "PAR-2026-0104",
        requestedByUserId: solicitant,
        status: "pending_approval",
        totalEstimatedCents: 50000,
        submittedAt: new Date(),
      })
      .returning();
    await testDb.insert(parApprovals).values({
      tenantId, parId: parC.id, step: 1, approverUserId: aprobator,
      approverRoleLabel: "Aprobator", decision: "pending", locked: false,
    });

    const { json } = await bulkReject({ par_ids: [parA, parC.id], comment: "nu corespunde" });
    const results = json.results as { id: string; ok: boolean; error?: string }[];

    expect(json.rejected).toBe(1);
    expect(json.failed).toBe(1);
    expect(results.find((r) => r.id === parC.id)?.ok).toBe(true);
    expect(results.find((r) => r.id === parA)?.ok).toBe(false);
    expect(results.find((r) => r.id === parA)?.error).toContain("conflict");
    expect(await statusOf(parC.id)).toBe("rejected");
  });

  it("nu respinge o cerere unde pasul e al altcuiva", async () => {
    // Pasul 1 e fixat pe solicitant, nu pe mine: nu am ce decide aici.
    const [alPersoana] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        payerId,
        requestNo: "PAR-2026-0105",
        requestedByUserId: solicitant,
        status: "pending_approval",
        totalEstimatedCents: 25000,
        submittedAt: new Date(),
      })
      .returning();
    await testDb.insert(parApprovals).values({
      tenantId, parId: alPersoana.id, step: 1, approverUserId: solicitant,
      approverRoleLabel: "Aprobator", decision: "pending", locked: false,
    });

    const { json } = await bulkReject({ par_ids: [alPersoana.id], comment: "test" });
    expect(json.rejected).toBe(0);
    expect(await statusOf(alPersoana.id)).toBe("pending_approval");
  });

  /**
   * Observație, nu cerință: `parPropriu` e cererea aprobatorului însuși. Aprobarea proprie e
   * interzisă explicit (PARQA-003), respingerea proprie NU e — și nici nu e periculoasă: autorul
   * își poate oricum retrage sau anula propria cerere. Testul fixează comportamentul actual ca să
   * se vadă negru pe alb dacă cineva îl schimbă din greșeală.
   */
  it("autorul care e și aprobator își poate respinge propria cerere (ca și cum ar retrage-o)", async () => {
    const { json } = await bulkReject({ par_ids: [parPropriu], comment: "renunț la cerere" });
    expect(json.rejected).toBe(1);
    expect(await statusOf(parPropriu)).toBe("rejected");
  });
});
