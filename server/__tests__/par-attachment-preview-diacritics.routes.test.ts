/**
 * @vitest-environment node
 * Numele fișierului cu diacritice NU are voie să rupă previzualizarea — INTEGRATION (rută reală,
 * PGlite, toate migrările).
 *
 * Incident real (2026-09-10, Violeta pe producție): captura de ecran atașată ca dovadă de plată se
 * numea „Confirmare plată — PAR-2026-0023 (captura-ordin-plata….png)". Ruta de preview punea numele
 * NEATINS în `Content-Disposition`, iar un antet HTTP nu poate conține caractere în afara
 * ISO-8859-1: Node arunca, iar vizualizatorul arăta „Serverul a răspuns cu eroarea 500."
 *
 * Testul cere ce trebuie: 200, conținutul real, nume ASCII în `filename` și numele complet în
 * `filename*` (RFC 5987), pentru orice document — nu doar pentru cele botezate în engleză.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parAttachments, parMembers, parPayerModules, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let parId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "finance@vector.md" });
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

/** PNG minimal (semnătura + un IEND), exact forma în care ajunge o captură lipită din clipboard. */
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

let attachmentId: string;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parAttachmentsRoutes } = await import("../routes/parAttachments");
  app = new Hono();
  app.route("/api/par", parAttachmentsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-preview" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "finance@vector.md", passwordHash: "x", name: "Violeta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "finance" });

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0023",
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "paid",
      payerId: payer.id,
      endUse: "Executare plată",
      currency: "MDL",
      totalEstimatedCents: 100000,
      dateOfRequest: new Date("2026-09-07T00:00:00Z"),
    })
    .returning();
  parId = par.id;

  const [att] = await testDb
    .insert(parAttachments)
    .values({
      tenantId,
      parId,
      fileUrl: PNG_DATA_URL,
      // Exact numele din incident: diacritice + linie de dialog.
      fileName: "Confirmare plată — PAR-2026-0023 (captura-ordin-plata-2026-09-10-18-48-51.png)",
      kind: "payment_order",
      uploadedBy: userId,
    })
    .returning();
  attachmentId = att.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Previzualizarea unui atașament cu diacritice în nume", () => {
  it("[blocant] răspunde 200 cu documentul, nu 500", async () => {
    const res = await app.request(`/api/par/${parId}/attachments/${attachmentId}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it("[blocant] antetul are un nume ASCII sigur ȘI numele complet codat (RFC 5987)", async () => {
    const res = await app.request(`/api/par/${parId}/attachments/${attachmentId}/preview`);
    const disposition = res.headers.get("content-disposition") ?? "";

    // Nimic în afara ISO-8859-1 nu are ce căuta într-un antet HTTP.
    expect(/^[\x20-\x7e]*$/.test(disposition)).toBe(true);
    expect(disposition).toContain("inline;");
    expect(disposition).toContain("filename*=UTF-8''");
    // Numele complet se recuperează din `filename*`, cu diacritice cu tot.
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "";
    expect(decodeURIComponent(encoded)).toContain("Confirmare plată");
  });

  it("ghilimelele și rândurile noi din nume nu pot sparge antetul", async () => {
    const [att] = await testDb
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: PNG_DATA_URL,
        fileName: 'ordin"; rm -rf /\r\nX-Injectat: da.png',
        kind: "payment_order",
        uploadedBy: userId,
      })
      .returning();

    const res = await app.request(`/api/par/${parId}/attachments/${att.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-injectat")).toBeNull();
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\n");
    expect(/^[\x20-\x7e]*$/.test(disposition)).toBe(true);
  });
});
