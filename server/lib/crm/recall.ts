/**
 * CRM — întoarcerea în rezervă a lead-urilor repartizate și NEATINSE.
 *
 * Problema, din operațiunea reală: un agent primește 200 de contacte, sună 40 și trece mai
 * departe. Celelalte 160 rămân blocate pe numele lui — nu le mai sună nimeni, dar nici nu se pot
 * da altcuiva, fiindcă nimeni nu știe că zac acolo. Cadențele și reactivarea existau doar pentru
 * lead-uri CONTACTATE; pentru cele repartizate și neatinse nu exista nimic.
 *
 * Regula, spusă în cuvintele managerului: *dacă un contact stă la cineva de N zile și nu s-a
 * întâmplat NIMIC pe el, se întoarce în rezervă.*
 *
 * Ce înseamnă „nu s-a întâmplat nimic": nicio interacțiune de lucru (apel, email, WhatsApp, SMS,
 * întâlnire, notiță) DUPĂ momentul repartizării. Liniile de sistem (inclusiv cea scrisă chiar de
 * repartizare) nu contează — altfel niciun lead n-ar fi vreodată „neatins", fiindcă repartizarea
 * însăși i-ar fi lăsat o urmă.
 *
 * Trei lucruri pe care regula NU le face, deliberat:
 *  - **nu atinge afacerile închise** (câștigate sau pierdute): acolo responsabilul e o
 *    informație istorică, nu o sarcină;
 *  - **nu atinge lead-urile fără `assigned_at`** (cele de dinainte de migrarea 0182): nu știm de
 *    când stau, iar o presupunere le-ar smulge pe toate odată, la prima rulare a cronului;
 *  - **nu schimbă etapa.** Contactul se întoarce în rezervă ca responsabil, atât. Mutarea lui
 *    într-o etapă „rece" ar falsifica pâlnia: n-a regresat comercial, doar și-a pierdut omul.
 */
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions } from "../../db/schema/leads";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { crmRecallSettings } from "../../db/schema/crmRecall";

/** Tipurile de interacțiune care ÎNSEAMNĂ că cineva a lucrat leadul. */
export const TOUCH_TYPES = ["call", "email", "whatsapp", "sms", "meeting", "note"] as const;

export interface RecallLeadInput {
  id: string;
  assignedTo: string | null;
  assignedAt: string | null;
  stage: string;
}

export interface RecallTouch {
  leadId: string;
  occurredAt: string;
}

/**
 * Care lead-uri se întorc în rezervă. Funcție PURĂ — testabilă fără bază de date, și singurul loc
 * în care trăiește regula.
 */
export function dueForRecall(
  leadRows: RecallLeadInput[],
  touches: RecallTouch[],
  days: number,
  closedStageKeys: ReadonlySet<string>,
  now: Date = new Date()
): string[] {
  if (days <= 0) return [];
  const cutoff = now.getTime() - days * 86_400_000;

  /** Ultima atingere de lucru per lead. */
  const lastTouch = new Map<string, number>();
  for (const touch of touches) {
    const at = new Date(touch.occurredAt).getTime();
    if (!Number.isFinite(at)) continue;
    lastTouch.set(touch.leadId, Math.max(lastTouch.get(touch.leadId) ?? 0, at));
  }

  const out: string[] = [];
  for (const lead of leadRows) {
    if (!lead.assignedTo) continue;
    if (!lead.assignedAt) continue; // nu știm de când stă → nu-l luăm
    if (closedStageKeys.has(lead.stage)) continue;

    const assignedAt = new Date(lead.assignedAt).getTime();
    if (!Number.isFinite(assignedAt) || assignedAt > cutoff) continue;

    // O atingere DE DUPĂ repartizare înseamnă că omul a lucrat leadul.
    const touched = lastTouch.get(lead.id);
    if (touched !== undefined && touched >= assignedAt) continue;

    out.push(lead.id);
  }
  return out;
}

export interface RecallSettings {
  enabled: boolean;
  days: number;
}

/** Setările workspace-ului; lipsa rândului înseamnă „oprit", nu o valoare implicită activă. */
export async function getRecallSettings(tenantId: string): Promise<RecallSettings> {
  try {
    const [row] = await db.select().from(crmRecallSettings).where(eq(crmRecallSettings.tenantId, tenantId));
    return { enabled: row?.enabled ?? false, days: row?.days ?? 14 };
  } catch (e) {
    console.error("[crm/recall] setările nu s-au putut citi:", e instanceof Error ? e.message : e);
    return { enabled: false, days: 14 };
  }
}

export interface RecallResult {
  due: number;
  recalled: number;
}

/**
 * Rulează regula pentru un workspace. Se cheamă din cronul zilnic (07:00) și din butonul de
 * previzualizare al ecranului de repartizare (cu `dryRun`).
 */
export async function runRecall(
  tenantId: string,
  options: { dryRun?: boolean; now?: Date; force?: boolean } = {}
): Promise<RecallResult> {
  const now = options.now ?? new Date();
  const settings = await getRecallSettings(tenantId);
  // `force` e doar pentru PREVIZUALIZARE: managerul trebuie să vadă câte contacte ar pleca
  // ÎNAINTE de a porni regula. Fără el, ecranul ar arăta „0" până la aprindere — adică exact
  // numărul care l-ar face să creadă că regula nu face nimic.
  if (!settings.enabled && !options.force) return { due: 0, recalled: 0 };
  if (!settings.enabled && !options.dryRun) return { due: 0, recalled: 0 };

  const closedRows = await db
    .select({ key: crmPipelineStages.key })
    .from(crmPipelineStages)
    .where(
      and(
        eq(crmPipelineStages.tenantId, tenantId),
        sql`(${crmPipelineStages.isWon} = true OR ${crmPipelineStages.isLost} = true)`
      )
    );
  const closed = new Set(closedRows.map((s) => s.key));

  const candidates = await db
    .select({
      id: leads.id,
      assignedTo: leads.assignedTo,
      assignedAt: leads.assignedAt,
      stage: leads.stage,
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        isNull(leads.mergedIntoId),
        isNotNull(leads.assignedTo),
        isNotNull(leads.assignedAt),
        // Pre-filtrare în bază: fără ea am aduce toată baza în memorie ca să ținem 2%.
        lt(leads.assignedAt, new Date(now.getTime() - settings.days * 86_400_000))
      )
    )
    .limit(5000);

  if (candidates.length === 0) return { due: 0, recalled: 0 };

  const touches = await db
    .select({ leadId: leadInteractions.leadId, occurredAt: leadInteractions.occurredAt })
    .from(leadInteractions)
    .where(
      and(
        eq(leadInteractions.tenantId, tenantId),
        inArray(
          leadInteractions.leadId,
          candidates.map((c) => c.id)
        ),
        inArray(leadInteractions.type, [...TOUCH_TYPES])
      )
    );

  const dueIds = dueForRecall(
    candidates.map((c) => ({
      id: c.id,
      assignedTo: c.assignedTo,
      assignedAt: c.assignedAt ? c.assignedAt.toISOString() : null,
      stage: c.stage,
    })),
    touches.map((t) => ({ leadId: t.leadId, occurredAt: t.occurredAt.toISOString() })),
    settings.days,
    closed,
    now
  );

  if (options.dryRun || dueIds.length === 0) return { due: dueIds.length, recalled: 0 };

  const CHUNK = 200;
  let recalled = 0;
  for (let i = 0; i < dueIds.length; i += CHUNK) {
    const slice = dueIds.slice(i, i + CHUNK);
    const updated = await db
      .update(leads)
      .set({ assignedTo: null, assignedAt: null, updatedAt: now })
      .where(and(eq(leads.tenantId, tenantId), inArray(leads.id, slice)))
      .returning({ id: leads.id });
    recalled += updated.length;

    try {
      await db.insert(leadInteractions).values(
        slice.map((leadId) => ({
          tenantId,
          leadId,
          type: "system" as const,
          direction: "internal" as const,
          body: `Întors în rezervă: ${settings.days} zile fără nicio activitate după repartizare.`,
          occurredAt: now,
        }))
      );
    } catch (e) {
      // Lead-urile s-au întors deja; o cronologie nescrisă nu e motiv de eșec.
      console.error("[crm/recall] cronologia nu s-a putut scrie:", e instanceof Error ? e.message : e);
    }
  }

  return { due: dueIds.length, recalled };
}
