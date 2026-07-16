/**
 * @vitest-environment node
 * VM3-01 + VM3-02 — INTEGRATION tests (real routes, PGlite, all migrations).
 *
 * Tests the ACTION, not the affordance (§3.5.1quater): the endpoints are actually invoked
 * and the response status + shape asserted.
 *
 * Covered:
 *   1. VM3-01: GET /api/par/finance → 200; items carry payeeIdnp/payeeIban/endUse,
 *      budgetCodeLabel, approverDecisions (name + decidedAt) and attachmentsMeta
 *      (metadata ONLY — no fileUrl, data-URLs would bloat the list).
 *   2. VM3-02: GET /api/par/:id/dosar → 200 %PDF with the approval sheet as page 1.
 *      REGRESSION: attachment kinds "invoice"/"payment_order" render separator titles
 *      "Factură"/"Ordin de plată" — the OLD code passed them raw to Helvetica (WinAnsi)
 *      and pdf-lib THREW `WinAnsi cannot encode "ă"` → the whole dosar 500'd.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parApprovals,
  parAttachments,
  parBudgetCodes,
  parMembers,
  parProjects,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string; // finance user (the caller)
let approver1Id: string;
let approver2Id: string;
let parId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

// Inject the test user directly — auth mechanics are covered elsewhere.
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "finance@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

// Routes are imported DYNAMICALLY in beforeAll (after testDb exists): parPayments →
// services/par/notify constructs MessagingService(db) at module scope, so a static
// import would hit the `db` getter while `testDb` is still in TDZ.
let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    const stmts = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await pg.exec(stmt);
    }
  }
}

/** Minimal valid one-page PDF as a data URL (what uploadAttachment stores). */
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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [{ parPaymentsRoutes }, { parRoutes }] = await Promise.all([
    import("../routes/parPayments"),
    import("../routes/par"),
  ]);
  app = new Hono();
  app.route("/api/par", parPaymentsRoutes);
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "ATIC Test", slug: "atic-test" })
    .returning();
  tenantId = tenant.id;

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "manager" })
      .returning();
    return u.id;
  };
  userId = await mkUser("finance@vector.md", "Violeta Finanțe");
  approver1Id = await mkUser("a1@vector.md", "Ion Aprobatorul");
  approver2Id = await mkUser("a2@vector.md", "Oana Directoarea");

  await testDb.insert(parMembers).values([
    { tenantId, userId, role: "finance" },
    { tenantId, userId: approver1Id, role: "approver" },
    { tenantId, userId: approver2Id, role: "approver" },
  ]);

  const [proj] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Digital Safeguard" })
    .returning();
  const [bc] = await testDb
    .insert(parBudgetCodes)
    .values({ tenantId, code: "OPS-2026-07", name: "Operațiuni iulie" })
    .returning();

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0042",
      requestedByUserId: approver1Id,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "approved",
      projectId: proj.id,
      budgetCodeId: bc.id,
      endUse: "Servicii de consultanță psihologică de grup pe Zoom",
      payeeName: "Consult Prim SRL",
      payeeIdnp: "1002600012345",
      payeeIban: "MD24AG000225100013104168",
      payeeBank: "MAIB",
      currency: "MDL",
      totalEstimatedCents: 700000,
      dateOfRequest: new Date("2026-07-10T00:00:00Z"),
      approvedAt: new Date("2026-07-14T10:30:00Z"),
    })
    .returning();
  parId = par.id;

  // Two approved steps with decided dates — the audit information Violeta asked for.
  await testDb.insert(parApprovals).values([
    {
      tenantId,
      parId,
      step: 0,
      approverUserId: approver1Id,
      approverRoleLabel: "Solicitant",
      decision: "approved",
      decidedAt: new Date("2026-07-12T09:00:00Z"),
    },
    {
      tenantId,
      parId,
      step: 1,
      approverUserId: approver1Id,
      approverRoleLabel: "DOA Holder / Supervisor",
      decision: "approved",
      decidedAt: new Date("2026-07-13T11:15:00Z"),
    },
    {
      tenantId,
      parId,
      step: 2,
      approverUserId: approver2Id,
      approverRoleLabel: "Executive Director",
      decision: "approved",
      decidedAt: new Date("2026-07-14T10:30:00Z"),
      comment: "Aprobat conform bugetului",
    },
  ]);

  // Attachment kinds whose separator labels contain ă (Factură / Ordin de plată) —
  // the diacritics regression trigger.
  await testDb.insert(parAttachments).values([
    { tenantId, parId, fileUrl: tinyPdfDataUrl(), fileName: "factura-42.pdf", kind: "invoice" },
    { tenantId, parId, fileUrl: tinyPdfDataUrl(), fileName: "ordin-42.pdf", kind: "payment_order" },
  ]);
  // 240s: sub paralelism (mai multe suite PGlite concurente) migrarea completă poate depăși 120s.
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

interface QueueItem {
  id: string;
  requestNo: string;
  payeeIdnp: string | null;
  payeeIban: string | null;
  endUse: string | null;
  budgetCodeLabel: string | null;
  approverDecisions: { name: string; step: number; decidedAt: string | null }[];
  attachmentsMeta: { id: string; fileName: string; kind: string; fileUrl?: string }[];
  approverNames: string[];
}

describe("VM3-01: GET /api/par/finance — coloanele contabilului", () => {
  it("[blocant] returns IDNO/IBAN/destinație + budgetCodeLabel + approverDecisions + attachmentsMeta", async () => {
    const res = await app.request("/api/par/finance");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: QueueItem[]; total: number };
    expect(data.total).toBe(1);
    const item = data.items[0];

    // Coloanele Violeta: IDNO, IBAN, destinația plății
    expect(item.payeeIdnp).toBe("1002600012345");
    expect(item.payeeIban).toBe("MD24AG000225100013104168");
    expect(item.endUse).toContain("consultanță");

    // Budget line rezolvat ca etichetă
    expect(item.budgetCodeLabel).toBe("OPS-2026-07 — Operațiuni iulie");

    // Audit: cine a aprobat + la ce dată (doar pașii ≥1, ordonați)
    expect(item.approverDecisions).toHaveLength(2);
    expect(item.approverDecisions[0].name).toBe("Ion Aprobatorul");
    expect(item.approverDecisions[0].step).toBe(1);
    expect(item.approverDecisions[0].decidedAt).toBeTruthy();
    expect(item.approverDecisions[1].name).toBe("Oana Directoarea");
    expect(item.approverDecisions[1].step).toBe(2);

    // Documentele atașate: DOAR metadata (fileUrl-urile data: sunt uriașe)
    expect(item.attachmentsMeta).toHaveLength(2);
    const kinds = item.attachmentsMeta.map((a) => a.kind).sort();
    expect(kinds).toEqual(["invoice", "payment_order"]);
    for (const att of item.attachmentsMeta) {
      expect(att.fileUrl).toBeUndefined();
      expect(att.fileName).toBeTruthy();
      expect(att.id).toBeTruthy();
    }

    // Câmpul istoric rămâne (nume fără dată)
    expect(item.approverNames).toContain("Ion Aprobatorul");
  });
});

describe("VM3-02: GET /api/par/:id/dosar — fișa aprobărilor + regresia diacriticelor", () => {
  it("[blocant] dosar cu atașamente 'Factură'/'Ordin de plată' → 200 PDF (nu 500 WinAnsi) cu fișa ca pagina 1", async () => {
    const res = await app.request(`/api/par/${parId}/dosar`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    // %PDF magic
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");

    // Structura: fișa (≥1 pagină) + 2 separatoare + 2 pagini de atașament = ≥5 pagini
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(5);
  });

  it("[blocant] dosar FĂRĂ atașamente → tot 200, fișa aprobărilor tot prezentă", async () => {
    // Un al doilea PAR aprobat, fără atașamente
    const [par2] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo: "PAR-2026-0043",
        requestedByUserId: approver1Id,
        purpose: "execute_payment",
        chargeTo: "program",
        status: "approved",
        currency: "MDL",
        totalEstimatedCents: 100000,
        dateOfRequest: new Date("2026-07-11T00:00:00Z"),
      })
      .returning();
    const res = await app.request(`/api/par/${par2.id}/dosar`);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // fișa (1) + pagina informativă "nu există atașamente" (1)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
