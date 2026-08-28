/**
 * @vitest-environment node
 * Urgency flag (owner request, 2026-08-28) — INTEGRATION tests (real routes, PGlite, all
 * migrations). Tests the ACTION, not the affordance (§3.5.1quater).
 *
 * Covered:
 *   1. POST /api/par with a valid is_urgent + urgent_reason + urgent_due_date → 201, fields persisted.
 *   2. POST /api/par with is_urgent=true and no urgent_reason → 400 urgent_reason_required.
 *   3. POST /api/par with urgent_reason="other" and no note → 400 urgent_reason_note_required.
 *   4. POST /api/par with is_urgent=true and no urgent_due_date → 400 urgent_due_date_required.
 *   5. GET /api/par — list carries isUrgent/urgentReason/urgentDueDate and sorts urgent-first
 *      even when the urgent row is OLDER than the non-urgent one.
 *   6. GET /api/par/inbox — same sort guarantee for the approver's inbox.
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
  parMembers,
  parPayerModules,
  parPayers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let requestorId: string;
let approverId: string;
let payerId: string;
/** Which user the mocked requireAuth attaches to the request — swapped per-test (like
 *  `callerTenantRole` in par-finance-queue.routes.test.ts) so the same app instance can act as
 *  the requestor for POST /api/par and as the approver for GET /api/par/inbox. */
let callerUserId: () => string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: callerUserId(), tenantId, role: "manager", email: "test@vector.md" });
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

  const [{ parRoutes }, { parApprovalsRoutes }] = await Promise.all([
    import("../routes/par"),
    import("../routes/parApprovals"),
  ]);
  app = new Hono();
  // Mount order matters: Hono matches longest-prefix, and "/inbox" must be registered before
  // parRoutes' "/:id" catch-all or it resolves as GET /api/par/:id with id="inbox" → 404.
  // Same order as server/app.ts (parApprovalsRoutes mounted before parRoutes).
  app.route("/api/par", parApprovalsRoutes);
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "ATIC Test", slug: "atic-test-urgent" })
    .returning();
  tenantId = tenant.id;

  const [payer] = await testDb
    .insert(parPayers)
    .values({ tenantId, name: "ATIC Test", active: true })
    .returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({
    tenantId,
    payerId,
    moduleKey: "par",
    enabled: true,
  });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "manager" })
      .returning();
    return u.id;
  };
  requestorId = await mkUser("requestor@vector.md", "Ion Solicitantul");
  approverId = await mkUser("approver@vector.md", "Oana Aprobatoarea");
  callerUserId = () => requestorId;

  await testDb.insert(parMembers).values([
    { tenantId, userId: requestorId, role: "requestor" },
    { tenantId, userId: approverId, role: "approver" },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

interface ParListResponse {
  id: string;
  requestNo: string;
  isUrgent: boolean;
  urgentReason: string | null;
  urgentReasonNote: string | null;
  urgentDueDate: string | null;
}

describe("Urgency flag — POST /api/par validation", () => {
  it("[blocant] creates an urgent PAR with a valid reason + due date → 201, fields persisted", async () => {
    const res = await app.request("/api/par", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payer_id: payerId,
        is_urgent: true,
        urgent_reason: "contract_deadline",
        urgent_due_date: "2026-09-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ParListResponse;
    expect(body.isUrgent).toBe(true);
    expect(body.urgentReason).toBe("contract_deadline");
    expect(body.urgentDueDate).toBeTruthy();
  });

  it("[blocant] is_urgent=true without urgent_reason → 400 urgent_reason_required", async () => {
    const res = await app.request("/api/par", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payer_id: payerId,
        is_urgent: true,
        urgent_due_date: "2026-09-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("urgent_reason_required");
  });

  it("[blocant] urgent_reason='other' without a note → 400 urgent_reason_note_required", async () => {
    const res = await app.request("/api/par", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payer_id: payerId,
        is_urgent: true,
        urgent_reason: "other",
        urgent_due_date: "2026-09-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("urgent_reason_note_required");
  });

  it("[blocant] is_urgent=true without urgent_due_date → 400 urgent_due_date_required", async () => {
    const res = await app.request("/api/par", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payer_id: payerId,
        is_urgent: true,
        urgent_reason: "contract_deadline",
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("urgent_due_date_required");
  });

  it("[normal] not urgent (default) → 201, no reason/date required", async () => {
    const res = await app.request("/api/par", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payer_id: payerId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ParListResponse;
    expect(body.isUrgent).toBe(false);
  });
});

describe("Urgency flag — sorts first everywhere approvers/finance look", () => {
  let urgentParId: string;
  let normalParId: string;

  beforeAll(async () => {
    // The urgent PAR is OLDER (earlier createdAt/submittedAt) than the normal one — if urgency
    // weren't the PRIMARY sort key, a plain "newest first" order would put the normal PAR first.
    const older = new Date("2026-07-01T00:00:00Z");
    const newer = new Date("2026-07-10T00:00:00Z");

    const [urgent] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo: "PAR-2026-URG1",
        requestedByUserId: requestorId,
        purpose: "execute_payment",
        chargeTo: "program",
        status: "pending_approval",
        payerId,
        currency: "MDL",
        totalEstimatedCents: 500000,
        dateOfRequest: older,
        submittedAt: older,
        createdAt: older,
        isUrgent: true,
        urgentReason: "penalty_risk",
        urgentDueDate: new Date("2026-07-15T00:00:00Z"),
      })
      .returning();
    urgentParId = urgent.id;

    const [normal] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo: "PAR-2026-URG2",
        requestedByUserId: requestorId,
        purpose: "execute_payment",
        chargeTo: "program",
        status: "pending_approval",
        payerId,
        currency: "MDL",
        totalEstimatedCents: 300000,
        dateOfRequest: newer,
        submittedAt: newer,
        createdAt: newer,
        isUrgent: false,
      })
      .returning();
    normalParId = normal.id;

    await testDb.insert(parApprovals).values([
      { tenantId, parId: urgentParId, step: 1, approverUserId: approverId, approverRoleLabel: "Aprobator", decision: "pending", locked: false },
      { tenantId, parId: normalParId, step: 1, approverUserId: approverId, approverRoleLabel: "Aprobator", decision: "pending", locked: false },
    ]);
  });

  it("[blocant] GET /api/par sorts the urgent (older) request before the normal (newer) one", async () => {
    const res = await app.request("/api/par");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { requests: ParListResponse[] };
    const urgentIdx = data.requests.findIndex((r) => r.id === urgentParId);
    const normalIdx = data.requests.findIndex((r) => r.id === normalParId);
    expect(urgentIdx).toBeGreaterThanOrEqual(0);
    expect(normalIdx).toBeGreaterThanOrEqual(0);
    expect(urgentIdx).toBeLessThan(normalIdx);
    const urgentRow = data.requests[urgentIdx];
    expect(urgentRow.isUrgent).toBe(true);
    expect(urgentRow.urgentReason).toBe("penalty_risk");
  });

  it("[blocant] GET /api/par/inbox sorts the urgent (older) request before the normal (newer) one", async () => {
    // The two seeded PARs are requested BY requestorId, so the inbox must be read as the
    // approver — segregation of duties hides a requestor's own PARs from their own inbox.
    callerUserId = () => approverId;
    try {
      const res = await app.request("/api/par/inbox");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { inbox: ParListResponse[] };
      const urgentIdx = data.inbox.findIndex((r) => r.id === urgentParId);
      const normalIdx = data.inbox.findIndex((r) => r.id === normalParId);
      expect(urgentIdx).toBeGreaterThanOrEqual(0);
      expect(normalIdx).toBeGreaterThanOrEqual(0);
      expect(urgentIdx).toBeLessThan(normalIdx);
    } finally {
      callerUserId = () => requestorId;
    }
  });
});
