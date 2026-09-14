/**
 * CRM — garanția că orice tenant are cel puțin cele 5 etape implicite de pâlnie.
 *
 * Migrarea 0162 (drizzle/0162_crm_pipeline_stages.sql) a semănat aceste etape DOAR pentru
 * tenanții care existau la momentul ei. Un workspace creat ULTERIOR — sau unul pe care migrarea
 * a întârziat să-l atingă (prod nu aplică migrările fiabil, vezi server/db/sync-schema.ts) — ar
 * avea zero etape și, deci, un pipeline complet gol, fără nicio coloană de arătat.
 * `ensureTenantStages` închide gaura asta LA CERERE, nu doar la migrare.
 *
 * Model: server/lib/finLedgerSeed.ts (`seedLedgerAccounts`) — gardă de numărare +
 * `onConflictDoNothing()`, idempotent, best-effort. „Best-effort" înseamnă literal: dacă seed-ul
 * eșuează (schemă în urma codului, conexiune picată etc.), funcția NU aruncă mai departe în
 * cererea care a chemat-o — apelanții (GET /api/crm/stages, GET /api/crm/leads/pipeline) oricum
 * degradează la o listă/pâlnie goală, nu la un 500.
 */
import { eq, count } from "drizzle-orm";
import { db } from "../../db/client";
import { crmPipelineStages, type NewCrmPipelineStage } from "../../db/schema/crmPipelineStages";

export type DefaultStageSeed = Pick<
  NewCrmPipelineStage,
  "key" | "label" | "color" | "orderIndex" | "isWon" | "isLost" | "probabilityPct"
>;

/**
 * Cele 5 etape implicite — aceleași chei/ordine/flaguri/probabilități pe care migrarea 0162
 * le-a semănat pentru tenanții existenți la acel moment. Exportate (nu doar folosite intern) ca
 * fallback pentru `/api/crm/leads/pipeline` în cazul degradat în care tabela de etape însăși nu
 * poate fi citită — vezi server/routes/crmLeads.ts.
 */
export const DEFAULT_STAGES: readonly DefaultStageSeed[] = [
  { key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, probabilityPct: 10 },
  {
    key: "contacted",
    label: "Contactat",
    color: "lavender",
    orderIndex: 1,
    isWon: false,
    isLost: false,
    probabilityPct: 25,
  },
  {
    key: "trial",
    label: "Trial/Demo",
    color: "peach",
    orderIndex: 2,
    isWon: false,
    isLost: false,
    probabilityPct: 50,
  },
  { key: "paid", label: "Client", color: "mint", orderIndex: 3, isWon: true, isLost: false, probabilityPct: 100 },
  { key: "lost", label: "Pierdut", color: "rose", orderIndex: 4, isWon: false, isLost: true, probabilityPct: 0 },
] as const;

/**
 * Idempotent: dacă tenantul are deja ORICE etapă (implicită sau nu), nu face nimic. Altfel
 * inserează cele 5 implicite, marcate `isDefault: true` — interfața nu lasă o etapă implicită să
 * fie ștearsă (vezi DELETE /api/crm/stages/:id), ca un workspace să nu-și poată goli pâlnia din
 * greșeală până la zero coloane.
 *
 * Never throws: orice eroare (inclusiv „tabela nu există încă") se loghează și se înghite —
 * apelantul (o rută GET) trebuie să răspundă cu o listă goală, nu cu un 500 cauzat de un
 * best-effort seed care ar fi putut oricum să nu fie necesar.
 */
export async function ensureTenantStages(tenantId: string): Promise<void> {
  try {
    const [existing] = await db
      .select({ cnt: count() })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId));

    if ((existing?.cnt ?? 0) > 0) {
      return; // tenantul are deja etape — nu re-semăna
    }

    const rows: NewCrmPipelineStage[] = DEFAULT_STAGES.map((stage) => ({
      tenantId,
      ...stage,
      isDefault: true,
    }));

    // onConflictDoNothing: dacă altă cerere concurentă a semănat între timp (gardă de mai sus →
    // insert nu e atomic per-tenant), indexul unic (tenant_id,key) absoarbe coliziunea în tăcere.
    await db.insert(crmPipelineStages).values(rows).onConflictDoNothing();
  } catch (e) {
    console.error(
      "[crm/stages] ensureTenantStages eșec pentru tenant",
      tenantId,
      ":",
      e instanceof Error ? e.message : e
    );
  }
}
