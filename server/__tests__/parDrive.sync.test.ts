/**
 * @vitest-environment node
 * PAR-DRIVE — runner-ul de sincronizare, pe DB reală (PGlite + toate migrările), cu Drive-ul mocat.
 *
 * Ce apără testul, concret:
 *  - se urcă DOAR cererile plătite (o ciornă în Drive ar fi o scurgere de date, nu o funcție);
 *  - a doua rulare nu reurcă nimic dacă n-a mișcat nimic (altfel factura de API și timpul cresc
 *    săptămânal, fără niciun câștig);
 *  - o modificare a cererii declanșează UPDATE pe același fișier, nu un al doilea dosar în Drive;
 *  - arborele de mape din Drive e cel din aplicație: Proiect / Eveniment / Plătite.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parDriveConnections,
  parDriveFiles,
  parEvents,
  parPayers,
  parProjects,
  parRequests,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let paidParId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

// Dosarul în sine e testat de par-dosar-complet.routes.test.ts; aici contează CE se urcă și când.
vi.mock("../lib/par/buildDosar", () => ({
  buildDosar: vi.fn(async (parId: string) => ({
    bytes: Buffer.from(`%PDF-1.4 ${parId}`),
    fileName: "Dosar_PAR_2026-0001.pdf",
  })),
}));

const created: Array<{ name: string; parentId: string | null }> = [];
const uploads: Array<{ name: string; parentId: string; existingFileId: string | null }> = [];

vi.mock("../lib/par/googleDrive", () => ({
  getDriveConfig: () => ({ clientId: "id", clientSecret: "secret", redirectUri: "https://app/cb" }),
  refreshDriveAccessToken: vi.fn(async () => "access-token"),
  fileExists: vi.fn(async () => true),
  createFolder: vi.fn(async (_t: string, name: string, parentId: string | null) => {
    created.push({ name, parentId });
    return `folder-${created.length}`;
  }),
  ensureFolder: vi.fn(async (_t: string, name: string, parentId: string | null) => {
    created.push({ name, parentId });
    return `folder-${created.length}`;
  }),
  uploadPdf: vi.fn(
    async (
      _t: string,
      p: { name: string; parentId: string; bytes: Buffer; existingFileId?: string | null }
    ) => {
      uploads.push({ name: p.name, parentId: p.parentId, existingFileId: p.existingFileId ?? null });
      return { fileId: p.existingFileId ?? `file-${uploads.length}`, webViewLink: null };
    }
  ),
  moveFile: vi.fn(async () => undefined),
  revokeDriveToken: vi.fn(async () => undefined),
}));

vi.mock("../lib/crypto", () => ({
  encrypt: (s: string) => s,
  decrypt: (s: string) => s,
  isEncrypted: () => true,
}));

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
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-drive" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb
    .insert(parPayers)
    .values({ tenantId, name: "ATIC", legalName: "Asociația ATIC", idno: "1006600034927" })
    .returning();

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "admin@vector.md", passwordHash: "x", name: "Violeta Ștefan", role: "manager" })
    .returning();
  userId = u.id;

  const [project] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Erasmus 2026", code: "ERA26" })
    .returning();
  const [event] = await testDb
    .insert(parEvents)
    .values({ tenantId, name: "Conferința de toamnă", projectId: project.id })
    .returning();

  const [paid] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0001",
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "paid",
      payerId: payer.id,
      projectId: project.id,
      eventId: event.id,
      paidAt: new Date("2026-09-01T10:00:00Z"),
    })
    .returning();
  paidParId = paid.id;

  // Aceeași organizație, o ciornă: NU are ce căuta în Drive.
  await testDb.insert(parRequests).values({
    tenantId,
    requestNo: "PAR-2026-0002",
    requestedByUserId: userId,
    purpose: "execute_payment",
    chargeTo: "program",
    status: "draft",
    payerId: payer.id,
    projectId: project.id,
  });

  await testDb.insert(parDriveConnections).values({
    tenantId,
    googleEmail: "office@vector.md",
    refreshTokenEnc: "refresh-token",
    rootFolderId: "root-1",
    connectedByUserId: userId,
  });
});

beforeEach(() => {
  created.length = 0;
  uploads.length = 0;
});

describe("runDriveSyncForTenant", () => {
  it("[blocant] urcă doar cererile plătite, în arborele Proiect / Eveniment / Plătite", async () => {
    const { runDriveSyncForTenant } = await import("../lib/par/driveSync");
    const summary = await runDriveSyncForTenant(tenantId);

    expect(summary.status).toBe("ok");
    expect(summary.uploaded).toBe(1);
    expect(uploads).toHaveLength(1); // ciorna NU s-a urcat
    expect(uploads[0].existingFileId).toBeNull();
    expect(created.map((f) => f.name)).toEqual(["Erasmus 2026", "Conferința de toamnă", "Plătite"]);
    expect(created[0].parentId).toBe("root-1");

    const [row] = await testDb.select().from(parDriveFiles).where(eq(parDriveFiles.parId, paidParId));
    expect(row.status).toBe("synced");
    expect(row.driveFileId).toBe("file-1");
    expect(row.folderPathKey).toContain("bucket:paid");
  });

  it("[blocant] a doua rulare nu reurcă nimic dacă dosarul n-a mișcat", async () => {
    const { runDriveSyncForTenant } = await import("../lib/par/driveSync");
    const summary = await runDriveSyncForTenant(tenantId);

    expect(uploads).toHaveLength(0);
    expect(summary.unchanged).toBe(1);
    expect(summary.uploaded).toBe(0);
    expect(summary.status).toBe("ok");
  });

  it("[blocant] cererea modificată se ACTUALIZEAZĂ în același fișier, nu se dublează", async () => {
    const { runDriveSyncForTenant } = await import("../lib/par/driveSync");
    await testDb
      .update(parRequests)
      .set({ updatedAt: new Date("2026-09-08T09:00:00Z") })
      .where(eq(parRequests.id, paidParId));

    const summary = await runDriveSyncForTenant(tenantId);

    expect(summary.updated).toBe(1);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].existingFileId).toBe("file-1");

    const rows = await testDb.select().from(parDriveFiles).where(eq(parDriveFiles.parId, paidParId));
    expect(rows).toHaveLength(1);
  });

  it("sincronizarea oprită din setări nu atinge Drive-ul deloc", async () => {
    const { runDriveSyncForTenant } = await import("../lib/par/driveSync");
    await testDb
      .update(parDriveConnections)
      .set({ syncEnabled: false })
      .where(eq(parDriveConnections.tenantId, tenantId));

    const summary = await runDriveSyncForTenant(tenantId);
    expect(summary.status).toBe("skipped");
    expect(uploads).toHaveLength(0);

    await testDb
      .update(parDriveConnections)
      .set({ syncEnabled: true })
      .where(eq(parDriveConnections.tenantId, tenantId));
  });

  it("un workspace fără conexiune e sărit, nu tratat ca eroare", async () => {
    const { runDriveSyncForTenant } = await import("../lib/par/driveSync");
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-drive" }).returning();
    const summary = await runDriveSyncForTenant(other.id);
    expect(summary.status).toBe("skipped");
    expect(summary.message).toContain("nu e conectat");
  });
});

describe("runWeeklyDriveSync", () => {
  it("[blocant] rulează doar în ziua aleasă de workspace", async () => {
    const { runWeeklyDriveSync } = await import("../lib/par/driveSync");
    await testDb
      .update(parDriveConnections)
      .set({ syncDayOfWeek: 1, lastSyncAt: null })
      .where(eq(parDriveConnections.tenantId, tenantId));

    // Marți: nimeni nu rulează.
    const tuesday = new Date("2026-09-08T06:00:00Z");
    expect(await runWeeklyDriveSync(tuesday)).toHaveLength(0);

    // Luni: workspace-ul intră la rând.
    const monday = new Date("2026-09-07T06:00:00Z");
    const summaries = await runWeeklyDriveSync(monday);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].tenantId).toBe(tenantId);
  });

  it("nu reia sincronizarea de două ori în aceeași zi", async () => {
    const { runWeeklyDriveSync } = await import("../lib/par/driveSync");
    const monday = new Date("2026-09-07T06:00:00Z");
    await testDb
      .update(parDriveConnections)
      .set({ syncDayOfWeek: 1, lastSyncAt: monday })
      .where(eq(parDriveConnections.tenantId, tenantId));

    expect(await runWeeklyDriveSync(monday)).toHaveLength(0);
  });
});
