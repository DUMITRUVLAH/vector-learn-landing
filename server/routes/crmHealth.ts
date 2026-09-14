/**
 * CRM — diagnostic de schemă, fără autentificare și FĂRĂ date de tenant.
 *
 * De ce există: pe producție, când o interogare pică, clientul vede doar
 * `internal_error` (răspunsul generic din `app.onError`), iar mesajul real
 * ajunge în Consola Platformă — la care ai nevoie de cont ca să ajungi. Asta a
 * transformat un bug de cinci minute într-o serie de ghiceli.
 *
 * Ruta asta răspunde la o singură întrebare: tabelele de care depinde modulul
 * CRM sunt acolo și se pot interoga? Întoarce DOAR clasa problemei
 * (`missing_table` / `missing_column` / `other`), niciodată mesajul brut al
 * bazei și niciun rând de date — deci nu expune nimic despre clienți.
 *
 * Montată la /api/crm/health.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads } from "../db/schema/leads";
import { tenants } from "../db/schema/tenants";

export const crmHealthRoutes = new Hono();

/** Clasifică eroarea fără să întoarcă textul ei. */
function classify(e: unknown): "missing_table" | "missing_column" | "other" {
  const msg = e instanceof Error ? e.message : String(e);
  if (/relation .* does not exist|undefined_table/i.test(msg)) return "missing_table";
  if (/column .* does not exist|undefined_column/i.test(msg)) return "missing_column";
  return "other";
}

/**
 * Interoghează fiecare tabelă exact cu coloanele pe care le cere modulul, cu
 * `LIMIT 0` — verificăm că schema răspunde, fără să citim niciun rând.
 */
const PROBES: { name: string; run: () => Promise<unknown> }[] = [
  {
    name: "leads",
    run: () =>
      db.execute(
        sql`SELECT id, tenant_id, full_name, deal_name, phone, email, company,
                   interest_course, source, stage, value_cents, assigned_to,
                   lost_reason, created_at, updated_at
            FROM leads LIMIT 0`
      ),
  },
  {
    name: "lead_interactions",
    run: () =>
      db.execute(
        sql`SELECT id, tenant_id, lead_id, type, direction, body, metadata, user_id, occurred_at
            FROM lead_interactions LIMIT 0`
      ),
  },
  {
    name: "crm_products",
    run: () =>
      db.execute(
        sql`SELECT id, tenant_id, sku, name, category, description, unit,
                   list_price_cents, currency, vat_percent, is_active, order_index,
                   created_at, updated_at
            FROM crm_products LIMIT 0`
      ),
  },
];

/**
 * Tenant inexistent: interogările de mai jos rulează pe calea REALĂ de cod, dar
 * nu pot întoarce niciun rând al vreunui client.
 */
const NIL_TENANT = "00000000-0000-0000-0000-000000000000";

/** Exact coloanele cerute de ruta /pipeline. */
const LEAD_PROBE_COLS = {
  id: leads.id,
  fullName: leads.fullName,
  dealName: leads.dealName,
  phone: leads.phone,
  email: leads.email,
  company: leads.company,
  interestCourse: leads.interestCourse,
  source: leads.source,
  stage: leads.stage,
  valueCents: leads.valueCents,
  assignedTo: leads.assignedTo,
  lostReason: leads.lostReason,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
} as const;

/**
 * Probele de mai sus verifică schema prin SQL brut. Asta e diferit: rulează
 * EXACT interogările drizzle din `/pipeline`, fiindcă un SELECT brut poate trece
 * în timp ce constructorul de interogări pică (tipuri de enum, coloane generate,
 * un import de schemă lipsă). Aici întoarcem și mesajul, pentru că interogarea
 * nu atinge datele niciunui client — e singura cale de a diagnostica producția
 * fără cont. De scos după ce bug-ul e închis.
 */
async function probePipelineQuery(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        dealName: leads.dealName,
        phone: leads.phone,
        email: leads.email,
        company: leads.company,
        interestCourse: leads.interestCourse,
        source: leads.source,
        stage: leads.stage,
        valueCents: leads.valueCents,
        assignedTo: leads.assignedTo,
        lostReason: leads.lostReason,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .where(and(eq(leads.tenantId, NIL_TENANT), eq(leads.stage, "new")))
      .orderBy(desc(leads.createdAt))
      .limit(1);

    await db
      .select({
        stage: leads.stage,
        cnt: sql<number>`count(*)::int`,
        // `sum()` peste `integer` întoarce BIGINT. Turnat în `::int`, orice pâlnie
        // care trece de ~21 mil. în valoare totală arunca „integer out of range"
        // și dobora toată pagina — exact bug-ul de pe producție. Păstrăm bigint
        // (postgres-js îl dă ca string) și convertim în JS, unde întregii sunt
        // exacți până la 2^53, cu mult peste orice sumă în bani.
        sumValue: sql<string>`coalesce(sum(${leads.valueCents}), 0)::bigint`,
      })
      .from(leads)
      .where(eq(leads.tenantId, NIL_TENANT))
      .groupBy(leads.stage);

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[crm/health] interogarea de pipeline:", msg);
    return { ok: false, error: msg.slice(0, 300) };
  }
}

/**
 * Proba pe tenant NUL trece, dar producția pică — singura diferență rămasă e că
 * acolo există rânduri. Rulăm interogările reale pentru fiecare workspace și
 * raportăm DOAR câte lead-uri are și, dacă pică, mesajul erorii. Niciun câmp al
 * vreunui lead nu părăsește serverul.
 */
async function probeEachTenant(): Promise<
  { id: string; leads: number; ok: boolean; error?: string }[]
> {
  const out: { id: string; leads: number; ok: boolean; error?: string }[] = [];
  const rows = await db.select({ id: tenants.id }).from(tenants).limit(25);
  for (const t of rows) {
    try {
      const cards = await db
        .select(LEAD_PROBE_COLS)
        .from(leads)
        .where(eq(leads.tenantId, t.id))
        .orderBy(desc(leads.createdAt))
        .limit(500);
      const agg = await db
        .select({
          stage: leads.stage,
          cnt: sql<number>`count(*)::int`,
          // `sum()` peste `integer` întoarce BIGINT. Turnat în `::int`, orice pâlnie
        // care trece de ~21 mil. în valoare totală arunca „integer out of range"
        // și dobora toată pagina — exact bug-ul de pe producție. Păstrăm bigint
        // (postgres-js îl dă ca string) și convertim în JS, unde întregii sunt
        // exacți până la 2^53, cu mult peste orice sumă în bani.
        sumValue: sql<string>`coalesce(sum(${leads.valueCents}), 0)::bigint`,
        })
        .from(leads)
        .where(eq(leads.tenantId, t.id))
        .groupBy(leads.stage);
      // Serializarea e parte din calea reală de cod — dacă un rând nu poate fi
      // transformat în JSON, aici se vede, nu în producție.
      JSON.stringify({ cards, agg });
      out.push({ id: t.id.slice(0, 8), leads: cards.length, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[crm/health] tenant ${t.id}:`, msg);
      out.push({ id: t.id.slice(0, 8), leads: -1, ok: false, error: msg.slice(0, 300) });
    }
  }
  return out;
}

crmHealthRoutes.get("/", async (c) => {
  const tables: Record<string, { ok: boolean; problem?: string }> = {};
  for (const probe of PROBES) {
    try {
      await probe.run();
      tables[probe.name] = { ok: true };
    } catch (e) {
      tables[probe.name] = { ok: false, problem: classify(e) };
      // Mesajul complet merge DOAR în logul serverului, nu în răspuns.
      console.error(`[crm/health] ${probe.name}:`, e instanceof Error ? e.message : e);
    }
  }
  // Ce commit rulează efectiv. Fără asta nu pot distinge „fixul nu merge" de
  // „fixul nu e încă deployat" — și am pierdut deja runde pe confuzia asta.
  const build = {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 8),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };

  const pipelineQuery = await probePipelineQuery();
  const perTenant = await probeEachTenant();
  const ok = Object.values(tables).every((t) => t.ok) && pipelineQuery.ok;
  return c.json({ ok, build, tables, pipelineQuery, perTenant }, ok ? 200 : 503);
});
