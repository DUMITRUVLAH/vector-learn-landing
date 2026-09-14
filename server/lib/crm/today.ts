/**
 * CRM — „Azi": lista de lucru zilnică a agentului (taskuri restante, lead-uri
 * necontactate, fără următor pas, neglijate).
 *
 * Portat din crm-vector (`src/lib/crm/today.ts`) — `computeToday` e calculul PUR de
 * acolo (doar redenumit câmpurile în camelCase Drizzle), testat direct prin
 * `server/__tests__/crmTasks.routes.test.ts` (GET /api/crm/tasks/today).
 * `getTodayForTenant` e adaptorul care aduce datele din Postgres, multi-tenant —
 * spre deosebire de sursă (Supabase single-tenant), FIECARE interogare de mai jos e
 * filtrată `eq(*.tenantId, tenantId)`.
 *
 * La fel ca sursa: won/lost NU se citesc dintr-o cheie fixă („paid"/„lost"), ci din
 * flagurile isWon/isLost ale etapei curente a tenantului — etapele sunt redenumibile
 * per workspace (vezi server/db/schema/crmPipelineStages.ts).
 *
 * La fel, „azi" respectă cerința 13 din sursă: fără `ownerId`, lista arată munca
 * ÎNTREGII echipe (comportament vechi); cu `ownerId`, DOAR lead-urile agentului
 * respectiv — bug-ul din sursă era exact opusul (fiecare agent vedea tot).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions } from "../../db/schema/leads";
import { crmLeadTasks, type CrmLeadTask } from "../../db/schema/crmTasks";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { ensureTenantStages } from "./stages";

/** Coloanele de lead necesare pentru afișarea unui rând din „azi" — nu tot rândul. */
export interface TodayLead {
  id: string;
  fullName: string;
  dealName: string | null;
  phone: string | null;
  company: string | null;
  stage: string;
  assignedTo: string | null;
  valueCents: number;
  createdAt: Date;
}

export interface TodayBuckets {
  /** Taskuri deschise a căror scadență a trecut. */
  overdueTasks: Array<{ lead: TodayLead; task: CrmLeadTask }>;
  /** Lead-uri noi, fără nicio interacțiune încă. */
  uncontacted: TodayLead[];
  /** Lead-uri active (nici câștigate, nici pierdute) fără niciun task deschis. */
  noNextStep: TodayLead[];
  /** Lead-uri active neatinse de mai mult de `staleDays`. */
  neglected: TodayLead[];
}

interface StageFlags {
  key: string;
  isWon: boolean;
  isLost: boolean;
}

export interface ComputeTodayInput {
  leads: TodayLead[];
  tasksByLead: Record<string, CrmLeadTask[]>;
  /** leadId → cea mai recentă interacțiune (orice tip), sau null. */
  lastTouchByLead: Record<string, Date | null>;
  /** leadId-urile care au cel puțin o interacțiune (au fost contactate). */
  contactedLeadIds: Set<string>;
  stages: StageFlags[];
  /** Restrânge la un singur agent — absent = toată echipa. */
  ownerId?: string;
  now?: Date;
  staleDays?: number;
}

const inactiveStageKeys = (stages: StageFlags[]) =>
  new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.key));

export function computeToday(input: ComputeTodayInput): TodayBuckets {
  const now = input.now ?? new Date();
  const staleDays = input.staleDays ?? 3;
  const staleMs = staleDays * 86_400_000;
  const inactiveKeys = inactiveStageKeys(input.stages);
  const owner = input.ownerId;

  const overdueTasks: TodayBuckets["overdueTasks"] = [];
  const uncontacted: TodayLead[] = [];
  const noNextStep: TodayLead[] = [];
  const neglected: TodayLead[] = [];

  for (const lead of input.leads) {
    if (owner && lead.assignedTo !== owner) continue;
    const isActive = !inactiveKeys.has(lead.stage);
    const tasks = input.tasksByLead[lead.id] ?? [];
    const openTasks = tasks.filter((t) => t.status === "open");

    // Taskurile restante contează pentru orice lead, activ sau nu.
    for (const t of openTasks) {
      if (t.dueAt && t.dueAt < now) overdueTasks.push({ lead, task: t });
    }

    if (!isActive) continue;

    // Necontactat: lead nou („new"), fără nicio interacțiune.
    if (lead.stage === "new" && !input.contactedLeadIds.has(lead.id)) {
      uncontacted.push(lead);
    }

    // Fără pas următor: lead activ, fără niciun task deschis.
    if (openTasks.length === 0) noNextStep.push(lead);

    // Neglijat: ultima atingere mai veche de staleDays (fallback pe createdAt).
    const lastTouch = input.lastTouchByLead[lead.id] ?? lead.createdAt;
    if (lastTouch && now.getTime() - lastTouch.getTime() > staleMs) {
      neglected.push(lead);
    }
  }

  // Cele mai restante taskuri primele.
  overdueTasks.sort((a, b) => a.task.dueAt!.getTime() - b.task.dueAt!.getTime());
  return { overdueTasks, uncontacted, noNextStep, neglected };
}

/** Aduce tot ce are nevoie `computeToday` pentru un tenant, apoi calculează bucketele. */
export async function getTodayForTenant(
  tenantId: string,
  opts: { ownerId?: string; now?: Date; staleDays?: number } = {}
): Promise<TodayBuckets> {
  // Workspace nou / fără nicio etapă încă → primește cele 5 implicite acum, ca lead-urile
  // lui să nu pice toate în „inactive" dintr-o pâlnie complet goală.
  await ensureTenantStages(tenantId);

  const [leadRows, taskRows, interactionRows, stageRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        dealName: leads.dealName,
        phone: leads.phone,
        company: leads.company,
        stage: leads.stage,
        assignedTo: leads.assignedTo,
        valueCents: leads.valueCents,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId)),
    db
      .select()
      .from(crmLeadTasks)
      .where(and(eq(crmLeadTasks.tenantId, tenantId), eq(crmLeadTasks.status, "open"))),
    db
      .select({ leadId: leadInteractions.leadId, occurredAt: leadInteractions.occurredAt })
      .from(leadInteractions)
      .where(eq(leadInteractions.tenantId, tenantId)),
    db
      .select({ key: crmPipelineStages.key, isWon: crmPipelineStages.isWon, isLost: crmPipelineStages.isLost })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId)),
  ]);

  const tasksByLead: Record<string, CrmLeadTask[]> = {};
  for (const t of taskRows) {
    (tasksByLead[t.leadId] ??= []).push(t);
  }

  const lastTouchByLead: Record<string, Date | null> = {};
  const contactedLeadIds = new Set<string>();
  for (const i of interactionRows) {
    contactedLeadIds.add(i.leadId);
    const prev = lastTouchByLead[i.leadId];
    if (!prev || i.occurredAt > prev) lastTouchByLead[i.leadId] = i.occurredAt;
  }

  return computeToday({
    leads: leadRows,
    tasksByLead,
    lastTouchByLead,
    contactedLeadIds,
    stages: stageRows,
    ownerId: opts.ownerId,
    now: opts.now,
    staleDays: opts.staleDays,
  });
}
