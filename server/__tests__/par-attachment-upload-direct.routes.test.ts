/**
 * @vitest-environment node
 * Încărcarea directă în Storage — INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * De ce există ruta testată aici: fișierele plecau ca data-URL base64 într-un corp JSON, iar
 * funcția serverless de pe Vercel refuză corpurile peste ~4,5 MB. Base64 umflă cu ~33%, deci orice
 * fișier peste ~3,3 MB pica cu un 413 fără explicație — motiv pentru care plafonul din interfață
 * fusese coborât la 3 MB. Acum browserul urcă binarul direct în Storage printr-un URL semnat, iar
 * prin server trec doar `sign` și `finalize`, două cereri JSON mici.
 *
 * Ce cere testul, în ordinea riscului:
 *  - un fișier de 8 MB (peste vechiul plafon) ajunge la dosar — asta e tot rostul schimbării;
 *  - `finalize` judecă OCTEȚII REALI, nu tipul declarat: între semnare și finalizare clientul poate
 *    urca orice la calea semnată, deci un „PDF" care nu începe cu %PDF trebuie refuzat ȘI șters din
 *    Storage, altfel un fișier respins rămâne să ocupe spațiu;
 *  - o cale din alt tenant e refuzată — un prefix nu e o cale sigură (auditul din 29.08.2026);
 *  - cine n-are drept de a atașa nu primește URL de scriere: verificarea stă ÎNAINTE de semnare.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
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
let app: Awaited<ReturnType<typeof buildApp>>;

/** Storage simulat în memorie: ce a urcat „browserul" și ce s-a șters. */
const storage = new Map<string, Buffer>();
const removed: string[] = [];

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
  removeObjects: async (_bucket: string, paths: string[]) => {
    for (const p of paths) {
      removed.push(p);
      storage.delete(p);
    }
  },
  uploadObject: async (_bucket: string, p: string, bytes: Buffer) => {
    storage.set(p, bytes);
  },
  buildObjectPath: (tid: string, name: string) => `${tid}/1700000000-abcdef-${name}`,
  isStorageConfigured: () => true,
}));

// Analiza AI e consultativă și cheamă un furnizor extern — o scoatem din drum, ca testul să
// măsoare calea de încărcare, nu disponibilitatea modelului.
vi.mock("../lib/ai/readUploadedDoc", () => ({
  readUploadedDoc: async () => ({ rawText: "", imageDataUrl: null, fileDataUrl: null }),
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

/** PDF plauzibil de `size` octeți: semnătura reală + umplutură. */
function pdfOfSize(size: number): Buffer {
  const head = Buffer.from("%PDF-1.7\n");
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x20)]);
}

async function sign(body: Record<string, unknown>) {
  return app.request(`/api/par/${parId}/attachment-upload/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function finalize(body: Record<string, unknown>) {
  return app.request(`/api/par/${parId}/attachment-upload/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  app = await buildApp();

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-upload" }).returning();
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
      requestNo: "PAR-2026-0100",
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "draft",
      payerId: payer.id,
      endUse: "Contract scanat",
      currency: "MDL",
      totalEstimatedCents: 100000,
      dateOfRequest: new Date("2026-09-13T00:00:00Z"),
    })
    .returning();
  parId = par.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Încărcare directă în Storage", () => {
  it("[blocant] un contract de 8 MB ajunge la dosar — peste vechiul plafon de 3 MB", async () => {
    const bytes = pdfOfSize(8 * 1024 * 1024);

    const signRes = await sign({ file_name: "contract.pdf", mime: "application/pdf", size_bytes: bytes.byteLength });
    expect(signRes.status).toBe(200);
    const { path: objectPath, signed_url } = (await signRes.json()) as { path: string; signed_url: string };
    expect(signed_url).toContain("https://");
    expect(objectPath.startsWith(`${tenantId}/`)).toBe(true);

    // Pasul pe care în realitate îl face browserul, direct către Storage.
    storage.set(objectPath, bytes);

    const res = await finalize({ path: objectPath, file_name: "contract.pdf", mime: "application/pdf", kind: "contract" });
    expect(res.status).toBe(201);
    const att = (await res.json()) as { id: string; sizeBytes: number; storagePath: string; fileUrl: string | null };
    expect(att.sizeBytes).toBe(bytes.byteLength);
    expect(att.storagePath).toBe(objectPath);
    // Esențialul: conținutul NU intră în baza de date.
    expect(att.fileUrl).toBeNull();

    const [row] = await testDb.select().from(parAttachments).where(eq(parAttachments.id, att.id));
    expect(row.fileUrl).toBeNull();
    expect(row.mimeType).toBe("application/pdf");
  });

  it("[blocant] un fișier care nu e ce pretinde e refuzat ȘI șters din Storage", async () => {
    const signRes = await sign({ file_name: "fals.pdf", mime: "application/pdf", size_bytes: 100 });
    const { path: objectPath } = (await signRes.json()) as { path: string };

    // Clientul urcă altceva decât a declarat — între semnare și finalizare poate urca orice.
    storage.set(objectPath, Buffer.from("<html>nu sunt un pdf</html>"));

    const res = await finalize({ path: objectPath, file_name: "fals.pdf", mime: "application/pdf", kind: "other" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_content_mismatch");
    // Refuzat înseamnă și eliberat: altfel fișierele respinse ar ocupa spațiu la nesfârșit.
    expect(removed).toContain(objectPath);
    expect(storage.has(objectPath)).toBe(false);
  });

  it("[blocant] o cale din alt tenant e refuzată — prefixul nu e o cale sigură", async () => {
    const foreign = "00000000-0000-4000-8000-000000000000/1700000000-abcdef-secret.pdf";
    storage.set(foreign, pdfOfSize(1024));

    const res = await finalize({ path: foreign, file_name: "secret.pdf", mime: "application/pdf", kind: "other" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_path");

    // Traversarea, care colapsează la normalizarea URL-ului, e respinsă de forma impusă.
    const traversal = await finalize({
      path: `${tenantId}/../${foreign}`,
      file_name: "secret.pdf",
      mime: "application/pdf",
      kind: "other",
    });
    expect(traversal.status).toBe(400);
  });

  it("un tip neacceptat nu primește URL de scriere", async () => {
    const res = await sign({ file_name: "virus.exe", mime: "application/x-msdownload", size_bytes: 1024 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_file_type");
  });

  it("un fișier gol e refuzat, nu salvat ca rând fără conținut", async () => {
    const signRes = await sign({ file_name: "gol.pdf", mime: "application/pdf", size_bytes: 1 });
    const { path: objectPath } = (await signRes.json()) as { path: string };
    storage.set(objectPath, Buffer.alloc(0));

    const res = await finalize({ path: objectPath, file_name: "gol.pdf", mime: "application/pdf", kind: "other" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("empty_file");
  });

  it("finalizarea unei căi la care nu s-a urcat nimic nu creează rând", async () => {
    const res = await finalize({
      path: `${tenantId}/1700000000-abcdef-fantoma.pdf`,
      file_name: "fantoma.pdf",
      mime: "application/pdf",
      kind: "other",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("upload_not_found");
  });
});
