/**
 * Notificările managerului de task-uri — în clopoțelul existent al aplicației
 * (`in_app_notifications`), nu într-un al doilea sistem.
 *
 * Aceleași semnale ca în HR365 (`hr_task_notify`, `hr_task_comment_notify`):
 * - `task_assigned` — ai primit un task; `task_approval` — ți se cere aprobarea;
 * - `task_mention` — ai fost @menționat; `task_comment` — comentariu nou pe un task al tău
 *   (creator, responsabil, aprobator). Cine e menționat primește doar mențiunea, nu și comentariul.
 *
 * Două reguli, ambele din sursă sau mai stricte decât ea:
 * - nimeni nu e notificat despre propria acțiune;
 * - notificarea pleacă doar cui POATE deschide task-ul (sursa trimitea atribuirea și pe un task
 *   privat pe care destinatarul nu-l putea vedea — un titlu dezvăluit și un link mort).
 * Trimiterea e best-effort: o notificare picată nu are voie să strice scrierea task-ului.
 */
import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { inAppNotifications } from "../../db/schema/inAppNotifications";
import { users } from "../../db/schema/users";
import { boardTasks, type BoardTaskRow, type TaskCommentRow } from "../../db/schema/tasks";
import { boardRolesFor, canSeeTask, loadTaskContext, type TaskContext } from "./access";

type Kind = "task_assigned" | "task_approval" | "task_mention" | "task_comment" | "task_due_soon";

const MENTION_TOKEN = /@\[([0-9a-fA-F-]{36})\]/g;

async function nameOf(userId: string): Promise<string> {
  const [row] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name?.trim() || row?.email || "Un coleg";
}

/** Cine, dintre `candidates`, poate deschide task-ul — fiecare judecat cu propriile drepturi. */
async function canOpen(task: BoardTaskRow, candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) return [];
  const rows = await db
    .select({ id: users.id, tenantId: users.tenantId, role: users.role, isActive: users.isActive })
    .from(users)
    .where(inArray(users.id, candidates));
  const out: string[] = [];
  for (const row of rows) {
    if (row.tenantId !== task.tenantId || !row.isActive) continue;
    const ctx = await loadTaskContext(row);
    const facts = task.boardId ? (await boardRolesFor(ctx, [task.boardId])).get(task.boardId) ?? null : null;
    if (canSeeTask(ctx, task, facts)) out.push(row.id);
  }
  return out;
}

async function push(ctx: TaskContext, task: BoardTaskRow, recipients: string[], kind: Kind, body: string, actorName: string) {
  const targets = [...new Set(recipients)].filter((id) => id && id !== ctx.userId);
  if (targets.length === 0) return;
  const allowed = await canOpen(task, targets);
  if (allowed.length === 0) return;
  await db.insert(inAppNotifications).values(
    allowed.map((recipientUserId) => ({
      tenantId: task.tenantId,
      recipientUserId,
      kind,
      payload: { body, task_id: task.id, board_id: task.boardId, actor_name: actorName },
    })),
  );
}

/** Responsabilii și aprobatorii NOI ai unui task (la creare: toți). */
export async function notifyTaskUsers(
  ctx: TaskContext,
  task: BoardTaskRow,
  added: { assignees: string[]; approvers: string[] },
): Promise<void> {
  if (task.deletedAt || (added.assignees.length === 0 && added.approvers.length === 0)) return;
  try {
    const actor = await nameOf(ctx.userId);
    await push(ctx, task, added.assignees, "task_assigned", `${actor} ți-a atribuit task-ul „${task.title}".`, actor);
    await push(ctx, task, added.approvers, "task_approval", `${actor} îți cere aprobarea pentru „${task.title}".`, actor);
  } catch (error) {
    console.warn("[tasks] notificarea de atribuire n-a plecat:", error instanceof Error ? error.message : error);
  }
}

/** Mențiunile și comentariul nou, pentru cei implicați în task. */
export async function notifyTaskComment(ctx: TaskContext, task: BoardTaskRow, comment: TaskCommentRow): Promise<void> {
  if (task.deletedAt) return;
  try {
    const actor = await nameOf(ctx.userId);
    // Tokenii `@[uuid]` devin nume: clopoțelul arată text simplu, nu identificatori.
    const ids = [...new Set([...comment.content.matchAll(MENTION_TOKEN)].map((m) => m[1].toLowerCase()))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
      for (const row of rows) names.set(row.id, row.name);
    }
    const plain = comment.content.replace(MENTION_TOKEN, (_all, id: string) => `@${names.get(id.toLowerCase()) ?? "coleg"}`);
    const excerpt = plain.length > 140 ? `${plain.slice(0, 139)}…` : plain;
    const mentions = comment.mentions ?? [];
    await push(ctx, task, mentions, "task_mention", `${actor} te-a menționat în „${task.title}": ${excerpt}`, actor);
    const involved = [...task.assignees, ...task.approverIds, ...(task.createdBy ? [task.createdBy] : [])].filter(
      (id) => !mentions.includes(id),
    );
    await push(ctx, task, involved, "task_comment", `${actor} a comentat la „${task.title}": ${excerpt}`, actor);
  } catch (error) {
    console.warn("[tasks] notificarea de comentariu n-a plecat:", error instanceof Error ? error.message : error);
  }
}

/**
 * „Termen azi sau mâine" pentru task-urile mele — trimis leneș, la deschiderea modulului (ca
 * `notifications_sync_due_soon` din sursă), o singură dată per (task, termen): dacă termenul se
 * mută, vine o notificare nouă; dacă nu, nu se repetă.
 */
export async function syncDueSoon(ctx: TaskContext): Promise<void> {
  try {
    const today = new Date();
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000 - 1);
    const due = await db
      .select()
      .from(boardTasks)
      .where(
        and(
          eq(boardTasks.tenantId, ctx.tenantId),
          isNull(boardTasks.deletedAt),
          ne(boardTasks.status, "done"),
          gte(boardTasks.dueDate, from),
          lte(boardTasks.dueDate, to),
          sql`${boardTasks.assignees} @> ${JSON.stringify([ctx.userId])}::jsonb`,
        ),
      )
      .limit(200);
    if (due.length === 0) return;
    const existing = await db
      .select({ payload: inAppNotifications.payload })
      .from(inAppNotifications)
      .where(and(eq(inAppNotifications.recipientUserId, ctx.userId), eq(inAppNotifications.kind, "task_due_soon")));
    const sent = new Set(
      existing.map((row) => {
        const p = row.payload as { task_id?: string; due_day?: string };
        return `${p.task_id}:${p.due_day}`;
      }),
    );
    const fresh = due.filter((task) => task.dueDate && !sent.has(`${task.id}:${task.dueDate.toISOString().slice(0, 10)}`));
    if (fresh.length === 0) return;
    await db.insert(inAppNotifications).values(
      fresh.map((task) => {
        const day = (task.dueDate as Date).toISOString().slice(0, 10);
        const when = day === from.toISOString().slice(0, 10) ? "azi" : "mâine";
        return {
          tenantId: ctx.tenantId,
          recipientUserId: ctx.userId,
          kind: "task_due_soon",
          payload: { body: `„${task.title}" are termen ${when}.`, task_id: task.id, board_id: task.boardId, due_day: day },
        };
      }),
    );
  } catch (error) {
    console.warn("[tasks] sincronizarea termenelor n-a mers:", error instanceof Error ? error.message : error);
  }
}
