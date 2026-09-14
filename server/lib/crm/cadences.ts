/**
 * CRM Faza 9 — motorul cadențelor (secvențe de urmărire).
 *
 * Portare din crm-vector (`src/lib/crm/cadences.ts`). O cadență e o listă de pași: „ziua 0 —
 * sună", „ziua 3 — trimite oferta", „ziua 7 — reamintește". Un lead se înscrie, iar cronul
 * zilnic aplică pasul scadent și îl reprogramează pe următorul.
 *
 * Matematica programării și mașina de stări sunt PURE — testabile fără bază de date, exact ca în
 * referință. Efectele (task nou, notă pe lead) le aplică stratul de date de mai jos.
 */
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../../db/client";
import {
  crmCadences,
  crmCadenceEnrollments,
  type CrmCadence,
  type CrmCadenceEnrollment,
  type CrmCadenceStep,
} from "../../db/schema/crmCadences";
import { crmLeadTasks } from "../../db/schema/crmTasks";
import { leadInteractions, leads } from "../../db/schema/leads";

const DAY_MS = 86_400_000;

// ─── Logică pură ──────────────────────────────────────────────────────────────

/**
 * Când trebuie să se aprindă pasul `currentStep`, măsurat de la `fromDate`?
 * `null` când indicele iese din listă (nu mai sunt pași → înscrierea s-a terminat). Un offset
 * negativ se aplatizează la 0: „acum", nu în trecut.
 */
export function computeNextFire(steps: CrmCadenceStep[], currentStep: number, fromDate: Date): Date | null {
  if (currentStep < 0 || currentStep >= steps.length) return null;
  const offsetDays = Math.max(0, steps[currentStep]?.dayOffset ?? 0);
  return new Date(fromDate.getTime() + offsetDays * DAY_MS);
}

export interface AdvanceResult {
  status: "active" | "done";
  currentStep: number;
  nextFireAt: Date | null;
}

/** Starea înscrierii DUPĂ aplicarea pasului curent. Pură. */
export function advanceState(steps: CrmCadenceStep[], currentStep: number, now: Date): AdvanceResult {
  const nextStep = currentStep + 1;
  if (nextStep >= steps.length) return { status: "done", currentStep: nextStep, nextFireAt: null };
  return { status: "active", currentStep: nextStep, nextFireAt: computeNextFire(steps, nextStep, now) };
}

/** Pură: e scadentă înscrierea la `now`? */
export function isEnrollmentDue(
  enrollment: Pick<CrmCadenceEnrollment, "status" | "nextFireAt">,
  now: Date = new Date()
): boolean {
  return enrollment.status === "active" && enrollment.nextFireAt !== null && enrollment.nextFireAt <= now;
}

// ─── Strat de date ────────────────────────────────────────────────────────────

/**
 * Înscrie un lead într-o cadență. Programează primul pas. O cadență fără pași se înscrie direct
 * ca `done` — altfel ar rămâne o înscriere activă care nu se va aprinde niciodată.
 *
 * `null` dacă leadul sau cadența nu sunt ale tenantului: apelantul răspunde 404.
 */
export async function enrollLeadInCadence(
  tenantId: string,
  leadId: string,
  cadenceId: string
): Promise<CrmCadenceEnrollment | null> {
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  if (!lead) return null;

  const [cadence] = await db
    .select()
    .from(crmCadences)
    .where(and(eq(crmCadences.id, cadenceId), eq(crmCadences.tenantId, tenantId)));
  if (!cadence) return null;

  const steps = cadence.steps ?? [];
  const now = new Date();
  const hasSteps = steps.length > 0;

  const [row] = await db
    .insert(crmCadenceEnrollments)
    .values({
      tenantId,
      leadId,
      cadenceId,
      status: hasSteps ? "active" : "done",
      currentStep: 0,
      nextFireAt: hasSteps ? computeNextFire(steps, 0, now) : null,
    })
    .returning();
  return row;
}

/**
 * Aplică acțiunea pasului curent, apoi mută înscrierea mai departe.
 *  - `task` → un task pe lead, cu titlul pasului;
 *  - `note` → o notă în cronologia leadului.
 *
 * Nu face nimic dacă înscrierea nu mai e activă (deja terminată sau anulată).
 */
export async function advanceEnrollment(
  tenantId: string,
  enrollmentId: string
): Promise<CrmCadenceEnrollment | null> {
  const [enrollment] = await db
    .select()
    .from(crmCadenceEnrollments)
    .where(and(eq(crmCadenceEnrollments.id, enrollmentId), eq(crmCadenceEnrollments.tenantId, tenantId)));
  if (!enrollment) return null;
  if (enrollment.status !== "active") return enrollment;

  const [cadence] = await db
    .select()
    .from(crmCadences)
    .where(and(eq(crmCadences.id, enrollment.cadenceId), eq(crmCadences.tenantId, tenantId)));
  if (!cadence) return enrollment;

  const steps = cadence.steps ?? [];
  const step = steps[enrollment.currentStep];

  if (step) {
    if (step.action === "task") {
      await db.insert(crmLeadTasks).values({
        tenantId,
        leadId: enrollment.leadId,
        title: step.title,
        // Scadent azi: pasul s-a aprins ACUM, deci munca e de azi, nu „cândva".
        dueAt: new Date(),
        status: "open",
      });
    } else if (step.action === "note") {
      await db.insert(leadInteractions).values({
        tenantId,
        leadId: enrollment.leadId,
        type: "note",
        direction: "internal",
        body: step.title,
        metadata: { cadenceId: cadence.id, cadenceStep: enrollment.currentStep },
      });
    }
  }

  const next = advanceState(steps, enrollment.currentStep, new Date());
  const [updated] = await db
    .update(crmCadenceEnrollments)
    .set({
      status: next.status,
      currentStep: next.currentStep,
      nextFireAt: next.nextFireAt,
      updatedAt: new Date(),
    })
    .where(and(eq(crmCadenceEnrollments.id, enrollmentId), eq(crmCadenceEnrollments.tenantId, tenantId)))
    .returning();
  return updated;
}

export interface ProcessResult {
  due: number;
  advanced: number;
  errors: number;
}

/**
 * Aprinde toate înscrierile scadente. Asta cheamă cronul — fără el, cadențele n-ar face nimic,
 * oricâți pași ar avea.
 *
 * `tenantId` absent = toate workspace-urile (cazul cronului). Cu el, doar unul (butonul „rulează
 * acum" din interfață, care n-are voie să atingă datele altui client).
 */
export async function processDueEnrollments(now: Date = new Date(), tenantId?: string): Promise<ProcessResult> {
  const where = tenantId
    ? and(
        eq(crmCadenceEnrollments.tenantId, tenantId),
        eq(crmCadenceEnrollments.status, "active"),
        isNotNull(crmCadenceEnrollments.nextFireAt),
        lte(crmCadenceEnrollments.nextFireAt, now)
      )
    : and(
        eq(crmCadenceEnrollments.status, "active"),
        isNotNull(crmCadenceEnrollments.nextFireAt),
        lte(crmCadenceEnrollments.nextFireAt, now)
      );

  const dueRows = await db
    .select({
      id: crmCadenceEnrollments.id,
      tenantId: crmCadenceEnrollments.tenantId,
      status: crmCadenceEnrollments.status,
      nextFireAt: crmCadenceEnrollments.nextFireAt,
    })
    .from(crmCadenceEnrollments)
    .where(where)
    .orderBy(asc(crmCadenceEnrollments.nextFireAt))
    // Plafon: un cron nu are voie să ruleze nelimitat într-o funcție serverless cu timp limitat.
    // Ce rămâne se aprinde la următoarea rulare — înscrierile nu se pierd, doar așteaptă.
    .limit(500);

  let advanced = 0;
  let errors = 0;
  for (const row of dueRows) {
    if (!isEnrollmentDue(row, now)) continue;
    try {
      await advanceEnrollment(row.tenantId, row.id);
      advanced++;
    } catch (e) {
      // O înscriere ruptă (cadență ștearsă între timp, lead dispărut) nu are voie să oprească
      // restul rulării.
      console.error("[crm/cadences] înscrierea", row.id, "nu s-a putut aprinde:", e instanceof Error ? e.message : e);
      errors++;
    }
  }

  return { due: dueRows.length, advanced, errors };
}

/**
 * Înscriere automată la intrarea într-o etapă: cadențele cu `triggerStage` egal cu etapa nouă.
 * Idempotentă pe (lead, cadență) activă — o mutare înainte-înapoi între etape nu are voie să
 * înscrie leadul de două ori în aceeași secvență.
 */
export async function enrollByStage(tenantId: string, leadId: string, stageKey: string): Promise<number> {
  try {
    const cadences = await db
      .select()
      .from(crmCadences)
      .where(
        and(eq(crmCadences.tenantId, tenantId), eq(crmCadences.enabled, true), eq(crmCadences.triggerStage, stageKey))
      );
    if (cadences.length === 0) return 0;

    const existing = await db
      .select({ cadenceId: crmCadenceEnrollments.cadenceId, status: crmCadenceEnrollments.status })
      .from(crmCadenceEnrollments)
      .where(and(eq(crmCadenceEnrollments.tenantId, tenantId), eq(crmCadenceEnrollments.leadId, leadId)));
    const alreadyActive = new Set(existing.filter((e) => e.status === "active").map((e) => e.cadenceId));

    let enrolled = 0;
    for (const cadence of cadences) {
      if (alreadyActive.has(cadence.id)) continue;
      const row = await enrollLeadInCadence(tenantId, leadId, cadence.id);
      if (row) enrolled++;
    }
    return enrolled;
  } catch (e) {
    // Best-effort, ca automatizările: o cadență greșită n-are voie să strice mutarea leadului.
    console.error("[crm/cadences] înscrierea automată a eșuat:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Cadențele unui tenant, cu pașii lor. */
export async function listCadences(tenantId: string): Promise<CrmCadence[]> {
  return db.select().from(crmCadences).where(eq(crmCadences.tenantId, tenantId)).orderBy(asc(crmCadences.createdAt));
}
