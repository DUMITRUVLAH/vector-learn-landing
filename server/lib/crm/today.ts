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
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions } from "../../db/schema/leads";
import { tenants } from "../../db/schema/tenants";
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
  /** Fusul orar al workspace-ului (IANA) — decide când se termină ziua unui task „toată ziua”. */
  timeZone?: string;
}

/** Fusul implicit al produsului, când workspace-ul n-are unul valid. */
export const DEFAULT_CRM_TIME_ZONE = "Europe/Chisinau";

/**
 * Stările care înseamnă „încă de făcut”. `snoozed` rămâne aici doar pentru rândurile vechi: până
 * la reparația din crmTasks.ts, amânarea scria status „snoozed”, iar toate listele citeau doar
 * „open” — taskul amânat dispărea definitiv din clopoțel și din „azi”. Amânarea scrie acum „open”
 * (mută doar scadența); rândurile rămase „snoozed” se citesc în continuare ca deschise.
 */
export const PENDING_TASK_STATUSES = ["open", "snoozed"] as const;

export function isPendingTask(t: { status: string }): boolean {
  return (PENDING_TASK_STATUSES as readonly string[]).includes(t.status);
}

/** Un fus IANA invalid (scris greșit în setări) aruncă RangeError în Intl — cădem pe implicit. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_CRM_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_CRM_TIME_ZONE;
  }
}

/** „2026-09-26” — ziua calendaristică a momentului `d`, văzută din fusul `timeZone`. */
function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Restant: taskul cu oră — după ora lui; taskul „toată ziua” — abia după ce i se termină ZIUA, în
 * fusul workspace-ului. Oglinda lui `isDueOverdue` din src/lib/crm/taskDue.ts (CRM-U04): taskul
 * „toată ziua” se păstrează la prânz local, deci `dueAt < now` îl făcea restant de la ora 12 în
 * chiar ziua în care era scadent. Pe server nu avem fusul browserului — folosim pe al tenantului.
 */
export function isTaskOverdue(
  task: { dueAt: Date | null; dueHasTime: boolean | null },
  now: Date,
  timeZone: string = DEFAULT_CRM_TIME_ZONE
): boolean {
  if (!task.dueAt) return false;
  if (task.dueHasTime) return task.dueAt.getTime() < now.getTime();
  return dayKey(task.dueAt, timeZone) < dayKey(now, timeZone);
}

const inactiveStageKeys = (stages: StageFlags[]) =>
  new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.key));

export function computeToday(input: ComputeTodayInput): TodayBuckets {
  const now = input.now ?? new Date();
  const staleDays = input.staleDays ?? 3;
  const staleMs = staleDays * 86_400_000;
  const inactiveKeys = inactiveStageKeys(input.stages);
  const owner = input.ownerId;
  const timeZone = safeTimeZone(input.timeZone);

  const overdueTasks: TodayBuckets["overdueTasks"] = [];
  const uncontacted: TodayLead[] = [];
  const noNextStep: TodayLead[] = [];
  const neglected: TodayLead[] = [];

  for (const lead of input.leads) {
    if (owner && lead.assignedTo !== owner) continue;
    const isActive = !inactiveKeys.has(lead.stage);
    const tasks = input.tasksByLead[lead.id] ?? [];
    const openTasks = tasks.filter(isPendingTask);

    // Taskurile restante contează pentru orice lead, activ sau nu.
    for (const t of openTasks) {
      if (isTaskOverdue(t, now, timeZone)) overdueTasks.push({ lead, task: t });
    }

    if (!isActive) continue;

    // Necontactat: lead nou („new"), fără nicio interacțiune.
    if (lead.stage === "new" && !input.contactedLeadIds.has(lead.id)) {
      uncontacted.push(lead);
    }

    // Fără pas următor: lead activ, fără niciun task deschis (unul amânat e tot un pas următor).
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

  const [leadRows, taskRows, interactionRows, stageRows, timeZone] = await Promise.all([
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
      .where(and(eq(crmLeadTasks.tenantId, tenantId), inArray(crmLeadTasks.status, [...PENDING_TASK_STATUSES]))),
    db
      .select({ leadId: leadInteractions.leadId, occurredAt: leadInteractions.occurredAt })
      .from(leadInteractions)
      .where(eq(leadInteractions.tenantId, tenantId)),
    db
      .select({ key: crmPipelineStages.key, isWon: crmPipelineStages.isWon, isLost: crmPipelineStages.isLost })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId)),
    tenantTimeZone(tenantId),
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
    timeZone,
  });
}

/** Fusul workspace-ului; orice eșec de citire (coloană lipsă pe o bază rămasă în urmă) → implicit,
 *  fiindcă „azi” trebuie să răspundă chiar și fără el. */
async function tenantTimeZone(tenantId: string): Promise<string> {
  try {
    const [row] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId));
    return safeTimeZone(row?.timezone);
  } catch {
    return DEFAULT_CRM_TIME_ZONE;
  }
}
