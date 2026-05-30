import "dotenv/config";
import path from "node:path";
import { createRequire } from "node:module";
import postgres from "postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import { resolveDatabaseUrl } from "./env";

/**
 * Dual-mode DB client:
 *  - If a Postgres URL is set → managed Postgres (Supabase). Production / Vercel-ready.
 *  - Otherwise                → embedded PGlite on disk (zero-config local dev).
 *
 * PGlite (WASM) is loaded LAZILY (require, only in the local branch) so it is never
 * evaluated in Vercel's serverless runtime — importing it there crashes the function
 * (FUNCTION_INVOCATION_FAILED). The exported `db` keeps one stable type so all routes
 * type-check identically. Use `closeDb()` in scripts instead of touching the client.
 */
// On Vercel serverless → pooled (:6543) connection (pgBouncer). Locally → direct (:5432),
// which is also what migrations/DDL use.
const onVercel = !!process.env.VERCEL;
const databaseUrl = resolveDatabaseUrl(!onVercel);

function createConnection(): {
  db: PostgresJsDatabase<typeof schema>;
  closeDb: () => Promise<void>;
} {
  if (databaseUrl) {
    // Supabase transaction pooler (pgBouncer :6543): no prepared statements, explicit SSL,
    // 1 connection per serverless invocation, and short timeouts so a bad connection FAILS
    // fast (visible error) instead of hanging the function into a 504.
    const client = postgres(databaseUrl, {
      prepare: false,
      ssl: "require",
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    return {
      db: drizzlePostgres(client, { schema }),
      closeDb: () => client.end(),
    };
  }

  // Local-only fallback. Lazy require keeps PGlite out of the serverless code path.
  const req = createRequire(import.meta.url);
  const { PGlite } = req("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = req("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");

  const dbPath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), ".pglite");
  const pglite = new PGlite(dbPath);
  // PGlite's drizzle instance is API-compatible with the postgres-js one for our queries.
  const db = drizzlePglite({ client: pglite, schema }) as unknown as PostgresJsDatabase<typeof schema>;
  return {
    db,
    closeDb: async () => {
      await pglite.close();
    },
  };
}

const connection = createConnection();

export const db = connection.db;
export const closeDb = connection.closeDb;
export type DB = typeof db;
