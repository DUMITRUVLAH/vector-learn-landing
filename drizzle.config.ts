import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { resolveDatabaseUrl } from "./server/db/env";

// Prefer the non-pooling URL for schema migrations (DDL + advisory locks).
const databaseUrl = resolveDatabaseUrl(true);

// When DATABASE_URL is set we target managed Postgres (Supabase); otherwise local PGlite.
export default defineConfig(
  databaseUrl
    ? {
        out: "./drizzle",
        schema: "./server/db/schema/index.ts",
        dialect: "postgresql",
        dbCredentials: { url: databaseUrl },
        verbose: true,
        strict: true,
      }
    : {
        out: "./drizzle",
        schema: "./server/db/schema/index.ts",
        dialect: "postgresql",
        driver: "pglite",
        dbCredentials: { url: process.env.DATABASE_PATH ?? "./.pglite" },
        verbose: true,
        strict: true,
      }
);
