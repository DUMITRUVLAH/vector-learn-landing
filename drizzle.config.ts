import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  out: "./drizzle",
  schema: "./server/db/schema/index.ts",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./.pglite",
  },
  verbose: true,
  strict: true,
});
