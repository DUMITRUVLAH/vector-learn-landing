import "dotenv/config";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import { resolveDatabaseUrl } from "./env";

/**
 * Dual-mode DB client:
 *  - If DATABASE_URL is set  → managed Postgres (Supabase). Production / Vercel-ready.
 *  - Otherwise               → embedded PGlite on disk (zero-config local dev).
 *
 * The exported `db` keeps one stable type so all routes type-check identically.
 * Use `closeDb()` in scripts instead of touching the underlying client.
 */
// On Vercel serverless → use the pooled (:6543) connection (many short-lived
// invocations need pgBouncer). Locally → prefer the direct (:5432) connection,
// which is also what migrations/DDL use.
const onVercel = !!process.env.VERCEL;
const databaseUrl = resolveDatabaseUrl(!onVercel);

function createConnection(): {
  db: PostgresJsDatabase<typeof schema>;
  closeDb: () => Promise<void>;
} {
  if (databaseUrl) {
    // `prepare: false` is required behind the Supabase transaction pooler (pgBouncer, port 6543).
    const client = postgres(databaseUrl, { prepare: false });
    return {
      db: drizzlePostgres(client, { schema }),
      closeDb: () => client.end(),
    };
  }

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
