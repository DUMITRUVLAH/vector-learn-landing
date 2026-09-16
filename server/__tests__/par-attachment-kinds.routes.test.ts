/**
 * @vitest-environment node
 * Tipurile de documente din formularul PAR — INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * Testează ACȚIUNEA, nu doar afișarea (§3.5.1quater): endpoint-ul de upload e chiar apelat
 * și se verifică statusul + forma răspunsului.
 *
 * Acoperă:
 *   1. Tipurile noi (participants_list / narrative_report / deliverables) sunt acceptate de
 *      enum-ul din Postgres — fără migrarea 0140 upload-ul ar da 500
 *      ("invalid input value for enum par_attachment_kind").
 *   2. kind='other' + kind_other → numele scris de utilizator se salvează și se întoarce la
 *      listare (altfel dosarul rămâne cu „Alt document").
 *   3. kind_other e ignorat pe alte tipuri (nu dublează eticheta).
 *   4. Dosarul PDF se generează cu tipurile noi + un „Altul" numit (regresie WinAnsi).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parMembers, parPayerModules, parPayers } from "../db/schema/par";

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
    c.set("user", { id: userId, tenantId, role: "manager", email: "solicitant@vector.md" });
    await next();
  },
}));

// Reconcilierea AI e best-effort la upload; o scurtcircuităm ca testul să fie offline + rapid.
// Conținutul atașamentelor stă în Supabase Storage din 12.09.2026, nu în Postgres. Testul de față
// e despre tipurile de document (kind/kind_other), nu despre transport, deci Storage-ul e simulat
// în memorie — fără el, fiecare upload se opreștea în `storage_unavailable` (503).
const testStorage = new Map<string, Buffer>();
vi.mock("../lib/storage/objectStore", () => ({
  uploadObject: async (_b: string, p: string, bytes: Buffer) => {
    testStorage.set(p, bytes);
  },
  downloadObject: async (_b: string, p: string) => {
    const v = testStorage.get(p);
    if (!v) throw new Error("download_failed_404");
    return v;
  },
  removeObjects: async (_b: string, paths: string[]) => {
    for (const p of paths) testStorage.delete(p);
  },
  signUploads: async (_b: string, tid: string, files: { fileName: string }[]) =>
    files.map((f) => ({ fileName: f.fileName, path: `${tid}/${f.fileName}`, signedUrl: "https://storage.test/x" })),
  buildObjectPath: (tid: string, name: string) => `${tid}/${Date.now()}-${name}`,
  isStorageConfigured: () => true,
}));

vi.mock("../lib/ai/pdfText", () => ({ extractPdfText: async () => "" }));
vi.mock("../lib/ai/parExtractor", () => ({
  extractParParties: async () => {
    throw new Error("AI disabled in tests");
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

/** PDF minimal valid — exact ce stochează uploadAttachment (data URL base64). */
function tinyPdfDataUrl(): string {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
xref
0 4
0000000000 65535 f
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
}

interface UploadedAttachment {
  id: string;
  fileName: string;
  kind: string;
  kindOther: string | null;
}

async function upload(body: Record<string, unknown>): Promise<Response> {
  return app.request(`/api/par/${parId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: tinyPdfDataUrl(),
      mime: "application/pdf",
      ...body,
    }),
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [{ parAttachmentsRoutes }, { parRoutes }] = await Promise.all([
    import("../routes/parAttachments"),
    import("../routes/par"),
  ]);
  app = new Hono();
  app.route("/api/par", parAttachmentsRoutes);
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-kinds" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC Test" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "solicitant@vector.md", passwordHash: "x", name: "Ana Solicitanta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "requestor" });

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0101",
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "draft",
      payerId: payer.id,
      endUse: "Instruire pentru 25 de beneficiari",
      currency: "MDL",
      totalEstimatedCents: 500000,
      dateOfRequest: new Date("2026-08-10T00:00:00Z"),
    })
    .returning();
  parId = par.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Anexele standard din formularul PAR", () => {
  it.each(["participants_list", "narrative_report", "deliverables"])(
    "[blocant] POST /api/par/:id/attachments acceptă kind=%s → 201",
    async (kind) => {
      const res = await upload({ file_name: `${kind}.pdf`, kind });
      expect(res.status).toBe(201);
      const att = (await res.json()) as UploadedAttachment;
      expect(att.kind).toBe(kind);
      expect(att.id).toBeTruthy();
    },
  );

  it("[blocant] kind='other' + kind_other → numele documentului se salvează și se listează", async () => {
    const res = await upload({
      file_name: "certificat.pdf",
      kind: "other",
      kind_other: "Certificat de conformitate",
    });
    expect(res.status).toBe(201);
    const att = (await res.json()) as UploadedAttachment;
    expect(att.kindOther).toBe("Certificat de conformitate");

    const list = await app.request(`/api/par/${parId}/attachments`);
    expect(list.status).toBe(200);
    const { items } = (await list.json()) as { items: UploadedAttachment[] };
    expect(items.find((i) => i.id === att.id)?.kindOther).toBe("Certificat de conformitate");
  });

  it("kind_other e ignorat pe un tip concret (nu dublează eticheta)", async () => {
    const res = await upload({ file_name: "contract.pdf", kind: "contract", kind_other: "Altceva" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as UploadedAttachment).kindOther).toBeNull();
  });

  it("kind='other' fără nume rămâne valid (upload programatic) — kindOther null", async () => {
    const res = await upload({ file_name: "scan.pdf", kind: "other" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as UploadedAttachment).kindOther).toBeNull();
  });

  it("[blocant] PATCH schimbă tipul unui fișier deja urcat (lotul urcat ca „Contract” se îndreaptă)", async () => {
    // Tipul din capul secțiunii se aplică la TOT ce urci într-o singură fereastră: contractul,
    // actul de primire și buletinul ajungeau toate „Contract", fără nicio cale de îndreptare.
    const up = await upload({ file_name: "act-primire.pdf", kind: "contract" });
    const att = (await up.json()) as UploadedAttachment;

    const res = await app.request(`/api/par/${parId}/attachments/${att.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "act_of_receipt" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as UploadedAttachment).kind).toBe("act_of_receipt");

    const list = await app.request(`/api/par/${parId}/attachments`);
    const { items } = (await list.json()) as { items: UploadedAttachment[] };
    expect(items.find((i) => i.id === att.id)?.kind).toBe("act_of_receipt");
  });

  it("[blocant] PATCH kind='other' + kind_other → eticheta liberă ajunge în dosar", async () => {
    const up = await upload({ file_name: "buletin.pdf", kind: "contract" });
    const att = (await up.json()) as UploadedAttachment;

    const res = await app.request(`/api/par/${parId}/attachments/${att.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "other", kind_other: "Buletin de identitate" }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as UploadedAttachment;
    expect(updated.kind).toBe("other");
    expect(updated.kindOther).toBe("Buletin de identitate");
  });

  it("PATCH kind='other' fără nume → 400, rândul rămâne neschimbat", async () => {
    const up = await upload({ file_name: "scan-2.pdf", kind: "invoice" });
    const att = (await up.json()) as UploadedAttachment;

    const res = await app.request(`/api/par/${parId}/attachments/${att.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "other" }),
    });
    expect(res.status).toBe(400);

    const list = await app.request(`/api/par/${parId}/attachments`);
    const { items } = (await list.json()) as { items: UploadedAttachment[] };
    expect(items.find((i) => i.id === att.id)?.kind).toBe("invoice");
  });

  it("PATCH pe un alt tip golește numele liber (nu rămâne eticheta veche)", async () => {
    const up = await upload({ file_name: "oferta.pdf", kind: "other", kind_other: "Ceva scris de mână" });
    const att = (await up.json()) as UploadedAttachment;

    const res = await app.request(`/api/par/${parId}/attachments/${att.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "quotation" }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as UploadedAttachment;
    expect(updated.kind).toBe("quotation");
    expect(updated.kindOther).toBeNull();
  });

  it("[blocant] GET /api/par/:id/dosar → 200 PDF cu tipurile noi + „Altul” numit", async () => {
    const res = await app.request(`/api/par/${parId}/dosar`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString();
    expect(head).toBe("%PDF-");
  }, 60_000);
});
