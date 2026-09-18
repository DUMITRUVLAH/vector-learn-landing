/**
 * @vitest-environment node
 * Numărul ordinului de plată se citește din dovada de la bancă — INTEGRATION (rute reale, PGlite).
 *
 * De ce (owner, 18.09.2026): „numărul ordinului de plată eu după trebuie să-l iau din bancă, când
 * îți dau să citești numărul". La ora plății numărul nu există; extrasul ștampilat vine a doua zi.
 * Din rubrica asta se compune numele dosarului (`…_OP-2065_2026-09-18.pdf`) și coloana „Nr. ordin"
 * din Dovezi de plată, deci un număr netastat înseamnă un dosar pe care nu-l poți căuta.
 *
 * Ce cere testul, în ordinea riscului:
 *  - rubrica goală se completează la atașare, fără alt clic;
 *  - ce a scris omul NU se rescrie niciodată — o cifră tastată de finanțe bate un regex;
 *  - un extras cu mai multe operațiuni nu produce niciun număr: mai bine gol decât greșit.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parPayments,
  parMembers,
  parPayerModules,
  parPayers,
  parAudit,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;
let app: Awaited<ReturnType<typeof buildApp>>;

const storage = new Map<string, Buffer>();

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

vi.mock("../lib/storage/objectStore", () => ({
  signUploads: async (_bucket: string, tid: string, files: { fileName: string }[]) =>
    files.map((f) => ({
      fileName: f.fileName,
      path: `${tid}/1700000000-abcdef-${f.fileName.replace(/[^\w.\- ]+/g, "_")}`,
      signedUrl: `https://storage.test/upload/${tid}`,
    })),
  downloadObject: async (_bucket: string, p: string) => {
    const b = storage.get(p);
    if (!b) throw new Error("download_failed_404");
    return b;
  },
  removeObjects: async (_bucket: string, paths: string[]) => paths.forEach((p) => storage.delete(p)),
  uploadObject: async (_bucket: string, p: string, bytes: Buffer) => {
    storage.set(p, bytes);
  },
  buildObjectPath: (tid: string, name: string) => `${tid}/1700000000-abcdef-${name}`,
  isStorageConfigured: () => true,
}));

/** Ce „scrie" pe documentul urcat la pasul curent — fiecare test își pune textul lui. */
const docText = vi.hoisted(() => ({ value: "" }));
vi.mock("../lib/ai/readUploadedDoc", () => ({
  readUploadedDoc: async () => ({ rawText: docText.value, imageDataUrl: null, fileDataUrl: null }),
}));
vi.mock("../lib/ai/parExtractor", () => ({
  extractParParties: async () => {
    throw new Error("ai_disabled_in_test");
  },
}));

import { Hono } from "hono";

async function buildApp() {
  const { parAttachmentsRoutes } = await import("../routes/parAttachments");
  const a = new Hono();
  a.route("/api/par", parAttachmentsRoutes);
  return a;
}

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

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(512, 0x20)]);

/** O cerere plătită + rândul ei de finanțe, cu rubricile date. */
async function paidPar(
  requestNo: string,
  payment: { paymentRef?: string | null; paymentDate?: Date | null },
) {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo,
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "paid",
      payerId,
      payeeName: "SMART VIT SERVICE SRL",
      endUse: "LED 3/Youth Maker club",
      currency: "MDL",
      totalEstimatedCents: 143000,
      dateOfRequest: new Date("2026-09-17T00:00:00Z"),
    })
    .returning();
  await testDb.insert(parPayments).values({
    tenantId,
    parId: par.id,
    paymentRef: payment.paymentRef ?? null,
    paymentDate: payment.paymentDate ?? null,
  });
  return par.id;
}

/** Atașează o dovadă de plată pe calea reală (sign → urcare „din browser" → finalize). */
async function attachProof(parId: string, fileName: string) {
  const signRes = await app.request(`/api/par/${parId}/attachment-upload/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_name: fileName, mime: "application/pdf", size_bytes: PDF.byteLength }),
  });
  const { path: objectPath } = (await signRes.json()) as { path: string };
  storage.set(objectPath, PDF);
  return app.request(`/api/par/${parId}/attachment-upload/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: objectPath, file_name: fileName, mime: "application/pdf", kind: "payment_order" }),
  });
}

const paymentOf = async (parId: string) =>
  (await testDb.select().from(parPayments).where(eq(parPayments.parId, parId)))[0];

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  app = await buildApp();

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-proof-ref" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "finance@vector.md", passwordHash: "x", name: "Violeta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "finance" });
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Numărul ordinului de plată, citit din dovadă", () => {
  it("[blocant] rubrica goală se completează din documentul băncii", async () => {
    const parId = await paidPar("PAR-2026-0058", {});
    docText.value = ["BC «MAIB» S.A.", "ORDIN DE PLATĂ", "nr. 2065 din 18.09.2026"].join("\n");

    expect((await attachProof(parId, "ordin-plata.pdf")).status).toBe(201);

    const payment = await paymentOf(parId);
    expect(payment.paymentRef).toBe("2065");
    expect(payment.paymentDate?.toISOString().slice(0, 10)).toBe("2026-09-18");

    const audit = await testDb.select().from(parAudit).where(eq(parAudit.parId, parId));
    expect(audit.some((a) => a.event === "payment_ref_read_from_proof")).toBe(true);
  });

  it("[blocant] ce a scris omul nu se rescrie", async () => {
    const parId = await paidPar("PAR-2026-0059", {
      paymentRef: "2052",
      paymentDate: new Date("2026-09-17T12:00:00Z"),
    });
    docText.value = "ORDIN DE PLATĂ nr. 9999 din 01.01.2026";

    expect((await attachProof(parId, "ordin-plata.pdf")).status).toBe(201);

    const payment = await paymentOf(parId);
    expect(payment.paymentRef).toBe("2052");
    expect(payment.paymentDate?.toISOString().slice(0, 10)).toBe("2026-09-17");
  });

  it("extras cu mai multe operațiuni: rubrica rămâne goală, nu ghicită", async () => {
    const parId = await paidPar("PAR-2026-0060", {});
    docText.value = [
      "EXTRAS DE CONT",
      "Nr. documentului 2065 SMART VIT SERVICE SRL 1 430,00",
      "Nr. documentului 2064 ORANGE MOLDOVA SA 242,25",
    ].join("\n");

    expect((await attachProof(parId, "extras.pdf")).status).toBe(201);

    expect((await paymentOf(parId)).paymentRef).toBeNull();
  });

  it("un document ilizibil (scan fără text) lasă atașarea să reușească", async () => {
    const parId = await paidPar("PAR-2026-0061", {});
    docText.value = "";

    expect((await attachProof(parId, "captura.pdf")).status).toBe(201);

    expect((await paymentOf(parId)).paymentRef).toBeNull();
  });
});
