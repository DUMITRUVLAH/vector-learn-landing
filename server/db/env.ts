import dotenv from "dotenv";

// Load `.env.local` (where `vercel env pull` writes) additively on top of `.env`.
// `override: false` means it only fills vars not already set — never clobbers .env.
dotenv.config({ path: ".env.local", override: false });

/**
 * Resolve a Postgres connection string from any standard env var name.
 *
 * Supports the Vercel ↔ Supabase integration out of the box, so you never have to
 * copy a connection string by hand — whatever the integration injects just works:
 *   - DATABASE_URL              (our own / generic)
 *   - POSTGRES_URL              (Vercel/Supabase pooled, transaction pooler :6543)
 *   - POSTGRES_URL_NON_POOLING  (Vercel/Supabase direct, best for migrations/DDL)
 *
 * If none are set, the caller falls back to embedded PGlite (local zero-config dev).
 *
 * @param preferDirect  migrations prefer the non-pooling URL (DDL + advisory locks)
 */
/** First env var whose name ends with `suffix` and has a value.
 *  Handles the Vercel↔Supabase integration which prefixes vars by store name,
 *  e.g. `learningvectortop_POSTGRES_URL_NON_POOLING`. */
function bySuffix(suffix: string): string | undefined {
  const exact = process.env[suffix];
  if (exact) return exact;
  const key = Object.keys(process.env).find(
    (k) => k.endsWith(suffix) && process.env[k]
  );
  return key ? process.env[key] : undefined;
}

export function resolveDatabaseUrl(preferDirect = false): string | undefined {
  // An explicit DATABASE_URL always wins — clean override when the integration's
  // managed credentials drift (e.g. after a Supabase password reset).
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const pooled = bySuffix("POSTGRES_URL");
  const direct = bySuffix("POSTGRES_URL_NON_POOLING");

  return preferDirect ? (direct ?? pooled) : (pooled ?? direct);
}
