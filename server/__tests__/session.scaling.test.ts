/**
 * @vitest-environment node
 * PERF-13 / scaling — getSessionUser must NOT write lastActiveAt on every request.
 *
 * On the serverless max:1 pool, a write per authenticated request is the scarcest resource at
 * 500 concurrent users. This test drives the REAL getSessionUser against PGlite and asserts:
 *  - a fresh-enough session is NOT re-written (no write amplification),
 *  - a stale session (>15 min) IS refreshed,
 *  - session + user still resolve correctly (the join didn't break auth).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";

let pg: PGlite;
let testDb: ReturnType<typeof drizzle>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";

async function seedTables() {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY, name text);
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, email text NOT NULL,
      password_hash text, name text, role text NOT NULL DEFAULT 'admin',
      google_id text, auth_provider text NOT NULL DEFAULT 'password',
      branch_scope jsonb, is_active boolean NOT NULL DEFAULT true,
      phone text, avatar_url text, language text NOT NULL DEFAULT 'ro', timezone text,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL, token varchar(128) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL, ip_address varchar(64), user_agent varchar(512),
      last_active_at timestamptz, two_factor_pending boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pg.exec(`DELETE FROM sessions; DELETE FROM users; DELETE FROM tenants;`);
  await pg.exec(`
    INSERT INTO tenants (id, name) VALUES ('${TENANT_ID}', 'T');
    INSERT INTO users (id, tenant_id, email, role) VALUES ('${USER_ID}', '${TENANT_ID}', 'u@test.io', 'admin');
  `);
}

async function insertSession(token: string, lastActiveAgoMs: number) {
  const future = "now() + interval '30 days'";
  const lastActive = `now() - (${Math.round(lastActiveAgoMs / 1000)} * interval '1 second')`;
  await pg.exec(`
    INSERT INTO sessions (user_id, token, expires_at, last_active_at)
    VALUES ('${USER_ID}', '${token}', ${future}, ${lastActive});
  `);
}

async function lastActiveOf(token: string): Promise<number> {
  const r = (await pg.query(`SELECT last_active_at FROM sessions WHERE token = $1`, [token])) as {
    rows: { last_active_at: string }[];
  };
  return new Date(r.rows[0].last_active_at).getTime();
}

beforeAll(async () => {
  pg = new PGlite();
  testDb = drizzle(pg);
  await seedTables();
});

beforeEach(async () => {
  await pg.exec(`DELETE FROM sessions;`);
});

afterAll(async () => {
  await pg?.close();
});

describe("PERF-13: getSessionUser write throttling", () => {
  it("T-PERF-13-1 [blocant] resolves session + user via single join", async () => {
    const { getSessionUser } = await import("../auth/session");
    await insertSession("tok-fresh", 60_000); // 1 min ago
    const res = await getSessionUser("tok-fresh");
    expect(res).not.toBeNull();
    expect(res!.user.id).toBe(USER_ID);
    expect(res!.session.token).toBe("tok-fresh");
  });

  it("T-PERF-13-2 [blocant] does NOT rewrite lastActiveAt for a fresh session", async () => {
    const { getSessionUser } = await import("../auth/session");
    await insertSession("tok-fresh2", 60_000); // 1 min ago — within the 15-min throttle
    const before = await lastActiveOf("tok-fresh2");
    await getSessionUser("tok-fresh2");
    // allow the fire-and-forget (none expected) to settle
    await new Promise((r) => setTimeout(r, 50));
    const after = await lastActiveOf("tok-fresh2");
    expect(after).toBe(before); // unchanged — no write amplification
  });

  it("T-PERF-13-3 [normal] DOES refresh lastActiveAt for a stale session (>15 min)", async () => {
    const { getSessionUser } = await import("../auth/session");
    await insertSession("tok-stale", 30 * 60_000); // 30 min ago — stale
    const before = await lastActiveOf("tok-stale");
    await getSessionUser("tok-stale");
    await new Promise((r) => setTimeout(r, 80)); // let the fire-and-forget write land
    const after = await lastActiveOf("tok-stale");
    expect(after).toBeGreaterThan(before);
  });
});
