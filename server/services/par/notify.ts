/**
 * PAR-111: PAR notification service
 *
 * Maps PAR events to in-app notifications + optional email.
 *
 * ARCHITECTURE (CORE §7, backlog-critic anti-COMPETING_SYSTEM rule):
 *   - In-app: writes DIRECTLY to `inAppNotifications` table (kind="par").
 *     `NotificationService` is NOT used — it only supports lead/student recipients.
 *   - Email: uses `MessagingService.sendMessage` with `toAddress = user.email`.
 *     No new email system; reuses the existing provider infrastructure.
 *   - Idempotent: fire-and-forget with try/catch; never throws to the caller.
 *
 * Events handled:
 *   - submitted → first approver notified
 *   - step_approved (intermediate) → next approver notified
 *   - fully_approved (execute_payment) → finance role users notified
 *   - rejected / changes_requested → requestor notified
 *   - paid → requestor notified
 *
 * CORE: backlog/par/PAR-CORE.md §7
 * Anti-COMPETING_SYSTEM: no new notification table, no new email provider.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { inAppNotifications } from "../../db/schema/inAppNotifications";
import { users } from "../../db/schema/users";
import { parMembers, parRequests, parProjects, parBudgetCodes, parVendors } from "../../db/schema/par";
import { MessagingService } from "../messaging/index";

const messagingService = new MessagingService(db);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParNotifyContext {
  tenantId: string;
  parId: string;
  requestNo: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Fetch user name + email by userId, tenant-scoped */
async function getUser(userId: string, tenantId: string): Promise<{ name: string; email: string } | null> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  return u ?? null;
}

/** Format minor units in a currency, e.g. "1.250,00 EUR". */
function formatParAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `${v.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? "MDL"}`;
}

const PURPOSE_LABELS: Record<string, string> = {
  execute_payment: "Execută plata",
  obtain_quotations: "Obține oferte",
  provide_estimate: "Oferă o estimare",
};

/**
 * VM1-08 — payment details shown to the approver in the email (NO IBAN / bank data;
 * those stay in-app per the owner's decision). Includes amount, payee, reason, project,
 * budget. Best-effort: returns a multi-line block, or null if the PAR can't be loaded.
 */
async function loadParSummary(tenantId: string, parId: string): Promise<string | null> {
  try {
    const [p] = await db
      .select({
        totalEstimatedCents: parRequests.totalEstimatedCents,
        currency: parRequests.currency,
        endUse: parRequests.endUse,
        purpose: parRequests.purpose,
        payeeName: parRequests.payeeName,
        vendorId: parRequests.vendorId,
        projectId: parRequests.projectId,
        budgetCodeId: parRequests.budgetCodeId,
      })
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!p) return null;

    let payeeName = p.payeeName?.trim() || "";
    if (!payeeName && p.vendorId) {
      const [v] = await db
        .select({ name: parVendors.name })
        .from(parVendors)
        .where(and(eq(parVendors.id, p.vendorId), eq(parVendors.tenantId, tenantId)));
      payeeName = v?.name ?? "";
    }

    let projectName = "";
    if (p.projectId) {
      const [pr] = await db
        .select({ name: parProjects.name })
        .from(parProjects)
        .where(and(eq(parProjects.id, p.projectId), eq(parProjects.tenantId, tenantId)));
      projectName = pr?.name ?? "";
    }

    let budgetLabel = "";
    if (p.budgetCodeId) {
      const [bc] = await db
        .select({ code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.id, p.budgetCodeId), eq(parBudgetCodes.tenantId, tenantId)));
      if (bc) budgetLabel = [bc.code, bc.name].filter(Boolean).join(" — ");
    }

    const reason = p.endUse?.trim() || PURPOSE_LABELS[p.purpose] || "";

    const lines = ["Detalii plată:", `• Sumă: ${formatParAmount(p.totalEstimatedCents, p.currency)}`];
    if (payeeName) lines.push(`• Către: ${payeeName}`);
    if (reason) lines.push(`• Motiv: ${reason}`);
    if (projectName) lines.push(`• Proiect: ${projectName}`);
    if (budgetLabel) lines.push(`• Buget: ${budgetLabel}`);
    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * VM1-08 — full approver email body: one-line intro + payment details + deep link.
 * Used for the "someone submitted a PAR → approver" email (and the next-step email).
 */
async function buildApproverEmailBody(ctx: ParNotifyContext, stepLabel?: string): Promise<string> {
  const summary = await loadParSummary(ctx.tenantId, ctx.parId);
  const intro = `Cererea ${ctx.requestNo} așteaptă aprobarea ta${stepLabel ? ` (pas: ${stepLabel})` : ""}.`;
  const link = `Deschide cererea: /app/par/${ctx.parId}`;
  return [intro, "", summary, summary ? "" : null, link].filter((l) => l !== null).join("\n");
}

/**
 * VM1-08 — notify every approver of a step (in-app always; email with full payment
 * details). Works for a specific assignee or role-based routing (all approvers/par_admin).
 */
async function notifyApprovers(params: {
  ctx: ParNotifyContext;
  specificUserId: string | null;
  inAppBody: string;
  subject: string;
  stepLabel?: string;
}): Promise<void> {
  const { ctx, specificUserId, inAppBody, subject, stepLabel } = params;
  const emailBody = await buildApproverEmailBody(ctx, stepLabel);

  let recipients: string[];
  if (specificUserId) {
    recipients = [specificUserId];
  } else {
    const rows = await db
      .select({ userId: parMembers.userId })
      .from(parMembers)
      .where(
        and(eq(parMembers.tenantId, ctx.tenantId), inArray(parMembers.role, ["approver", "par_admin"]))
      );
    recipients = [...new Set(rows.map((r) => r.userId))];
  }

  for (const userId of recipients) {
    await sendInApp({ tenantId: ctx.tenantId, recipientUserId: userId, body: inAppBody, parId: ctx.parId });
    const u = await getUser(userId, ctx.tenantId);
    if (u?.email) {
      await sendEmail({ tenantId: ctx.tenantId, toAddress: u.email, subject, body: emailBody });
    }
  }
}

/** Send one in-app notification. Silently absorbs errors. */
async function sendInApp(params: {
  tenantId: string;
  recipientUserId: string;
  body: string;
  parId: string;
  kind?: string;
}): Promise<void> {
  try {
    await db.insert(inAppNotifications).values({
      tenantId: params.tenantId,
      recipientUserId: params.recipientUserId,
      kind: params.kind ?? "par",
      payload: {
        body: params.body,
        par_id: params.parId,
      },
    });
  } catch {
    // Best-effort — never crash the caller
  }
}

/** Send email via MessagingService. Silently absorbs errors. */
async function sendEmail(params: {
  tenantId: string;
  toAddress: string;
  subject: string;
  body: string;
}): Promise<void> {
  try {
    await messagingService.sendMessage(params.tenantId, {
      channel: "email",
      toAddress: params.toAddress,
      subject: params.subject,
      body: params.body,
    });
  } catch {
    // Best-effort — never crash the caller
  }
}

/** Notify a single user (in-app + email) */
async function notifyUser(params: {
  tenantId: string;
  userId: string;
  parId: string;
  body: string;
  subject: string;
}): Promise<void> {
  await sendInApp({
    tenantId: params.tenantId,
    recipientUserId: params.userId,
    body: params.body,
    parId: params.parId,
  });

  // Optional email — best-effort only
  const userRecord = await getUser(params.userId, params.tenantId);
  if (userRecord?.email) {
    await sendEmail({
      tenantId: params.tenantId,
      toAddress: userRecord.email,
      subject: params.subject,
      body: `${params.body}\n\nView PAR: /app/par/${params.parId}`,
    });
  }
}

// ─── Finance users lookup ─────────────────────────────────────────────────────

/** Get all users with `finance` or `par_admin` par_role in the tenant */
async function getFinanceUsers(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: parMembers.userId })
    .from(parMembers)
    .where(
      and(
        eq(parMembers.tenantId, tenantId),
        inArray(parMembers.role, ["finance", "par_admin"])
      )
    );
  return rows.map((r) => r.userId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * On PAR submitted → notify the first approver (step 1).
 *
 * @param approverUserId — specific user assigned to step 1 (null = role-based, skip email but still send in-app to all approvers)
 */
export async function notifySubmitted(ctx: ParNotifyContext, approverUserId: string | null): Promise<void> {
  // VM1-08: approver email carries the payment details (amount/payee/reason/project/budget);
  // role-based routing now emails every eligible approver too (was in-app only).
  await notifyApprovers({
    ctx,
    specificUserId: approverUserId,
    inAppBody: `PAR ${ctx.requestNo} așteaptă aprobarea ta. Link: /app/par/${ctx.parId}`,
    subject: `[PAR] ${ctx.requestNo} — aprobare necesară`,
  });
}

/**
 * On approval step N approved (not final) → notify the next approver (step N+1).
 */
export async function notifyStepAdvanced(
  ctx: ParNotifyContext,
  nextApproverUserId: string | null,
  nextStepLabel: string
): Promise<void> {
  // VM1-08: same enriched email for the next approver in the chain.
  await notifyApprovers({
    ctx,
    specificUserId: nextApproverUserId,
    inAppBody: `PAR ${ctx.requestNo} (pas: ${nextStepLabel}) așteaptă aprobarea ta. Link: /app/par/${ctx.parId}`,
    subject: `[PAR] ${ctx.requestNo} — aprobare necesară (${nextStepLabel})`,
    stepLabel: nextStepLabel,
  });
}

/**
 * On final approval with purpose=execute_payment → notify all finance users.
 */
export async function notifyFullyApprovedToFinance(ctx: ParNotifyContext): Promise<void> {
  const financeUsers = await getFinanceUsers(ctx.tenantId);
  const body = `PAR ${ctx.requestNo} is fully approved and ready for payment execution. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — ready for payment`;

  for (const userId of financeUsers) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId,
      parId: ctx.parId,
      body,
      subject,
    });
  }
}

/**
 * VF-101: On final approval → notify the requestor that their PAR cleared all approvals.
 * Complements notifyFullyApprovedToFinance (which targets finance). Best-effort.
 */
export async function notifyApprovedToRequestor(
  ctx: ParNotifyContext,
  requestorUserId: string
): Promise<void> {
  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body: `PAR ${ctx.requestNo} a fost aprobată. Link: /app/par/${ctx.parId}`,
    subject: `[PAR] ${ctx.requestNo} — aprobată`,
  });
}

/**
 * On reject → notify the requestor with the rejection comment.
 */
export async function notifyRejected(
  ctx: ParNotifyContext,
  requestorUserId: string,
  comment: string
): Promise<void> {
  const body = `PAR ${ctx.requestNo} was rejected. Reason: ${comment.slice(0, 500)}. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — rejected`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject,
  });
}

/**
 * On request-changes → notify the requestor with the comment.
 */
export async function notifyChangesRequested(
  ctx: ParNotifyContext,
  requestorUserId: string,
  comment: string
): Promise<void> {
  const body = `PAR ${ctx.requestNo} requires changes: ${comment.slice(0, 500)}. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — changes requested`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject,
  });
}

/**
 * On paid → notify the requestor.
 */
export async function notifyPaid(
  ctx: ParNotifyContext,
  requestorUserId: string
): Promise<void> {
  const body = `PAR ${ctx.requestNo} has been paid. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — payment executed`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject,
  });
}
