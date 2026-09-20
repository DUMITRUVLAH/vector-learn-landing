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
import { and, eq, count } from "drizzle-orm";
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

// ─── CC-2: șabloane de pâlnie ───────────────────────────────────────────────

/**
 * Etapele SPANCO — metoda de vânzare B2B pe care o cer, pe nume, firmele cu echipă de agenți:
 * Suspect → Prospect → Analiză → Negociere → Concluzie → Comandă.
 *
 * De ce un șablon și nu „rescrie-ți etapele manual": pâlnia implicită e croită pe centre
 * educaționale („Trial/Demo", „Client"). O firmă care lucrează SPANCO trebuia să șteargă cinci
 * etape și să creeze șase, ghicind unde se pun flagurile `is_won`/`is_lost` — iar un flag pus
 * greșit face toate rapoartele să mintă în tăcere: „contracte semnate" numără tranzițiile către
 * etapa marcată câștigată, nu etapa care se NUMEȘTE așa.
 *
 * Probabilitățile cresc monoton: sunt punctul de plecare al prognozei, iar un Suspect nu are
 * aceeași șansă ca o Negociere. Se pot schimba oricând per etapă sau per oportunitate.
 */
export const SPANCO_STAGES: readonly DefaultStageSeed[] = [
  { key: "suspect", label: "Suspect", color: "sky", orderIndex: 0, isWon: false, isLost: false, probabilityPct: 5 },
  { key: "prospect", label: "Prospect", color: "sky", orderIndex: 1, isWon: false, isLost: false, probabilityPct: 15 },
  { key: "analiza", label: "Analiză", color: "lavender", orderIndex: 2, isWon: false, isLost: false, probabilityPct: 35 },
  { key: "negociere", label: "Negociere", color: "peach", orderIndex: 3, isWon: false, isLost: false, probabilityPct: 60 },
  { key: "concluzie", label: "Concluzie", color: "peach", orderIndex: 4, isWon: false, isLost: false, probabilityPct: 85 },
  { key: "comanda", label: "Comandă", color: "mint", orderIndex: 5, isWon: true, isLost: false, probabilityPct: 100 },
  { key: "pierdut", label: "Pierdut", color: "rose", orderIndex: 6, isWon: false, isLost: true, probabilityPct: 0 },
] as const;

/**
 * Etapele unei operațiuni de outreach telefonic: lista cumpărată stă în „Rezervă rece" până o
 * primește cineva, iar „Decident atins" e etapa care separă un apel de o discuție reală — fără
 * ea, un call-center nu poate spune câte apeluri costă un decident.
 */
export const CALL_CENTER_STAGES: readonly DefaultStageSeed[] = [
  { key: "rezerva", label: "Rezervă rece", color: "sky", orderIndex: 0, isWon: false, isLost: false, probabilityPct: 2 },
  { key: "repartizat", label: "Repartizat", color: "sky", orderIndex: 1, isWon: false, isLost: false, probabilityPct: 5 },
  { key: "in_lucru", label: "Apel în lucru", color: "lavender", orderIndex: 2, isWon: false, isLost: false, probabilityPct: 15 },
  { key: "decident", label: "Decident atins", color: "lavender", orderIndex: 3, isWon: false, isLost: false, probabilityPct: 30 },
  { key: "oferta", label: "Ofertă trimisă", color: "peach", orderIndex: 4, isWon: false, isLost: false, probabilityPct: 55 },
  { key: "negociere", label: "Negociere", color: "peach", orderIndex: 5, isWon: false, isLost: false, probabilityPct: 75 },
  { key: "contract", label: "Contract", color: "mint", orderIndex: 6, isWon: true, isLost: false, probabilityPct: 100 },
  { key: "pierdut", label: "Pierdut", color: "rose", orderIndex: 7, isWon: false, isLost: true, probabilityPct: 0 },
] as const;

export const PIPELINE_TEMPLATES = {
  default: { label: "Standard (Lead nou → Client)", stages: DEFAULT_STAGES },
  spanco: { label: "SPANCO (Suspect → Comandă)", stages: SPANCO_STAGES },
  call_center: { label: "Call-center B2B (Rezervă rece → Contract)", stages: CALL_CENTER_STAGES },
} as const;

export const PIPELINE_TEMPLATE_KEYS = ["default", "spanco", "call_center"] as const;
export type PipelineTemplateKey = (typeof PIPELINE_TEMPLATE_KEYS)[number];

export function isPipelineTemplateKey(value: string): value is PipelineTemplateKey {
  return (PIPELINE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** Etapele unui șablon; un nume necunoscut cade pe cele implicite, nu pe o pâlnie goală. */
export function stagesForTemplate(template?: string | null): readonly DefaultStageSeed[] {
  if (template && isPipelineTemplateKey(template)) return PIPELINE_TEMPLATES[template].stages;
  return DEFAULT_STAGES;
}

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
export async function ensureTenantStages(
  tenantId: string,
  pipelineId?: string | null,
  /** Șablonul de etape pentru o pâlnie NOUĂ. Lipsă → cele implicite, ca până acum. */
  template?: string | null
): Promise<void> {
  try {
    // Garda numără etapele PÂLNIEI, nu ale tenantului: o pâlnie nouă („B2B") trebuie să primească
    // etapele ei chiar dacă workspace-ul are deja etape în pâlnia implicită.
    const scope = pipelineId
      ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, pipelineId))
      : eq(crmPipelineStages.tenantId, tenantId);

    const [existing] = await db.select({ cnt: count() }).from(crmPipelineStages).where(scope);

    if ((existing?.cnt ?? 0) > 0) {
      return; // pâlnia are deja etape — nu re-semăna
    }

    const rows: NewCrmPipelineStage[] = stagesForTemplate(template).map((stage) => ({
      tenantId,
      pipelineId: pipelineId ?? null,
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
