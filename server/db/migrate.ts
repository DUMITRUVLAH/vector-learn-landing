import "dotenv/config";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, pglite } from "./client.js";

async function main() {
  console.log("⏳ Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations applied.");
  await pglite.close();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
