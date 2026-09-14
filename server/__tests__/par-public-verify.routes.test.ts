/**
 * @vitest-environment node
 * PARVERIFY-001 — ruta publică de verificare, pe rută reală + PGlite cu toate migrările.
 *
 * Ce apără testele: ruta asta e SINGURA din PAR deschisă fără sesiune. Regula ei — „nu arată mai
 * mult decât hârtia pe care e tipărit codul" — nu se poate verifica citind codul, fiindcă răspunsul
 * se construiește din `loadParFormData`, care încarcă și IBAN-ul, și IDNP-ul, și banca. Un câmp
 * adăugat din reflex în lista de mai jos ar publica datele de plată ale organizației. De aceea
 * testul se uită la JSON-ul serializat, nu la câmpuri anume.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parLineItems, parApprovals, parMembers, parPayers, parPayerModules } from "../db/schema/par";
import { parVerifyTokens } from "../db/schema/parVerifyTokens";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let parId: string;
let approvalId: string;
const TOKEN = "K7M29QD43F8BX2NV";

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

import { Hono } from "hono";

let app: Hono;

/** Zahăr local, ca filtrul pe token să nu se repete în fiecare test. */
const eqToken = (token: string) => eq(parVerifyTokens.token, token);

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

beforeAll(async () => {
  process.env.PAR_SIGN_SECRET = "secret-de-test";
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parPublicVerifyRoutes } = await import("../routes/parPublicVerify");
  app = new Hono();
  app.route("/api/public/par", parPublicVerifyRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-verify" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [requestor] = await testDb
    .insert(users)
    .values({ tenantId, email: "dorina@vector.md", passwordHash: "x", name: "Dorina Harghel", role: "manager" })
    .returning();
  const [approver] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana Chiriță", role: "manager" })
    .returning();
  await testDb.insert(parMembers).values([
    { tenantId, userId: requestor.id, role: "requestor" },
    { tenantId, userId: approver.id, role: "approver" },
  ]);

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0142",
      requestedByUserId: requestor.id,
      requestorTitle: "Specialist achiziții",
      purpose: "execute_payment",
      chargeTo: "program",
      status: "approved",
      payerId: payer.id,
      // Datele de plată EXISTĂ pe cerere — altfel testul de mai jos n-ar dovedi nimic.
      payeeName: "FURNIZOR SRL",
      payeeIdnp: "1006600034927",
      payeeIban: "MD67ML0000002258A0919582",
      payeeBank: "OTP Bank S.A.",
      currency: "MDL",
      totalEstimatedCents: 700000,
      dateOfRequest: new Date("2026-09-10T00:00:00Z"),
    })
    .returning();
  parId = par.id;

  await testDb.insert(parLineItems).values({
    tenantId,
    parId,
    position: 1,
    description: "Servicii de training",
    quantity: 1,
    unit: "bucăți",
    unitPriceCents: 700000,
    lineTotalCents: 700000,
  });

  const [approval] = await testDb
    .insert(parApprovals)
    .values({
      tenantId,
      parId,
      step: 1,
      approverUserId: approver.id,
      decision: "approved",
      decidedAt: new Date("2026-09-11T09:24:00Z"),
      signatureName: "Ana Chiriță",
      signatureTitle: "Aprobator",
    })
    .returning();
  approvalId = approval.id;

  await testDb.insert(parVerifyTokens).values({ tenantId, parId, token: TOKEN });
});

describe("GET /api/public/par/verify/:token", () => {
  it("deschide fără sesiune și arată aprobarea cu codul ei", async () => {
    const res = await app.request(`/api/public/par/verify/${TOKEN}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.organization).toBe("ATIC");
    expect(body.par.requestNo).toBe("PAR-2026-0142");
    expect(body.par.totalEstimatedCents).toBe(700000);
    expect(body.par.lineItems[0].description).toBe("Servicii de training");
    expect(body.par.approvals).toHaveLength(1);
    expect(body.par.approvals[0].name).toBe("Ana Chiriță");
    expect(body.par.approvals[0].decision).toBe("approved");
    expect(body.par.approvals[0].signatureCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("codul din răspuns e cel tipărit pe formular pentru fix acea aprobare", async () => {
    const { signatureCode } = await import("../lib/par/verifyCodes");
    const res = await app.request(`/api/public/par/verify/${TOKEN}`);
    const body = await res.json();
    expect(body.par.approvals[0].signatureCode).toBe(
      signatureCode({
        parId,
        approvalId,
        step: 1,
        decision: "approved",
        decidedAt: "2026-09-11T09:24:00.000Z",
      })
    );
  });

  it("NU publică datele de plată, oricât de adânc ar fi în răspuns", async () => {
    const res = await app.request(`/api/public/par/verify/${TOKEN}`);
    const raw = await res.text();
    expect(raw).not.toContain("MD67ML0000002258A0919582"); // IBAN
    expect(raw).not.toContain("1006600034927"); // IDNP
    expect(raw).not.toContain("OTP Bank");
    expect(raw).not.toContain("FURNIZOR SRL");
    // Nici identificatorii interni: cine are tokenul n-are ce face cu id-ul cererii sau al firmei.
    expect(raw).not.toContain(parId);
    expect(raw).not.toContain(tenantId);
  });

  it("spune dacă hârtia mai corespunde cu înregistrarea", async () => {
    const { stateFingerprint } = await import("../lib/par/verifyCodes");
    const { loadParFormData } = await import("../lib/par/parFormData");
    const data = (await loadParFormData(parId, tenantId))!;
    const current = stateFingerprint(data);

    const ok = await (await app.request(`/api/public/par/verify/${TOKEN}?v=${current}`)).json();
    expect(ok.matchesPrinted).toBe(true);

    const stale = await (await app.request(`/api/public/par/verify/${TOKEN}?v=AAAAAAAA`)).json();
    expect(stale.matchesPrinted).toBe(false);

    // Hârtie tipărită înainte de a exista amprenta: tăcere, nu o comparație inventată.
    const old = await (await app.request(`/api/public/par/verify/${TOKEN}`)).json();
    expect(old.matchesPrinted).toBeNull();
  });

  it("nu lasă un link scanat să ajungă într-un index de căutare", async () => {
    const res = await app.request(`/api/public/par/verify/${TOKEN}`);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("numără scanările — semnalul că un document de plată circulă mai mult decât ar trebui", async () => {
    const before = (
      await testDb.select().from(parVerifyTokens).where(eqToken(TOKEN))
    )[0].scanCount;
    await app.request(`/api/public/par/verify/${TOKEN}`);
    const after = (await testDb.select().from(parVerifyTokens).where(eqToken(TOKEN)))[0];
    expect(after.scanCount).toBe(before + 1);
    expect(after.lastUsedAt).not.toBeNull();
  });

  it("un cod care nu are forma potrivită nu ajunge la baza de date", async () => {
    const res = await app.request("/api/public/par/verify/prea-scurt");
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("invalid_code");
  });

  it("un cod inexistent dă 404, unul retras dă 410 — diferența spune omului ce să facă", async () => {
    const missing = await app.request("/api/public/par/verify/ZZZZZZZZZZZZZZZZ");
    expect(missing.status).toBe(404);
    expect((await missing.json()).reason).toBe("not_found");

    await testDb.update(parVerifyTokens).set({ revokedAt: new Date() }).where(eqToken(TOKEN));
    const revoked = await app.request(`/api/public/par/verify/${TOKEN}`);
    expect(revoked.status).toBe(410);
    expect((await revoked.json()).reason).toBe("revoked");
    await testDb.update(parVerifyTokens).set({ revokedAt: null }).where(eqToken(TOKEN));
  });
});
