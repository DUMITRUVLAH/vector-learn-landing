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
    name: "crm_pipeline_stages",
    run: () =>
      db.execute(
        sql`SELECT id, tenant_id, key, label, color, order_index, is_won, is_lost,
                   is_default, probability_pct, created_at, updated_at
            FROM crm_pipeline_stages LIMIT 0`
      ),
  },
  {
    name: "leads_stage_este_text",
    run: async () => {
      // Migrarea 0162 scoate `leads.stage` din enum. Dacă a rămas enum, etapele
      // personalizate nu se pot salva deloc — și ar pica abia la prima încercare.
      const r = await db.execute(
        sql`SELECT data_type FROM information_schema.columns
            WHERE table_name = 'leads' AND column_name = 'stage'`
      );
      const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as { data_type: string }[];
      const type = rows[0]?.data_type;
      if (type !== "character varying") {
        throw new Error(`leads.stage este încă ${type ?? "necunoscut"}, nu varchar`);
      }
    },
  },
  {
    name: "crm_products",
    run: () =>
      db.execute(
        sql`SELECT id, tenant_id, sku, name, category, description, unit,
                   list_price_cents, currency, vat_percent, is_active, order_index,
                   inventory_item_id, created_at, updated_at
            FROM crm_products LIMIT 0`
      ),
  },
  // Tabelele adăugate de Fazele 3-7. Fiecare e pe calea unei pagini sau a
  // salvării unui lead: dacă o migrare n-a ajuns pe un workspace, vreau să știu
  // de aici, nu de la owner care vede „internal_error" pe ecran.
  {
    // CRM-ul scade stocul la câștigarea unei oportunități prin inventarul FinDesk. Dacă acel
    // modul lipsește de pe un workspace, vreau să știu de aici: scăderea e best-effort și ar
    // trece tăcută, iar omul ar crede că stocul se mișcă.
    name: "crm_stock_link",
    run: () =>
      db.execute(
        sql`SELECT p.inventory_item_id, i.qty_on_hand, l.product_qty, l.stock_movement_id
            FROM crm_products p
            LEFT JOIN fin_inventory_items i ON i.id = p.inventory_item_id
            LEFT JOIN leads l ON false
            LIMIT 0`
      ),
  },
  { name: "crm_lead_tasks", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, title, due_at, status FROM crm_lead_tasks LIMIT 0`) },
  { name: "crm_companies", run: () => db.execute(sql`SELECT id, tenant_id, name, name_normalized, idno FROM crm_companies LIMIT 0`) },
  { name: "crm_import_jobs", run: () => db.execute(sql`SELECT id, tenant_id, file_name, created_count FROM crm_import_jobs LIMIT 0`) },
  { name: "crm_import_mappings", run: () => db.execute(sql`SELECT id, tenant_id, name, mapping FROM crm_import_mappings LIMIT 0`) },
  { name: "crm_automations", run: () => db.execute(sql`SELECT id, tenant_id, name, enabled, trigger, conditions, actions FROM crm_automations LIMIT 0`) },
  { name: "crm_automation_runs", run: () => db.execute(sql`SELECT id, tenant_id, automation_id, lead_id, status FROM crm_automation_runs LIMIT 0`) },
  { name: "crm_assignment_rules", run: () => db.execute(sql`SELECT id, tenant_id, name, strategy, conditions, user_ids FROM crm_assignment_rules LIMIT 0`) },
  { name: "crm_sales_settings", run: () => db.execute(sql`SELECT id, tenant_id, user_id, is_active, daily_capacity, weight FROM crm_sales_settings LIMIT 0`) },
  { name: "crm_assignment_log", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, user_id, reason FROM crm_assignment_log LIMIT 0`) },
  { name: "doc_documents_accepta_crm_lead", run: () => db.execute(sql`SELECT id, counterparty_kind, counterparty_id FROM doc_documents LIMIT 0`) },
  // Faza 9 (paritate cu crm-vector). Aceeași regulă: fiecare e pe calea unui ecran, iar migrările
  // 0166-0169 pot întârzia pe un workspace. Coloanele cerute sunt cele pe care codul chiar le
  // citește — o probă pe `SELECT 1` ar trece și cu o coloană lipsă.
  { name: "crm_pipelines", run: () => db.execute(sql`SELECT id, tenant_id, name, order_index, is_default FROM crm_pipelines LIMIT 0`) },
  { name: "crm_pipeline_stages_are_pipeline_id", run: () => db.execute(sql`SELECT id, pipeline_id FROM crm_pipeline_stages LIMIT 0`) },
  { name: "leads_are_pipeline_id", run: () => db.execute(sql`SELECT id, pipeline_id FROM leads LIMIT 0`) },
  { name: "crm_saved_views", run: () => db.execute(sql`SELECT id, tenant_id, name, filters, is_shared FROM crm_saved_views LIMIT 0`) },
  { name: "lead_contacts", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, full_name, is_primary FROM lead_contacts LIMIT 0`) },
  { name: "custom_fields", run: () => db.execute(sql`SELECT id, tenant_id, key, label, type, options FROM custom_fields LIMIT 0`) },
  { name: "lead_field_values", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, field_id, value FROM lead_field_values LIMIT 0`) },
  { name: "lead_attachments_are_storage_path", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, file_name, storage_path FROM lead_attachments LIMIT 0`) },
  { name: "crm_cadences", run: () => db.execute(sql`SELECT id, tenant_id, name, trigger_stage, enabled, steps FROM crm_cadences LIMIT 0`) },
  { name: "crm_cadence_enrollments", run: () => db.execute(sql`SELECT id, tenant_id, lead_id, cadence_id, status, current_step, next_fire_at FROM crm_cadence_enrollments LIMIT 0`) },
  { name: "crm_reengagement_rules", run: () => db.execute(sql`SELECT id, tenant_id, name, after_months, action, cadence_id FROM crm_reengagement_rules LIMIT 0`) },
  { name: "crm_reengagement_runs", run: () => db.execute(sql`SELECT id, tenant_id, rule_id, lead_id, result FROM crm_reengagement_runs LIMIT 0`) },
  // Captarea de pe site e chemată de vizitatorii site-ului CLIENTULUI: dacă migrarea n-a ajuns,
  // formularul lor dă 500, iar noi aflăm de la ei. Proba asta e singura care ne-o spune înainte.
  { name: "crm_capture_sources", run: () => db.execute(sql`SELECT id, tenant_id, name, token, default_source, active FROM crm_capture_sources LIMIT 0`) },
  { name: "leads_au_product_id", run: () => db.execute(sql`SELECT id, product_id, probability_pct FROM leads LIMIT 0`) },
  // Excepțiile de drepturi sunt citite la FIECARE verificare de permisiune: o tabelă lipsă ar
  // însemna „fără excepții" pe tot workspace-ul, în tăcere.
  { name: "crm_user_permissions", run: () => db.execute(sql`SELECT id, tenant_id, user_id, permission, granted FROM crm_user_permissions LIMIT 0`) },
  { name: "doc_documents_au_ciclu_de_viata", run: () => db.execute(sql`SELECT id, sent_at, outcome_at, outcome_reason FROM doc_documents LIMIT 0`) },
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
