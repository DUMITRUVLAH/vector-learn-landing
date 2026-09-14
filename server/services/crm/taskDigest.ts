/**
 * CRM — digestul zilnic de taskuri restante, pe e-mail (cerința 18 din caietul de sarcini:
 * „Notificări automate pentru task-uri restante (in-app, e-mail)").
 *
 * Clopoțelul din aplicație exista deja, dar el presupune că omul E în aplicație. Un agent care
 * n-a intrat de două zile nu află că are șapte taskuri restante — exact situația pe care
 * notificarea pe e-mail o rezolvă.
 *
 * Model: `server/services/par/digestRunner.ts`, cu aceleași două decizii care fac diferența
 * între „notificare" și „spam":
 *
 *   1. **Fereastra orară se decide AICI, nu de cron.** Vercel programează în UTC; codul verifică
 *      ora locală, ca trecerea la ora de iarnă să nu mute digestul fără ca cineva să observe.
 *   2. **Anti-dublură fără tabelă nouă.** Jurnalul de mesaje există; un digest trimis aceluiași
 *      om în ultimele ore îl oprește pe al doilea, oricâte ori ar fi lovit cronul.
 */
import { and, asc, desc, eq, gte, isNotNull, like, lt } from "drizzle-orm";
import { db } from "../../db/client";
import { messages } from "../../db/schema/messages";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";
import { crmLeadTasks } from "../../db/schema/crmTasks";
import { leads } from "../../db/schema/leads";
import { appUrl } from "../../lib/par/invites";
import { MessagingService } from "../messaging/index";

const messagingService = new MessagingService(db);

/** Ora locală la care pleacă digestul: dimineața, înainte de primele apeluri. */
export const DIGEST_HOUR = 8;
const WINDOW_MINUTES = 59;
/** Sub atâtea ore de la ultimul digest nu pleacă altul. Zilnic înseamnă zilnic. */
const MIN_GAP_HOURS = 20;
const TZ = "Europe/Chisinau";
const SUBJECT_PREFIX = "[CRM]";

export function localHour(now: Date, timeZone = TZ): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(now));
}

/** Suntem în fereastra de trimitere? Minutele contează, altfel ar pleca la fiecare lovitură de cron. */
export function inDigestWindow(now: Date, timeZone = TZ): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour === DIGEST_HOUR && minute <= WINDOW_MINUTES;
}

export interface DigestTask {
  title: string;
  leadName: string;
  leadId: string;
  dueAt: Date;
  /** De câte zile e restant (0 = scadent azi). */
  overdueDays: number;
}

export function digestSubject(count: number): string {
  return `${SUBJECT_PREFIX} ${count} ${count === 1 ? "task restant" : "taskuri restante"}`;
}

/** Câte zile întregi au trecut de la scadență. Pură, testabilă fără ceas fals. */
export function overdueDays(dueAt: Date, now: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(now) - start(dueAt)) / 86_400_000));
}

/** Corpul e text simplu, nu HTML: ajunge în Primary, nu în Promotions, și se citește pe telefon. */
export function buildDigestBody(input: {
  tasks: DigestTask[];
  workspace: string | null;
  todayUrl: string;
}): string {
  const n = input.tasks.length;
  const lines: string[] = [];
  lines.push(`Ai ${n} ${n === 1 ? "task restant" : "taskuri restante"} în CRM${input.workspace ? ` (${input.workspace})` : ""}:`);
  lines.push("");
  for (const t of input.tasks) {
    const when =
      t.overdueDays === 0 ? "scadent azi" : t.overdueDays === 1 ? "restant de ieri" : `restant de ${t.overdueDays} zile`;
    lines.push(`• ${t.title} — ${t.leadName} (${when})`);
  }
  lines.push("");
  lines.push(`Toate, într-un singur ecran: ${input.todayUrl}`);
  return lines.join("\n");
}

async function sentRecently(tenantId: string, toAddress: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - MIN_GAP_HOURS * 3600_000);
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.toAddress, toAddress),
        gte(messages.createdAt, since),
        like(messages.subject, `${SUBJECT_PREFIX}%restant%`)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return !!row;
}

export interface DigestSummary {
  recipients: number;
  emails: number;
  skipped: number;
}

/**
 * Digestul unui workspace. `force` sare peste fereastra orară (butonul „trimite-mi acum"), dar
 * NU peste anti-dublură: un test nu are voie să dubleze emailul real al unui coleg.
 */
export async function runCrmTaskDigestForTenant(
  tenantId: string,
  opts: { now?: Date; force?: boolean; onlyUserId?: string } = {}
): Promise<DigestSummary> {
  const now = opts.now ?? new Date();
  const summary: DigestSummary = { recipients: 0, emails: 0, skipped: 0 };
  if (!opts.force && !inDigestWindow(now)) return summary;

  // Taskurile deschise, cu scadența trecută. Cele fără responsabil n-au cui fi trimise — rămân
  // treaba clopoțelului din aplicație, unde le vede toată lumea.
  const rows = await db
    .select({
      title: crmLeadTasks.title,
      dueAt: crmLeadTasks.dueAt,
      assignedTo: crmLeadTasks.assignedTo,
      leadId: crmLeadTasks.leadId,
      leadName: leads.fullName,
      leadDealName: leads.dealName,
    })
    .from(crmLeadTasks)
    .innerJoin(leads, and(eq(leads.id, crmLeadTasks.leadId), eq(leads.tenantId, tenantId)))
    .where(
      and(
        eq(crmLeadTasks.tenantId, tenantId),
        eq(crmLeadTasks.status, "open"),
        isNotNull(crmLeadTasks.dueAt),
        lt(crmLeadTasks.dueAt, now),
        isNotNull(crmLeadTasks.assignedTo)
      )
    )
    .orderBy(asc(crmLeadTasks.dueAt))
    .limit(500);

  if (rows.length === 0) return summary;

  const byUser = new Map<string, DigestTask[]>();
  for (const r of rows) {
    if (!r.assignedTo || !r.dueAt) continue;
    if (opts.onlyUserId && r.assignedTo !== opts.onlyUserId) continue;
    const list = byUser.get(r.assignedTo) ?? [];
    list.push({
      title: r.title,
      leadName: r.leadDealName || r.leadName,
      leadId: r.leadId,
      dueAt: r.dueAt,
      overdueDays: overdueDays(r.dueAt, now),
    });
    byUser.set(r.assignedTo, list);
  }
  if (byUser.size === 0) return summary;

  const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  const userRows = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  for (const [userId, tasks] of byUser) {
    const user = userById.get(userId);
    // Contul dezactivat nu mai primește nimic: omul a plecat din firmă.
    if (!user?.email || user.isActive === false) continue;

    summary.recipients++;
    if (await sentRecently(tenantId, user.email, now)) {
      summary.skipped++;
      continue;
    }

    const body = buildDigestBody({
      tasks,
      workspace: tenantRow?.name ?? null,
      todayUrl: `${appUrl()}/#/business/crm/astazi`,
    });

    try {
      await messagingService.sendMessage(tenantId, {
        channel: "email",
        toAddress: user.email,
        subject: digestSubject(tasks.length),
        body,
      });
      summary.emails++;
    } catch {
      // Best-effort: un email picat nu oprește restul digestului.
    }
  }

  return summary;
}

/** Digestul pe TOATE workspace-urile — ce cheamă cronul zilnic. */
export async function runCrmTaskDigest(now: Date = new Date()): Promise<DigestSummary & { tenants: number }> {
  const total: DigestSummary & { tenants: number } = { tenants: 0, recipients: 0, emails: 0, skipped: 0 };
  if (!inDigestWindow(now)) return total;

  // Doar workspace-urile care CHIAR au taskuri restante: un digest gol pentru fiecare tenant ar
  // fi muncă plătită degeaba pe un runtime serverless.
  const rows = await db
    .selectDistinct({ tenantId: crmLeadTasks.tenantId })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.status, "open"), isNotNull(crmLeadTasks.dueAt), lt(crmLeadTasks.dueAt, now)));

  for (const row of rows) {
    try {
      const s = await runCrmTaskDigestForTenant(row.tenantId, { now });
      total.tenants++;
      total.recipients += s.recipients;
      total.emails += s.emails;
      total.skipped += s.skipped;
    } catch (e) {
      console.error("[crm/digest] eșec pentru tenantul", row.tenantId, e instanceof Error ? e.message : e);
    }
  }
  return total;
}
