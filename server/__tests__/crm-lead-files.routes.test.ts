/**
 * @vitest-environment node
 * FIȘIERE PE LEAD — INTEGRATION (rutele reale, PGlite, Storage mock-uit).
 *
 * Portare din crm-vector (`src/lib/crm/files.ts`), unde browserul vorbea direct cu Supabase
 * Storage. Aici nu poate: cheia de service nu are ce căuta în browser. Secvența e cea de la
 * atașamentele PAR — `sign` verifică dreptul, browserul urcă binarul, `finalize` se uită la
 * octeții REALI înainte să scrie rândul.
 *
 * Testele închid exact partea care contează: între `sign` și `finalize` clientul poate urca orice
 * la calea semnată, deci tipul declarat e o afirmație neverificată până când serverul o verifică.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadAttachments } from "../db/schema/leads";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

/** Ce „urcă" browserul: calea semnată → octeți. Mock-ul de Storage citește de aici. */
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
    c.set("user", session);
    await next();
  },
}));

vi.mock("../lib/storage/objectStore", () => ({
  signUploads: async (_bucket: string, tenantId: string, files: Array<{ fileName: string }>) =>
    files.map((f) => ({
      fileName: f.fileName,
      path: `${tenantId}/${f.fileName}`,
      signedUrl: `https://storage.test/${tenantId}/${f.fileName}?token=x`,
    })),
  downloadObject: async (_bucket: string, p: string) => {
    const bytes = storage.get(p);
    if (!bytes) throw new Error("not found");
    return bytes;
  },
  removeObjects: async (_bucket: string, paths: string[]) => {
    for (const p of paths) {
      removed.push(p);
      storage.delete(p);
    }
  },
}));

import { Hono } from "hono";

let app: Hono;
let vectorTenant: string;
let aticTenant: string;
let ana: string;
let borisAtic: string;
let leadVector: string;
let leadAtic: string;

/** Un PDF minim, cu semnătura reală `%PDF-` — verificarea de octeți e pe magic bytes. */
const PDF_BYTES = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");

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

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadFilesRoutes } = await import("../routes/crmLeadFiles");
  app = new Hono();
  app.route("/api/crm/lead-files", crmLeadFilesRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-files" }).returning();
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-files" }).returning();
  vectorTenant = vector.id;
  aticTenant = atic.id;

  const mkUser = async (tenantId: string, email: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: "admin" })
      .returning();
    return u.id;
  };
  ana = await mkUser(vectorTenant, "ana@vector.md");
  borisAtic = await mkUser(aticTenant, "boris@atic.md");

  const [lv] = await testDb
    .insert(leads)
    .values({ tenantId: vectorTenant, fullName: "Acme SRL", stage: "new", source: "manual" })
    .returning();
  leadVector = lv.id;
  const [la] = await testDb
    .insert(leads)
    .values({ tenantId: aticTenant, fullName: "Alt workspace", stage: "new", source: "manual" })
    .returning();
  leadAtic = la.id;

  session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Încărcarea unui fișier pe lead", () => {
  it("[blocant] drumul complet: sign → urcare → finalize scrie rândul cu mărimea REALĂ", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const signed = await post("/api/crm/lead-files/sign", {
      leadId: leadVector,
      fileName: "oferta.pdf",
      mime: "application/pdf",
      sizeBytes: 1024,
    });
    expect(signed.status).toBe(200);

    const objectPath = signed.body.path as unknown as string;
    storage.set(objectPath, PDF_BYTES);

    const finalized = await post("/api/crm/lead-files/finalize", {
      leadId: leadVector,
      path: objectPath,
      fileName: "oferta.pdf",
      mime: "application/pdf",
    });

    expect(finalized.status).toBe(201);
    const [row] = await testDb.select().from(leadAttachments).where(eq(leadAttachments.leadId, leadVector));
    expect(row.storagePath).toBe(objectPath);
    expect(row.fileUrl).toBeNull(); // conținutul NU ajunge în Postgres
    // Mărimea vine din octeții descărcați, nu din ce a declarat clientul la `sign`.
    expect(row.sizeBytes).toBe(PDF_BYTES.byteLength);
  });

  it("[blocant] conținutul care nu corespunde tipului declarat e respins ȘI șters din bucket", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const objectPath = `${vectorTenant}/fals.pdf`;
    storage.set(objectPath, Buffer.from("<html><script>alert(1)</script></html>"));

    const res = await post("/api/crm/lead-files/finalize", {
      leadId: leadVector,
      path: objectPath,
      fileName: "fals.pdf",
      mime: "application/pdf",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("file_content_mismatch");
    expect(removed).toContain(objectPath);
    const rows = await testDb.select().from(leadAttachments).where(eq(leadAttachments.fileName, "fals.pdf"));
    expect(rows).toHaveLength(0);
  });

  it("[blocant] o cale din alt workspace e refuzată chiar dacă trece prin `..`", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await post("/api/crm/lead-files/finalize", {
      leadId: leadVector,
      path: `${vectorTenant}/../${aticTenant}/secret.pdf`,
      fileName: "secret.pdf",
      mime: "application/pdf",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_path");
  });

  it("[blocant] nu se pot urca fișiere pe leadul altui workspace", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await post("/api/crm/lead-files/sign", {
      leadId: leadAtic,
      fileName: "x.pdf",
      mime: "application/pdf",
      sizeBytes: 10,
    });
    expect(res.status).toBe(404);
  });

  it("[normal] tipurile periculoase la previzualizare (SVG) nu sunt acceptate", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await post("/api/crm/lead-files/sign", {
      leadId: leadVector,
      fileName: "logo.svg",
      mime: "image/svg+xml",
      sizeBytes: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_file_type");
  });
});

describe("Citirea și ștergerea", () => {
  it("[blocant] lista NU întoarce calea din Storage — e o adresă internă", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const res = await app.request(`/api/crm/lead-files?leadId=${leadVector}`);
    const raw = await res.text();

    expect(raw).toContain("oferta.pdf");
    expect(raw).toContain("/preview");
    expect(raw).not.toContain("storagePath");
    expect(raw).not.toContain(`${vectorTenant}/oferta.pdf`);
  });

  it("[blocant] fișierele unui workspace nu se văd (și nu se șterg) din altul", async () => {
    const [file] = await testDb.select().from(leadAttachments).where(eq(leadAttachments.leadId, leadVector));

    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    const preview = await app.request(`/api/crm/lead-files/${file.id}/preview`);
    expect(preview.status).toBe(404);

    const del = await app.request(`/api/crm/lead-files/${file.id}`, { method: "DELETE" });
    expect(del.status).toBe(404);

    expect(await testDb.select().from(leadAttachments).where(eq(leadAttachments.id, file.id))).toHaveLength(1);
  });

  it("[normal] previzualizarea servește octeții, cu nosniff și fără descărcare forțată", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [file] = await testDb.select().from(leadAttachments).where(eq(leadAttachments.leadId, leadVector));

    const res = await app.request(`/api/crm/lead-files/${file.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toContain("inline");
  });

  it("[normal] ștergerea scoate rândul ȘI obiectul din bucket", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const [file] = await testDb.select().from(leadAttachments).where(eq(leadAttachments.leadId, leadVector));

    const res = await app.request(`/api/crm/lead-files/${file.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(await testDb.select().from(leadAttachments).where(eq(leadAttachments.id, file.id))).toHaveLength(0);
    expect(removed).toContain(file.storagePath);
  });
});
