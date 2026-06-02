// Runs DB migrations during the Vercel build, BEFORE the new code goes live.
//
// Why this exists: Vercel auto-deploys CODE on every push to main, but it does NOT
// run database migrations on Supabase. So new code that expects a column/table
// (e.g. students.debt_cents, the invoices table) would reach the paying client
// BEFORE the schema existed → every query 500s. This step closes that gap: the
// schema is migrated as part of the deploy, so code and DB ship together.
//
// Safety:
//   - If no production DB URL is resolvable (e.g. a preview build with no DB env),
//     it SKIPS quietly instead of failing the build.
//   - drizzle's migrator is idempotent: already-applied migrations are no-ops.
//   - On a real migration error against a configured DB, it FAILS the build on
//     purpose — better to block a deploy than to ship code onto a stale schema.
import { execSync } from "node:child_process";

// Mirror server/db/env.ts resolution: explicit DATABASE_URL, else any *_POSTGRES_URL.
function hasDbUrl() {
  if (process.env.DATABASE_URL) return true;
  return Object.keys(process.env).some(
    (k) => k.endsWith("POSTGRES_URL") || k.endsWith("POSTGRES_URL_NON_POOLING")
  );
}

if (!hasDbUrl()) {
  console.log("[vercel-migrate] No production DB URL found — skipping migrations (preview/no-DB build).");
  process.exit(0);
}

console.log("[vercel-migrate] Applying database migrations before build…");
try {
  execSync("node_modules/.bin/tsx server/db/migrate.ts", { stdio: "inherit" });
  console.log("[vercel-migrate] Migrations OK — code and schema will ship together.");
} catch (err) {
  console.error("[vercel-migrate] Migration FAILED — blocking deploy to protect prod.", err?.message ?? err);
  process.exit(1);
}
