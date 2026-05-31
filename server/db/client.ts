import "dotenv/config";
import path from "node:path";
import { createRequire } from "node:module";
import postgres from "postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import { resolveDatabaseUrl, isVercelRuntime } from "./env";

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
// `isVercelRuntime` is snapshotted in env.ts BEFORE `.env.local` loads, so a `vercel env pull`
// that wrote `VERCEL="1"` into `.env.local` does not make local dev think it is on Vercel.
const onVercel = isVercelRuntime;

// Local dev MUST use the embedded PGlite (DATABASE_PATH) and never the remote Supabase
// pooler. `vercel env pull` writes the Supabase POSTGRES_URL into `.env.local`, which would
// otherwise hijack local dev onto the pooler — where a stale-password/default-pool connection
// hangs every query and surfaces in the UI as `Unexpected token '<', "<!doctype "...`.
// Off Vercel + DATABASE_PATH set ⇒ force PGlite, ignoring any leaked remote URL.
const preferLocalPglite = !onVercel && !!process.env.DATABASE_PATH;
const databaseUrl = preferLocalPglite ? undefined : resolveDatabaseUrl(!onVercel);

function createConnection(): {
  db: PostgresJsDatabase<typeof schema>;
  closeDb: () => Promise<void>;
} {
  if (databaseUrl) {
    // Supabase transaction pooler (pgBouncer, :6543) over Vercel serverless needs BOTH:
    //   - `prepare: false`     → pgBouncer transaction mode has no named-prepared-statement support.
    //   - `fetch_types: false` → postgres.js otherwise runs a type-introspection query on connect;
    //     against the transaction pooler that query can hang indefinitely, so the first real query
    //     never returns and the function dies with FUNCTION_INVOCATION_TIMEOUT (30s). This was the
    //     prod login hang: the connection opened but findFirst() never resolved. Disabling the
    //     types fetch is the documented Supabase-pooler-on-serverless fix.
    // The single-connection + short-timeout options are SERVERLESS-ONLY — on the persistent
    // local/container server `max:1` serializes requests into a deadlock, so local keeps a
    // normal pool. SSL comes from the URL's own `sslmode=require`; passing ssl:"require" here too
    // double-negotiates and can stall the handshake, so it is left to the connection string.
    const client = postgres(
      databaseUrl,
      onVercel
        ? { prepare: false, fetch_types: false, max: 1, connect_timeout: 10, idle_timeout: 20 }
        : { prepare: false }
    );
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
