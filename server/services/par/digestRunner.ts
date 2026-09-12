/**
 * VM5-11: rularea digestului de aprobări — cine primește ce, și o singură dată.
 *
 * Fereastra: owner-ul a confirmat 09:00 și 16:00, ora Chișinăului. Vercel Cron programează în UTC,
 * deci cronul lovește de câteva ori și ACEST cod decide dacă e ora potrivită local. Așa, trecerea la
 * ora de iarnă nu mută digestul cu o oră fără ca cineva să observe.
 *
 * Anti-dublură: nu ținem un tabel nou de „ce am trimis". Jurnalul de mesaje există deja
 * (`messages`), iar un digest trimis aceluiași om în ultimele `MIN_GAP_HOURS` ore oprește al doilea.
 * Dacă cronul e lovit de două ori, sau cineva apasă butonul manual după ce a plecat cel automat,
 * omul tot un email primește.
 */
import { and, desc, eq, gte, inArray, like } from "drizzle-orm";
import { db } from "../../db/client";
import { messages } from "../../db/schema/messages";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";
import { parMembers, parRequests, parProjects, parAttachments } from "../../db/schema/par";
import { getProjectApproverMap } from "../../lib/par/projectApprovers";
import { loadOpenApprovalSteps, filterStepsForUser } from "../../lib/par/pendingForUser";
import { countMismatchesByPar } from "../../lib/par/documentWarnings";
import {
  buildDigestBody,
  daysWaiting,
  digestSubject,
  type DigestItem,
} from "../../lib/par/approvalDigest";
import { appUrl } from "../../lib/par/invites";
import { MessagingService } from "../messaging/index";

const messagingService = new MessagingService(db);

/** Orele locale la care pleacă digestul (decizia owner-ului, 12.09.2026). */
export const DIGEST_HOURS = [9, 16];
/** Cât de aproape de ora fixată contează încă drept „fereastra aia". */
const WINDOW_MINUTES = 59;
/** Sub atâtea ore de la ultimul digest, nu pleacă altul — oricine ar apăsa. */
const MIN_GAP_HOURS = 6;
const TZ = "Europe/Chisinau";
const SUBJECT_PREFIX = "[PAR]";

/** Ora locală (0–23) a organizației. */
export function localHour(now: Date, timeZone = TZ): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(now)
  );
}

/** Suntem în fereastra de trimitere? Minutele contează ca să nu trimită la fiecare lovitură de cron. */
export function inDigestWindow(now: Date, timeZone = TZ): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return DIGEST_HOURS.includes(hour) && minute <= WINDOW_MINUTES;
}

function money(cents: number | null | undefined, currency: string | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `${v.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? "MDL"}`;
}

export interface DigestSummary {
  tenants: number;
  recipients: number;
  emails: number;
  skipped: number;
}

/** A primit omul ăsta un digest de curând? */
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
        like(messages.subject, `${SUBJECT_PREFIX}%așteaptă aprobarea ta%`)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return !!row;
}

/**
 * Trimite digestul pentru o organizație. `force` sare peste fereastra de oră (butonul manual), dar
 * NU peste anti-dublură: un test nu are voie să dubleze emailul real al cuiva.
 */
export async function runApprovalDigestForTenant(
  tenantId: string,
  opts: { now?: Date; force?: boolean } = {}
): Promise<DigestSummary> {
  const now = opts.now ?? new Date();
  const summary: DigestSummary = { tenants: 1, recipients: 0, emails: 0, skipped: 0 };

  const [{ steps, scopeByPar }, projectApproverMap] = await Promise.all([
    loadOpenApprovalSteps(tenantId),
    getProjectApproverMap(tenantId),
  ]);
  if (!steps.length) return summary;

  // Candidații: oricine are rol de aprobare în organizație. Cine nu are niciun pas al lui pică la
  // filtrul următor, care e aceeași regulă ca inboxul.
  const memberRows = await db
    .select({ userId: parMembers.userId })
    .from(parMembers)
    .where(and(eq(parMembers.tenantId, tenantId), inArray(parMembers.role, ["approver", "par_admin"])));
  const candidateIds = [...new Set(memberRows.map((m) => m.userId))];
  if (!candidateIds.length) return summary;

  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, candidateIds)));

  const parIds = [...new Set(steps.map((s) => s.parId))];
  const parRows = await db
    .select({
      id: parRequests.id,
      requestNo: parRequests.requestNo,
      totalEstimatedCents: parRequests.totalEstimatedCents,
      currency: parRequests.currency,
      submittedAt: parRequests.submittedAt,
      isUrgent: parRequests.isUrgent,
      requestedByUserId: parRequests.requestedByUserId,
      projectName: parProjects.name,
    })
    .from(parRequests)
    .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
    .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds)));
  const parById = new Map(parRows.map((p) => [p.id, p]));

  const requestorIds = [...new Set(parRows.map((p) => p.requestedByUserId).filter((v): v is string => !!v))];
  const requestorRows = requestorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, requestorIds)))
    : [];
  const requestorName = new Map(requestorRows.map((u) => [u.id, u.name]));

  const attachmentRows = await db
    .select({ parId: parAttachments.parId, analysis: parAttachments.analysis })
    .from(parAttachments)
    .where(and(eq(parAttachments.tenantId, tenantId), inArray(parAttachments.parId, parIds)));
  const warningsByPar = countMismatchesByPar(attachmentRows);

  const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));

  for (const user of userRows) {
    if (!user.email) continue;
    const mine = await filterStepsForUser({
      userId: user.id,
      tenantId,
      tenantRole: user.role ?? "",
      steps,
      scopeByPar,
      projectApproverMap,
    });
    if (!mine.length) continue;

    summary.recipients++;
    if (await sentRecently(tenantId, user.email, now)) {
      summary.skipped++;
      continue;
    }

    const seen = new Set<string>();
    const items: DigestItem[] = [];
    for (const step of mine) {
      if (seen.has(step.parId)) continue;
      seen.add(step.parId);
      const par = parById.get(step.parId);
      if (!par) continue;
      items.push({
        requestNo: par.requestNo,
        parId: par.id,
        amountLabel: money(par.totalEstimatedCents, par.currency),
        requestorName: par.requestedByUserId ? requestorName.get(par.requestedByUserId) ?? null : null,
        projectName: par.projectName ?? null,
        waitingDays: daysWaiting(par.submittedAt, now),
        urgent: !!par.isUrgent,
        documentWarnings: warningsByPar.get(par.id) ?? 0,
      });
    }
    if (!items.length) continue;

    const body = buildDigestBody({
      items,
      inboxUrl: `${appUrl()}/#/business/par/inbox`,
      parUrl: (parId) => `${appUrl()}/#/business/par/${parId}`,
      workspace: tenantRow?.name ?? null,
      toAddress: user.email,
    });

    try {
      await messagingService.sendMessage(tenantId, {
        channel: "email",
        toAddress: user.email,
        subject: digestSubject(items.length),
        body,
      });
      summary.emails++;
    } catch {
      // Best-effort, ca toate notificările PAR: un email picat nu oprește restul digestului.
    }
  }

  return summary;
}

/** Toate organizațiile cu modulul PAR — apelat de cron. */
export async function runApprovalDigest(opts: { now?: Date; force?: boolean } = {}): Promise<DigestSummary> {
  const now = opts.now ?? new Date();
  const total: DigestSummary = { tenants: 0, recipients: 0, emails: 0, skipped: 0 };
  if (!opts.force && !inDigestWindow(now)) return total;

  const tenantRows = await db.select({ id: tenants.id }).from(tenants);
  for (const t of tenantRows) {
    const one = await runApprovalDigestForTenant(t.id, { now, force: true });
    total.tenants += one.recipients > 0 ? 1 : 0;
    total.recipients += one.recipients;
    total.emails += one.emails;
    total.skipped += one.skipped;
  }
  return total;
}
