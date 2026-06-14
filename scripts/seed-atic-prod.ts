/**
 * One-off: create ONLY the "ATIC — Digital Safeguard" PAR tenant in the PROD
 * (Supabase) database. Mirrors the idempotent ATIC block in server/db/seed.ts —
 * it does NOT create any other demo tenant/data. Safe to re-run (skips if the
 * tenant slug already exists).
 *
 * Connects directly with `{ prepare: false }` (pgBouncer-safe) using DATABASE_URL
 * read explicitly from a prod env file, so it never touches local PGlite.
 *
 * Run:  PROD_ENV_FILE=.env.prod.fresh npx tsx scripts/seed-atic-prod.ts
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../server/db/schema/index";
import { hashPassword } from "../server/auth/password";

const {
  tenants, users, parMembers, parSettings,
  parDepartments, parProjects, parBudgetCodes, parDoaMatrix,
} = schema;

const PAR_SLUG = "demo-atic-ngo";
const DEMO_PASSWORD = "demo123456";

function readDatabaseUrl(): string {
  const file = process.env.PROD_ENV_FILE || ".env.prod.fresh";
  const raw = readFileSync(file, "utf8");
  // Parse "KEY=value" lines into a map (values may be quoted).
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const isPg = (v?: string) => !!v && /^postgres(ql)?:\/\//.test(v);
  // Resolution mirrors server/db/env.ts resolveDatabaseUrl, but prefers the DIRECT
  // (non-pooling, :5432) URL — best for a one-off write from a laptop (no pgBouncer
  // prepared-statement limits). The Vercel↔Supabase integration prefixes vars by
  // store name (e.g. learningvectortop_POSTGRES_URL_NON_POOLING).
  const bySuffix = (suffix: string) =>
    env[suffix] && isPg(env[suffix])
      ? env[suffix]
      : Object.keys(env).find((k) => k.endsWith(suffix) && isPg(env[k]))
        ? env[Object.keys(env).find((k) => k.endsWith(suffix) && isPg(env[k]))!]
        : undefined;
  const url =
    (isPg(env.DATABASE_URL) ? env.DATABASE_URL : undefined) ??
    bySuffix("POSTGRES_URL_NON_POOLING") ??
    bySuffix("POSTGRES_URL");
  if (!isPg(url)) {
    throw new Error(`No valid postgres URL found in ${file} (looked at DATABASE_URL / *_POSTGRES_URL_NON_POOLING / *_POSTGRES_URL)`);
  }
  return url!;
}

async function main() {
  const url = readDatabaseUrl();
  const host = (() => { try { return new URL(url).host; } catch { return "?"; } })();
  console.log(`→ Connecting to PROD DB host: ${host}`);
  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    // Guard: PAR tables must exist (deploy migrations 0113/0114 applied).
    const present = await client`
      SELECT to_regclass('public.par_requests') IS NOT NULL AS ok
    `;
    if (!present?.[0]?.ok) {
      console.error("✗ PAR tables not found on prod yet — the Vercel deploy/migration hasn't applied (0113/0114). Wait for the deploy to finish, then re-run.");
      process.exitCode = 2;
      return;
    }

    const existing = await db.query.tenants.findFirst({ where: eq(tenants.slug, PAR_SLUG) });
    if (existing) {
      console.log(`⚠️  ATIC tenant already exists on prod (${existing.id}). Nothing to do (idempotent).`);
      return;
    }

    const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

    const [parTenant] = await db.insert(tenants)
      .values({ name: "ATIC — Digital Safeguard", slug: PAR_SLUG, plan: "growth" })
      .returning();

    const [parAdmin, parApprover, parFinance, parRequestor] = await db.insert(users)
      .values([
        { tenantId: parTenant.id, email: "admin@atic.demo.io",     passwordHash: demoPasswordHash, name: "Irina Oriol",   role: "admin" },
        { tenantId: parTenant.id, email: "approver@atic.demo.io",  passwordHash: demoPasswordHash, name: "Ana Chirita",   role: "teacher" },
        { tenantId: parTenant.id, email: "finance@atic.demo.io",   passwordHash: demoPasswordHash, name: "Mihai Botnaru", role: "teacher" },
        { tenantId: parTenant.id, email: "requestor@atic.demo.io", passwordHash: demoPasswordHash, name: "Sirbu Cristina",role: "teacher" },
      ])
      .returning();

    await db.insert(parMembers).values([
      { tenantId: parTenant.id, userId: parAdmin.id,     role: "par_admin" },
      { tenantId: parTenant.id, userId: parApprover.id,  role: "approver", approvalLimitCents: 10000000 },
      { tenantId: parTenant.id, userId: parFinance.id,   role: "finance" },
      { tenantId: parTenant.id, userId: parRequestor.id, role: "requestor" },
    ]);

    await db.insert(parSettings).values({
      tenantId: parTenant.id,
      microPurchaseThresholdCents: 500000, // 5,000 MDL
      defaultCurrency: "MDL",
      orgLegalName: "Asociația pentru Tehnologie și Internet din Moldova",
      requestNoPrefix: "PAR",
    });

    await db.insert(parDepartments).values([
      { tenantId: parTenant.id, name: "ATIC" },
      { tenantId: parTenant.id, name: "Finance" },
      { tenantId: parTenant.id, name: "Procurement" },
    ]);

    await db.insert(parProjects).values([
      { tenantId: parTenant.id, name: "Digital Safeguard", donor: "USAID" },
      { tenantId: parTenant.id, name: "CyberSkills Moldova", donor: "EU Delegation" },
    ]);

    await db.insert(parBudgetCodes).values([
      { tenantId: parTenant.id, code: "M13", name: "Procurement — Monthly budget" },
      { tenantId: parTenant.id, code: "DS-2026-OPS", name: "Digital Safeguard Operations 2026" },
      { tenantId: parTenant.id, code: "DS-2026-PROG", name: "Digital Safeguard Program 2026" },
    ]);

    await db.insert(parDoaMatrix).values([
      { tenantId: parTenant.id, minAmountCents: 0,        maxAmountCents: 500000,   step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      { tenantId: parTenant.id, minAmountCents: 500001,   maxAmountCents: 10000000, step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      { tenantId: parTenant.id, minAmountCents: 500001,   maxAmountCents: 10000000, step: 2, approverRoleLabel: "Executive Director", approverUserId: parAdmin.id },
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null,     step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null,     step: 2, approverRoleLabel: "Finance / Program Director", approverUserId: parFinance.id },
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null,     step: 3, approverRoleLabel: "Executive Director", approverUserId: parAdmin.id },
    ]);

    console.log("✅ ATIC — Digital Safeguard tenant created on PROD");
    console.log(`   tenant id: ${parTenant.id}  slug: ${PAR_SLUG}`);
    console.log(`   admin:     admin@atic.demo.io      (Irina Oriol, par_admin / Executive Director)`);
    console.log(`   approver:  approver@atic.demo.io   (Ana Chirita)`);
    console.log(`   finance:   finance@atic.demo.io    (Mihai Botnaru)`);
    console.log(`   requestor: requestor@atic.demo.io  (Sirbu Cristina)`);
    console.log(`   password (all): ${DEMO_PASSWORD}`);
    console.log(`   micro-purchase threshold: 5,000 MDL · DOA matrix: 6 rules`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("✗ Failed:", e?.message ?? e); process.exitCode = 1; });
