import "dotenv/config";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { db, closeDb } from "./client";
import { resolveDatabaseUrl } from "./env";

async function main() {
  console.log("⏳ Running migrations…");
  // Pick the migrator that matches the active driver (see client.ts).
  const migrate = (
    resolveDatabaseUrl() ? migratePostgres : migratePglite
  ) as (db: unknown, config: { migrationsFolder: string }) => Promise<void>;
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations applied.");
  await closeDb();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
