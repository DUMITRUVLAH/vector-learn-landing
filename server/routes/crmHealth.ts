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
import { sql } from "drizzle-orm";
import { db } from "../db/client";

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
  const ok = Object.values(tables).every((t) => t.ok);
  return c.json({ ok, tables }, ok ? 200 : 503);
});
