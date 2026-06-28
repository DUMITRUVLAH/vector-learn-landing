/**
 * @vitest-environment node
 * SEC-05 — FinDesk GDPR export/anonymize RBAC + destructive-scoping guards.
 *
 * Mounts the REAL finGdpr router on PGlite seeded with two FinDesk members (a fin-owner and a
 * fin-viewer) and students in different statuses, and asserts:
 *  - export/anonymize require fin-OWNER (a viewer → 403),
 *  - anonymize without { confirm: true } → 400,
 *  - anonymize only touches ARCHIVED students (an active student keeps its PII),
 *  - a successful anonymize writes an audit row.
 * Test the action: every endpoint is invoked with realistic input and the effect is asserted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const VIEWER = "00000000-0000-0000-0000-0000000000bb";

let pg: PGlite;
let testDb: ReturnType<typeof drizzle>;
let app: Hono;
let actingUser = OWNER;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  getSessionUser: async () => ({
    user: { id: actingUser, tenantId: TENANT, role: "viewer", isActive: true },
    sessionToken: "test",
  }),
}));

async function seed() {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS fin_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      full_name varchar(200) NOT NULL,
      phone varchar(32), email varchar(255),
      parent_phone varchar(32), parent_email varchar(255),
      birth_date date,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fin_data_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL UNIQUE,
      retention_days_students integer NOT NULL DEFAULT 365
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      actor_id uuid, action_type varchar(64) NOT NULL, target_type varchar(64) NOT NULL,
      target_id uuid, old_value jsonb, new_value jsonb, ip_address varchar(64),
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pg.exec(`DELETE FROM fin_members; DELETE FROM students; DELETE FROM fin_data_settings; DELETE FROM audit_log;`);
  await pg.exec(`
    INSERT INTO fin_members (tenant_id, user_id, role) VALUES
      ('${TENANT}', '${OWNER}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer');
    INSERT INTO fin_data_settings (tenant_id, retention_days_students) VALUES ('${TENANT}', 30);
    INSERT INTO students (tenant_id, full_name, phone, status, updated_at) VALUES
      ('${TENANT}', 'Active Kid', '060000001', 'active', now() - interval '400 days'),
      ('${TENANT}', 'Archived Kid', '060000002', 'archived', now() - interval '400 days');
  `);
}

beforeAll(async () => {
  pg = new PGlite();
  testDb = drizzle(pg);
  await seed();
  const { finGdprRoutes } = await import("../routes/finGdpr");
  app = new Hono();
  app.route("/api/fin/gdpr", finGdprRoutes);
});

beforeEach(async () => {
  await seed();
});

afterAll(async () => {
  await pg?.close();
});

function req(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: { cookie: "vl_session=test", "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("SEC-05: GDPR RBAC (fin-owner only)", () => {
  it("T-SEC-05-1 [blocant] fin-viewer anonymize → 403", async () => {
    actingUser = VIEWER;
    const res = await req("/api/fin/gdpr/anonymize-old", { method: "POST", body: JSON.stringify({ confirm: true }) });
    expect(res.status).toBe(403);
  });

  it("T-SEC-05-2 [blocant] fin-viewer export → 403", async () => {
    actingUser = VIEWER;
    const res = await req("/api/fin/gdpr/export/00000000-0000-0000-0000-0000000000cc");
    expect(res.status).toBe(403);
  });
});

describe("SEC-05: anonymize destructive-scoping guards", () => {
  it("T-SEC-05-3 [blocant] owner anonymize WITHOUT confirm → 400", async () => {
    actingUser = OWNER;
    const res = await req("/api/fin/gdpr/anonymize-old", { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it("T-SEC-05-4 [blocant] owner anonymize with confirm only touches ARCHIVED students", async () => {
    actingUser = OWNER;
    const res = await req("/api/fin/gdpr/anonymize-old", { method: "POST", body: JSON.stringify({ confirm: true }) });
    expect(res.status).toBe(200);
    const { anonymized } = (await res.json()) as { anonymized: number };
    expect(anonymized).toBe(1); // only the archived student

    // The ACTIVE student must still have its PII.
    const rows = (await pg.query(`SELECT full_name, status FROM students ORDER BY status`)) as { rows: { full_name: string; status: string }[] };
    const active = rows.rows.find((r) => r.status === "active")!;
    const archived = rows.rows.find((r) => r.status === "archived")!;
    expect(active.full_name).toBe("Active Kid");
    expect(archived.full_name).toBe("[GDPR_REMOVED]");
  });

  it("T-SEC-05-5 [normal] a successful anonymize writes an audit row", async () => {
    actingUser = OWNER;
    await req("/api/fin/gdpr/anonymize-old", { method: "POST", body: JSON.stringify({ confirm: true }) });
    const audit = (await pg.query(`SELECT action_type FROM audit_log WHERE action_type = 'gdpr_anonymize_old'`)) as { rows: unknown[] };
    expect(audit.rows.length).toBe(1);
  });
});
