/**
 * @vitest-environment node
 *
 * Eticheta unui slot de aprobare e un ROL, nu un om (ATIC, PAR-2026-0025).
 *
 * Builderul DOA completa eticheta cu numele persoanei alese, iar numele ajungea titlu de secțiune:
 * „15. ANA CHIRITA" scris fix deasupra semnăturii lui Irina Oriol. Aici verificăm și traducerea din
 * cod (`slotRoleLabel`), și migrarea care curăță rândurile deja scrise.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../db/schema/index";
import { parApprovals, parDoaMatrix, parRequests } from "../../../db/schema/par";
import { tenants, users } from "../../../db/schema";
import { slotRoleLabel } from "../doa";

describe("slotRoleLabel — capul blocului de semnătură", () => {
  it("eticheta care nu e decât numele titularului devine rolul", () => {
    expect(slotRoleLabel("Ana Chirita", "Ana Chirita")).toBe("Aprobator");
    expect(slotRoleLabel("  ana chirita ", "Ana Chirita")).toBe("Aprobator");
  });

  it("un rol adevărat rămâne neatins", () => {
    expect(slotRoleLabel("Director executiv", "Ana Chirita")).toBe("Director executiv");
    expect(slotRoleLabel("Oricine · Finanțe", null)).toBe("Oricine · Finanțe");
  });

  it("fără etichetă, slotul se anunță tot ca rol", () => {
    expect(slotRoleLabel(null, "Ana Chirita")).toBe("Aprobator");
    expect(slotRoleLabel("   ", null)).toBe("Aprobator");
  });
});

describe("migrarea 0156 — numele deja scrise în etichete", () => {
  let pglite: PGlite;
  let testDb: ReturnType<typeof drizzle>;
  let migration: string;
  let tenantId: string;
  let anaId: string;
  let parId: string;

  beforeAll(async () => {
    pglite = new PGlite();
    testDb = drizzle({ client: pglite, schema });

    const drizzleDir = path.resolve(__dirname, "../../../../drizzle");
    const journal = JSON.parse(
      fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
    ) as { entries: { idx: number; tag: string }[] };
    for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
      const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
      for (const stmt of raw.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) {
        await pglite.exec(stmt);
      }
    }
    migration = fs.readFileSync(
      path.join(drizzleDir, "0156_par_eticheta_slot_nu_e_nume.sql"),
      "utf8"
    );

    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: "Slot Label Tenant", slug: "slot-label-0156", plan: "growth" })
      .returning();
    tenantId = tenant.id;

    const [ana, irina] = await testDb
      .insert(users)
      .values([
        { tenantId, email: "ana@slot-test.io", passwordHash: "x", name: "Ana Chirita", role: "admin" },
        { tenantId, email: "irina@slot-test.io", passwordHash: "x", name: "Irina Oriol", role: "teacher" },
      ])
      .returning();
    anaId = ana.id;

    await testDb.insert(parDoaMatrix).values([
      { tenantId, minAmountCents: 0, maxAmountCents: null, step: 1, approverRoleLabel: "Ana Chirita", approverUserId: ana.id },
      { tenantId, minAmountCents: 0, maxAmountCents: null, step: 2, approverRoleLabel: "Director executiv", approverUserId: irina.id },
    ]);

    const [par] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo: "PAR-2026-0025",
        dateOfRequest: new Date(),
        requestedByUserId: ana.id,
        purpose: "execute_payment",
        endUse: "Test",
        status: "pending_approval",
      })
      .returning();
    parId = par.id;

    await testDb.insert(parApprovals).values([
      // Slotul eliberat la depunere (solicitantul nu se aprobă singur), semnat de altcineva.
      { tenantId, parId, step: 1, approverUserId: null, approverRoleLabel: "Ana Chirita", decision: "approved", signatureName: "Irina Oriol" },
      { tenantId, parId, step: 2, approverUserId: irina.id, approverRoleLabel: "Director executiv", decision: "pending" },
    ]);

    await pglite.exec(migration);
  }, 120_000);

  afterAll(async () => {
    await pglite.close();
  });

  it("eticheta-nume de pe cererea depusă devine „Aprobator”", async () => {
    const rows = await pglite.query(
      `SELECT step, approver_role_label FROM par_approvals WHERE par_id = '${parId}' ORDER BY step`
    );
    const labels = (rows.rows as { step: number; approver_role_label: string }[]);
    expect(labels[0].approver_role_label).toBe("Aprobator");
    expect(labels[1].approver_role_label).toBe("Director executiv");
  });

  it("regula DOA nu mai poartă numele persoanei fixate pe ea", async () => {
    const rows = await pglite.query(
      `SELECT approver_role_label FROM par_doa_matrix WHERE tenant_id = '${tenantId}' AND approver_user_id = '${anaId}'`
    );
    expect((rows.rows[0] as { approver_role_label: string }).approver_role_label).toBe("Aprobator");
  });

  it("rulată din nou nu schimbă nimic (idempotentă)", async () => {
    await pglite.exec(migration);
    const rows = await pglite.query(
      `SELECT COUNT(*) AS cnt FROM par_approvals WHERE par_id = '${parId}' AND approver_role_label = 'Aprobator'`
    );
    expect(Number((rows.rows[0] as { cnt: string }).cnt)).toBe(1);
  });
});
