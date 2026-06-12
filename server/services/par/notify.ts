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
import { parMembers } from "../../db/schema/par";
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
  const body = `PAR ${ctx.requestNo} awaits your approval. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — approval required`;

  if (approverUserId) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: approverUserId,
      parId: ctx.parId,
      body,
      subject,
    });
  } else {
    // Role-based routing: notify all approvers in the tenant
    const approvers = await db
      .select({ userId: parMembers.userId })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, ctx.tenantId),
          inArray(parMembers.role, ["approver", "par_admin"])
        )
      );

    for (const { userId } of approvers) {
      await sendInApp({
        tenantId: ctx.tenantId,
        recipientUserId: userId,
        body,
        parId: ctx.parId,
      });
    }
  }
}

/**
 * On approval step N approved (not final) → notify the next approver (step N+1).
 */
export async function notifyStepAdvanced(
  ctx: ParNotifyContext,
  nextApproverUserId: string | null,
  nextStepLabel: string
): Promise<void> {
  const body = `PAR ${ctx.requestNo} (step: ${nextStepLabel}) awaits your approval. Link: /app/par/${ctx.parId}`;
  const subject = `[PAR] ${ctx.requestNo} — ${nextStepLabel} approval required`;

  if (nextApproverUserId) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: nextApproverUserId,
      parId: ctx.parId,
      body,
      subject,
    });
  } else {
    // Role-based routing
    const approvers = await db
      .select({ userId: parMembers.userId })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, ctx.tenantId),
          inArray(parMembers.role, ["approver", "par_admin"])
        )
      );

    for (const { userId } of approvers) {
      await sendInApp({
        tenantId: ctx.tenantId,
        recipientUserId: userId,
        body,
        parId: ctx.parId,
      });
    }
  }
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
