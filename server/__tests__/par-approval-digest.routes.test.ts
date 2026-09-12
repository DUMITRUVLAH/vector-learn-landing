/**
 * @vitest-environment node
 * VM5-11 — digestul de aprobări, pe traseul real (PGlite, toate migrările).
 *
 * Cerința: „Emailurile să vină în batch-uri de aprobare." Ce trebuie apărat, dincolo de text:
 *   1. fiecare aprobator primește DOAR cererile lui — aceeași regulă ca inboxul, nu o a doua copie;
 *   2. nu pleacă două digesturi la rând către același om (cronul poate fi lovit de două ori);
 *   3. propria cerere nu-ți apare în digest, cum nu-ți apare nici în inbox.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { messages } from "../db/schema/messages";
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

vi.mock("../db/client", () => ({
  get db() { return testDb; },
  closeDb: async () => {},
}));

let tenantId: string;
let anaId: string;
let irinaId: string;
let iulianId: string;
const L = (lei: number) => lei * 100;

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

/** Emailurile de digest scrise în jurnalul de mesaje, pentru un destinatar. */
async function digestsFor(email: string) {
  const rows = await testDb.select().from(messages).where(eq(messages.toAddress, email));
  return rows.filter((r) => (r.subject ?? "").includes("așteaptă aprobarea ta"));
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-digest" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role: "teacher" }).returning();
    await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId: u.id });
    return u.id;
  };
  anaId = await mkUser("ana@atic.md", "Ana Chirita");
  irinaId = await mkUser("irina@atic.md", "Irina Oriol");
  iulianId = await mkUser("iulian@atic.md", "Iulian Lungu");
  await testDb.insert(parMembers).values({ tenantId, userId: anaId, role: "approver" });
  await testDb.insert(parMembers).values({ tenantId, userId: irinaId, role: "approver" });
  await testDb.insert(parMembers).values({ tenantId, userId: iulianId, role: "requestor" });

  const mkPar = async (no: string, cents: number, approverUserId: string, requestedBy = iulianId) => {
    const [par] = await testDb.insert(parRequests).values({
      tenantId, payerId: payer.id, requestNo: no, requestedByUserId: requestedBy,
      status: "pending_approval", currency: "MDL", totalEstimatedCents: cents, totalMdlCents: cents,
      submittedAt: new Date(Date.now() - 3 * 86_400_000),
    }).returning();
    await testDb.insert(parApprovals).values({
      tenantId, parId: par.id, step: 1, approverUserId,
      approverRoleLabel: "Aprobator", decision: "pending", locked: false,
    });
    return par.id;
  };

  // Ana are două cereri de decis, Irina una. A treia e chiar cererea Anei — nu are ce căuta la ea.
  await mkPar("PAR-2026-0401", L(12000), anaId);
  await mkPar("PAR-2026-0402", L(3000), anaId);
  await mkPar("PAR-2026-0403", L(8000), irinaId);
  await mkPar("PAR-2026-0404", L(500), anaId, anaId);
});

beforeEach(async () => {
  await testDb.delete(messages);
});

describe("digestul de aprobări", () => {
  it("fiecare aprobator primește DOAR cererile lui, într-un singur email", async () => {
    const { runApprovalDigestForTenant } = await import("../services/par/digestRunner");
    const summary = await runApprovalDigestForTenant(tenantId, { force: true });

    expect(summary.emails).toBe(2); // Ana și Irina, câte unul fiecare

    const aleAnei = await digestsFor("ana@atic.md");
    expect(aleAnei).toHaveLength(1);
    expect(aleAnei[0].subject).toContain("2 cereri");
    expect(aleAnei[0].body).toContain("PAR-2026-0401");
    expect(aleAnei[0].body).toContain("PAR-2026-0402");
    // Cererea Irinei nu e a ei.
    expect(aleAnei[0].body).not.toContain("PAR-2026-0403");
    // Nici propria cerere — segregarea atribuțiilor, ca în inbox.
    expect(aleAnei[0].body).not.toContain("PAR-2026-0404");

    const aleIrinei = await digestsFor("irina@atic.md");
    expect(aleIrinei[0].subject).toContain("O cerere");
  });

  it("solicitantul fără rol de aprobare nu primește digest", async () => {
    const { runApprovalDigestForTenant } = await import("../services/par/digestRunner");
    await runApprovalDigestForTenant(tenantId, { force: true });
    expect(await digestsFor("iulian@atic.md")).toHaveLength(0);
  });

  it("două rulări la rând nu trimit două emailuri aceluiași om", async () => {
    const { runApprovalDigestForTenant } = await import("../services/par/digestRunner");
    await runApprovalDigestForTenant(tenantId, { force: true });
    const second = await runApprovalDigestForTenant(tenantId, { force: true });

    expect(second.emails).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(await digestsFor("ana@atic.md")).toHaveLength(1);
  });

  it("emailul poartă suma, solicitantul și de cât așteaptă cererea", async () => {
    const { runApprovalDigestForTenant } = await import("../services/par/digestRunner");
    await runApprovalDigestForTenant(tenantId, { force: true });
    const body = (await digestsFor("ana@atic.md"))[0].body;
    expect(body).toContain("12.000,00 MDL");
    expect(body).toContain("Iulian Lungu");
    expect(body).toMatch(/așteaptă de \d+ zile/);
    expect(body).toContain("Workspace: ATIC");
  });
});

describe("fereastra de trimitere", () => {
  it("trimite la 09:00 și 16:00, ora Chișinăului — nu la orice lovitură de cron", async () => {
    const { inDigestWindow } = await import("../services/par/digestRunner");
    // 06:10 UTC = 09:10 la Chișinău (vara) → în fereastră.
    expect(inDigestWindow(new Date("2026-09-12T06:10:00Z"))).toBe(true);
    // 13:05 UTC = 16:05 → în fereastră.
    expect(inDigestWindow(new Date("2026-09-12T13:05:00Z"))).toBe(true);
    // 08:00 UTC = 11:00 → nu.
    expect(inDigestWindow(new Date("2026-09-12T08:00:00Z"))).toBe(false);
    // Miezul nopții local — nimeni nu citește digestul la 3 dimineața.
    expect(inDigestWindow(new Date("2026-09-12T00:00:00Z"))).toBe(false);
  });
});
