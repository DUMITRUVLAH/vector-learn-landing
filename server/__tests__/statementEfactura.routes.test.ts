/**
 * @vitest-environment node
 * STMT-005: statement → e-Factura — INTEGRATION tests (real routes, PGlite, all migrations).
 *
 * Tests the ACTION, not the affordance (§3.5.1quater): every endpoint is actually invoked
 * with realistic input (verbatim MAIB PDF text) and the response status + shape asserted.
 *
 * Flow covered end-to-end:
 *   1. POST /upload (JSON mode, real merged MAIB text) → 201, lines extracted WITH buyer IDNO
 *   2. POST /:captureId/export-xml → 200 XML download (single) / ZIP (multi), no SFS creds
 *   3. POST /:captureId/export-xml with an OUT line → 422 all-or-nothing with per-line errors
 *   4. POST /:captureId/submit-efactura-batch (mock SFS) → 200, fin_einvoices row whose
 *      xmlPayload contains the buyer IDNO from the statement; line linked
 *   5. re-submit same line → already_exported error entry
 *   6. PATCH a line's missing IDNO → subsequent export succeeds
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { finSfsSettings, finEinvoices } from "../db/schema/finEinvoices";
import { eq } from "drizzle-orm";
import { MAIB_MERGED_FIXTURE } from "./fixtures/maibMergedStatement";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

// Inject the test user directly — auth mechanics are covered elsewhere.
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "admin", email: "test@vector.md" });
    await next();
  },
}));

// Import routes AFTER mocks are registered.
import { finStatementRoutes } from "../routes/finStatement";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/fin/statement", finStatementRoutes);

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "Vector Academy Test", slug: "vector-test" })
    .returning();
  tenantId = tenant.id;

  const [user] = await testDb
    .insert(users)
    .values({ tenantId, email: "test@vector.md", passwordHash: "x", name: "Test User", role: "admin" })
    .returning();
  userId = user.id;

  // Company SFS settings: IDNO + IBAN only (no credentials → mock mode). This is all the
  // XML export needs; the API submit falls back to the mock transport.
  await testDb.insert(finSfsSettings).values({
    tenantId,
    idno: "1024600035737",
    bankAccount: "MD87AG000000022516065719",
    environment: "mock",
  });
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

interface UploadedLine {
  id: string;
  direction: string;
  counterparty: string | null;
  counterpartyIdno: string | null;
  counterpartyIban: string | null;
  amountCents: number;
  reportable: string;
}

let captureId: string;
let lines: UploadedLine[];

describe("STMT-005 integration: upload → lines with buyer IDNO", () => {
  it("[blocant] POST /upload with real MAIB merged text → 201 + 12 lines, all with IDNO", async () => {
    const res = await app.request("/api/fin/statement/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "extras-mai-2026.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        rawText: MAIB_MERGED_FIXTURE,
        kind: "statement",
        forceKind: true,
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { captureId: string; lineCount: number; lines: UploadedLine[] };
    expect(data.lineCount).toBe(12);
    captureId = data.captureId;
    lines = data.lines;
    // serializeLine exposes the new fields
    const withIdno = data.lines.filter((l) => l.counterpartyIdno);
    expect(withIdno.length).toBe(12);
    const amdaris = data.lines.find((l) => l.counterparty?.includes("AMDARIS"));
    expect(amdaris?.counterpartyIdno).toBe("1009600020033");
    expect(amdaris?.counterpartyIban).toBe("MD94AG000000022512036601");
  });
});

describe("STMT-005 integration: export-xml (manual Import XML path — no SFS credentials)", () => {
  it("[blocant] single valid line → 200 application/xml with buyer IDNO", async () => {
    const amdaris = lines.find((l) => l.counterparty?.includes("AMDARIS"))!;
    const res = await app.request(`/api/fin/statement/${captureId}/export-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [amdaris.id] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const xml = await res.text();
    expect(xml).toContain('<Buyer IDNO="1009600020033">');
    expect(xml).toContain('<Supplier IDNO="1024600035737">');
    expect(xml).toContain("<CreationMotiv>1</CreationMotiv>");
  });

  it("[blocant] multiple valid lines → 200 ZIP", async () => {
    const candidates = lines.filter((l) => l.direction === "in" && l.reportable === "yes");
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const res = await app.request(`/api/fin/statement/${captureId}/export-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: candidates.map((l) => l.id) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // ZIP magic
    // The ZIP actually contains one XML per line
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)).toHaveLength(candidates.length);
  });

  it("[blocant] an OUT line in the selection → 422 all-or-nothing with per-line errors", async () => {
    const outLine = lines.find((l) => l.direction === "out")!;
    const inLine = lines.find((l) => l.direction === "in" && l.reportable === "yes")!;
    const res = await app.request(`/api/fin/statement/${captureId}/export-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [inLine.id, outLine.id] }),
    });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string; errors: Array<{ lineId: string; error: string }> };
    expect(data.error).toBe("invalid_lines");
    expect(data.errors.some((e) => e.lineId === outLine.id && e.error === "only_incoming")).toBe(true);
  });

  it("[blocant] line with IDNO wiped → 422 missing_buyer_idno; PATCHing the IDNO fixes the export", async () => {
    const inLine = lines.find((l) => l.direction === "in" && l.reportable === "yes")!;
    // Wipe the IDNO via the real PATCH route
    const wipe = await app.request(`/api/fin/statement/${captureId}/lines/${inLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartyIdno: null }),
    });
    expect(wipe.status).toBe(200);

    const fail = await app.request(`/api/fin/statement/${captureId}/export-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [inLine.id] }),
    });
    expect(fail.status).toBe(422);
    const failData = (await fail.json()) as { errors: Array<{ error: string }> };
    expect(failData.errors[0].error).toBe("missing_buyer_idno");

    // User fills it back in via the edit panel → export works again
    const fix = await app.request(`/api/fin/statement/${captureId}/lines/${inLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartyIdno: inLine.counterpartyIdno }),
    });
    expect(fix.status).toBe(200);
    const ok = await app.request(`/api/fin/statement/${captureId}/export-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [inLine.id] }),
    });
    expect(ok.status).toBe(200);
  });
});

describe("STMT-005 integration: submit-efactura-batch (mock SFS transport)", () => {
  it("[blocant] valid IN lines → 200, einvoice rows created with buyer IDNO in xmlPayload", async () => {
    const candidates = lines.filter((l) => l.direction === "in" && l.reportable === "yes");
    const res = await app.request(`/api/fin/statement/${captureId}/submit-efactura-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: candidates.map((l) => l.id) }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      submitted: number;
      errors: unknown[];
      results: Array<{ lineId: string; ok: boolean; einvoiceId?: string; sfsStatus?: string }>;
    };
    expect(data.submitted).toBe(candidates.length);
    expect(data.errors).toHaveLength(0);

    // The einvoice rows really exist and their XML carries the statement's buyer IDNO
    const einvoiceRows = await testDb.select().from(finEinvoices).where(eq(finEinvoices.tenantId, tenantId));
    expect(einvoiceRows.length).toBe(candidates.length);
    const amdaris = candidates.find((l) => l.counterparty?.includes("AMDARIS"))!;
    const withAmdarisIdno = einvoiceRows.filter((r) => r.xmlPayload?.includes('<Buyer IDNO="1009600020033">'));
    expect(withAmdarisIdno.length).toBe(1);
    expect(amdaris.counterpartyIdno).toBe("1009600020033");
    // DB stores enum-valid status (NOT the literal "mock" — that used to crash the insert)
    for (const r of einvoiceRows) {
      expect(["pending", "sent", "accepted", "rejected", "cancelled"]).toContain(r.sfsStatus);
    }
    // UI-facing status still says "mock" so the badge can explain SFS isn't configured
    for (const r of data.results) {
      expect(r.ok).toBe(true);
      expect(r.sfsStatus).toBe("mock");
    }
  });

  it("[blocant] re-submitting the same line → already_exported error entry, nothing duplicated", async () => {
    const candidate = lines.find((l) => l.direction === "in" && l.reportable === "yes")!;
    const res = await app.request(`/api/fin/statement/${captureId}/submit-efactura-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [candidate.id] }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { submitted: number; errors: Array<{ error: string }> };
    expect(data.submitted).toBe(0);
    expect(data.errors[0].error).toBe("already_exported");
  });

  it("[blocant] OUT line → only_incoming error entry (no e-Factura for supplier payments)", async () => {
    const outLine = lines.find((l) => l.direction === "out")!;
    const res = await app.request(`/api/fin/statement/${captureId}/submit-efactura-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [outLine.id] }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { submitted: number; errors: Array<{ error: string }> };
    expect(data.submitted).toBe(0);
    expect(data.errors[0].error).toBe("only_incoming");
  });
});
