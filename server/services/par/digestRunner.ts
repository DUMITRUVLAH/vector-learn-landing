/**
 * VM5-11: rularea digestului de aprobări — cine primește ce, și o singură dată.
 *
 * Fereastra: owner-ul a confirmat 09:00 și 16:00, ora Chișinăului. Vercel Cron programează în UTC,
 * deci cronul lovește DIN ORĂ ÎN ORĂ (`"0 * * * *"` în vercel.json) și ACEST cod decide dacă e ora
 * potrivită local. Așa, trecerea la ora de iarnă nu mută digestul cu o oră fără ca cineva să observe.
 *
 * ATENȚIE la cine schimbă `vercel.json` (capcană verificată 16.09.2026): un cron fixat pe orele UTC
 * care ies bine VARA (06:00 → 09:00, 13:00 → 16:00) cade lângă fereastră IARNA, când Moldova trece
 * pe UTC+2 — 06:00 UTC devine 08:00 local, 13:00 UTC devine 15:00, `inDigestWindow` le respinge pe
 * amândouă și digestul se oprește în tăcere pe 25.10, fără nicio eroare. Rularea orară e ieftină:
 * `runApprovalDigest` iese pe `inDigestWindow` ÎNAINTE de orice interogare, deci 22 din 24 de
 * loviri nu ating deloc baza de date.
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
import { inAppNotifications } from "../../db/schema/inAppNotifications";
import {
  buildDigestBody,
  daysWaiting,
  digestSubject,
  type DigestItem,
  type FinanceItem,
  type UpdateItem,
} from "../../lib/par/approvalDigest";
import { appUrl } from "../../lib/par/invites";
import { MessagingService } from "../messaging/index";
import { stripInAppLink } from "./notify";

const messagingService = new MessagingService(db);

/** Orele locale la care pleacă digestul (decizia owner-ului, 12.09.2026). */
export const DIGEST_HOURS = [9, 16];
/** Cât de aproape de ora fixată contează încă drept „fereastra aia". */
const WINDOW_MINUTES = 59;
/** Sub atâtea ore de la ultimul digest, nu pleacă altul — oricine ar apăsa. */
const MIN_GAP_HOURS = 6;
const TZ = "Europe/Chisinau";
const SUBJECT_PREFIX = "[PAR]";
/** `kind`-ul notificărilor in-app scrise de `notifyPriorApprovers`. */
const PAR_UPDATE_KIND = "par_update";
/** Un digest nu e un jurnal: peste atâtea update-uri, omul deschide aplicația. */
const MAX_UPDATES = 15;

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

/**
 * Ultimul digest trimis omului ăstuia, oricât de vechi. Dublează drept ceas pentru secțiunea de
 * update-uri: ce s-a întâmplat DUPĂ el e ce n-a văzut încă pe email.
 */
async function lastDigestAt(tenantId: string, toAddress: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.toAddress, toAddress),
        like(messages.subject, `${SUBJECT_PREFIX} Digest%`)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row?.createdAt ? new Date(row.createdAt) : null;
}

/** A primit omul ăsta un digest de curând? */
function sentRecently(last: Date | null, now: Date): boolean {
  if (!last) return false;
  return now.getTime() - last.getTime() < MIN_GAP_HOURS * 3600_000;
}

/**
 * VM5-13: update-urile scrise pentru omul ăsta de la un moment încoace („cererea pe care ai
 * aprobat-o a fost achitată"). `notifyPriorApprovers` le scrie ca notificări in-app cu
 * `kind = "par_update"`; digestul doar le adună — nicio coadă nouă de emailuri.
 */
async function loadUpdatesFor(tenantId: string, userId: string, since: Date): Promise<UpdateItem[]> {
  const rows = await db
    .select({ payload: inAppNotifications.payload, createdAt: inAppNotifications.createdAt })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.tenantId, tenantId),
        eq(inAppNotifications.recipientUserId, userId),
        eq(inAppNotifications.kind, PAR_UPDATE_KIND),
        gte(inAppNotifications.createdAt, since)
      )
    )
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(MAX_UPDATES);
  return rows
    .map((r) => ({ parId: r.payload?.par_id ?? "", text: stripInAppLink(r.payload?.body ?? "") }))
    .filter((u) => !!u.parId && !!u.text);
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

  // VM5-13: coada finanțelor — cereri aprobate complet, care așteaptă execuția plății. Nu mai
  // pleacă un email per cerere la aprobare; ajung aici, în același digest de 09:00 / 16:00.
  const financeRows = await db
    .select({
      id: parRequests.id,
      requestNo: parRequests.requestNo,
      totalEstimatedCents: parRequests.totalEstimatedCents,
      currency: parRequests.currency,
      payeeName: parRequests.payeeName,
      approvedAt: parRequests.approvedAt,
      isUrgent: parRequests.isUrgent,
    })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "in_finance")));
  const financeItems: FinanceItem[] = financeRows.map((p) => ({
    requestNo: p.requestNo,
    parId: p.id,
    amountLabel: money(p.totalEstimatedCents, p.currency),
    payeeName: p.payeeName?.trim() || null,
    waitingDays: daysWaiting(p.approvedAt, now),
    urgent: !!p.isUrgent,
  }));

  // Candidații: oricine are un rol PAR care poate primi ceva în digest — aprobatorii (cereri de
  // semnat) și finanțele (cereri de plătit). Cine n-are nimic al lui pică la filtrele de mai jos.
  const memberRows = await db
    .select({ userId: parMembers.userId, role: parMembers.role })
    .from(parMembers)
    .where(
      and(
        eq(parMembers.tenantId, tenantId),
        inArray(parMembers.role, ["approver", "par_admin", "finance"])
      )
    );
  const candidateIds = [...new Set(memberRows.map((m) => m.userId))];
  if (!candidateIds.length) return summary;
  /** Cine vede secțiunea „de plătit". `par_admin` o vede ca și finanțele — la fel ca în aplicație. */
  const financeUserIds = new Set(
    memberRows.filter((m) => m.role === "finance" || m.role === "par_admin").map((m) => m.userId)
  );

  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, candidateIds)));

  // `inArray(x, [])` nu e SQL valid — iar de când digestul acoperă și finanțele, o organizație
  // poate ajunge aici FĂRĂ niciun pas de aprobare deschis și tot să aibă ce trimite.
  const parIds = [...new Set(steps.map((s) => s.parId))];
  const parRows = parIds.length
    ? await db
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
        .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds)))
    : [];
  const parById = new Map(parRows.map((p) => [p.id, p]));

  const requestorIds = [...new Set(parRows.map((p) => p.requestedByUserId).filter((v): v is string => !!v))];
  const requestorRows = requestorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, requestorIds)))
    : [];
  const requestorName = new Map(requestorRows.map((u) => [u.id, u.name]));

  const attachmentRows = parIds.length
    ? await db
        .select({ parId: parAttachments.parId, analysis: parAttachments.analysis })
        .from(parAttachments)
        .where(and(eq(parAttachments.tenantId, tenantId), inArray(parAttachments.parId, parIds)))
    : [];
  const warningsByPar = countMismatchesByPar(attachmentRows);

  const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));

  for (const user of userRows) {
    if (!user.email) continue;
    const mine = steps.length
      ? await filterStepsForUser({
          userId: user.id,
          tenantId,
          tenantRole: user.role ?? "",
          steps,
          scopeByPar,
          projectApproverMap,
        })
      : [];
    const mineFinance = financeUserIds.has(user.id) ? financeItems : [];

    const last = await lastDigestAt(tenantId, user.email);
    // VM5-13: update-urile scrise de la ultimul digest încoace. Fără un ceas, aceleași update-uri
    // s-ar repeta în fiecare email; cu el, fiecare apare exact o dată. La primul digest al omului
    // ne uităm în urmă o zi, ca să nu-i turnăm în față tot istoricul organizației.
    const updatesSince = last ?? new Date(now.getTime() - 24 * 3600_000);
    const updates = await loadUpdatesFor(tenantId, user.id, updatesSince);

    if (!mine.length && !mineFinance.length && !updates.length) continue;

    summary.recipients++;
    if (sentRecently(last, now)) {
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
    if (!items.length && !mineFinance.length && !updates.length) continue;

    const body = buildDigestBody({
      items,
      financeItems: mineFinance,
      updates,
      inboxUrl: `${appUrl()}/#/business/par/inbox`,
      financeUrl: `${appUrl()}/#/business/par/finante`,
      parUrl: (parId) => `${appUrl()}/#/business/par/${parId}`,
      workspace: tenantRow?.name ?? null,
      toAddress: user.email,
    });

    try {
      await messagingService.sendMessage(tenantId, {
        channel: "email",
        toAddress: user.email,
        subject: digestSubject({
          approvals: items.length,
          finance: mineFinance.length,
          updates: updates.length,
        }),
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
