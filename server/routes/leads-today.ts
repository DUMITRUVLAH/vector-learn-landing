/**
 * CRM-120 — GET /api/leads/today
 * Returns the 4 "Today" dashboard sections:
 *  1. overdueOrDueToday  — open tasks due today or overdue, with lead context
 *  2. newUncontacted     — leads created < 48h ago with no outbound interaction
 *  3. followUpNeeded     — leads in contacted/trial with no outbound contact > 2 days
 *  4. nextBestAction     — top 5 by (score desc, age desc), not in the other lists
 *
 * Scoping:
 *  - tenant_id always applied
 *  - If user role is NOT 'owner'/'manager', further filter by assigned_to = user.id
 */
import { Hono } from "hono";
import { and, asc, desc, eq, gte, isNull, lte, ne, notInArray, or, lt } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, leadTasks } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const leadsTodayRoutes = new Hono<{ Variables: AuthVariables }>();

leadsTodayRoutes.use("/*", requireAuth);

leadsTodayRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const userId = user.id;
  const role = user.role as string;

  const isManager = role === "owner" || role === "manager";

  const now = new Date();
  // End of today (midnight)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  // 48h ago (new leads window)
  const _48hAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  // 2 days ago (follow-up threshold)
  const _2dAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // ─── 1. Tasks due today or overdue ────────────────────────────────────────
  const taskConditions = [
    eq(leadTasks.tenantId, tenantId),
    eq(leadTasks.status, "open"),
    lte(leadTasks.dueAt, todayEnd),
  ];
  if (!isManager) {
    taskConditions.push(eq(leadTasks.assignedTo, userId));
  }

  const dueTasks = await db
    .select({
      taskId: leadTasks.id,
      taskTitle: leadTasks.title,
      dueAt: leadTasks.dueAt,
      leadId: leadTasks.leadId,
      leadFullName: leads.fullName,
      leadStage: leads.stage,
      leadPhone: leads.phone,
      leadInterestCourse: leads.interestCourse,
      leadValueCents: leads.valueCents,
    })
    .from(leadTasks)
    .innerJoin(leads, eq(leads.id, leadTasks.leadId))
    .where(and(...taskConditions))
    .orderBy(asc(leadTasks.dueAt))
    .limit(20);

  // ─── 2. New uncontacted leads (created < 48h, no outbound interaction) ────
  const leadConditions2 = [
    eq(leads.tenantId, tenantId),
    gte(leads.createdAt, _48hAgo),
    ne(leads.stage, "paid"),
    ne(leads.stage, "lost"),
  ];
  if (!isManager) {
    leadConditions2.push(
      or(eq(leads.assignedTo, userId), isNull(leads.assignedTo))!
    );
  }

  const recentLeads = await db
    .select()
    .from(leads)
    .where(and(...leadConditions2))
    .orderBy(desc(leads.createdAt))
    .limit(30);

  // Find which of these have an outbound interaction
  const recentLeadIds = recentLeads.map((l) => l.id);
  let contactedIds = new Set<string>();
  if (recentLeadIds.length > 0) {
    const outboundInteractions = await db
      .select({ leadId: leadInteractions.leadId })
      .from(leadInteractions)
      .where(and(
        eq(leadInteractions.tenantId, tenantId),
        eq(leadInteractions.direction, "outbound"),
        // Only check for the recent leads
      ));
    contactedIds = new Set(outboundInteractions.map((i) => i.leadId));
  }

  const newUncontacted = recentLeads
    .filter((l) => !contactedIds.has(l.id))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      fullName: l.fullName,
      stage: l.stage,
      source: l.source,
      phone: l.phone,
      interestCourse: l.interestCourse,
      valueCents: l.valueCents,
      createdAt: l.createdAt,
      reason: "Nou, necontactat",
    }));

  // ─── 3. Follow-up needed (contacted/trial, no outbound > 2 days) ──────────
  const leadConditions3 = [
    eq(leads.tenantId, tenantId),
    or(eq(leads.stage, "contacted"), eq(leads.stage, "trial"))!,
  ];
  if (!isManager) {
    leadConditions3.push(eq(leads.assignedTo, userId));
  }

  const contactedTrialLeads = await db
    .select()
    .from(leads)
    .where(and(...leadConditions3))
    .orderBy(desc(leads.updatedAt))
    .limit(50);

  // Find latest outbound interaction per lead
  const contactedTrialIds = contactedTrialLeads.map((l) => l.id);
  const latestOutbound: Record<string, Date> = {};
  if (contactedTrialIds.length > 0) {
    const interactions = await db
      .select({
        leadId: leadInteractions.leadId,
        occurredAt: leadInteractions.occurredAt,
      })
      .from(leadInteractions)
      .where(and(
        eq(leadInteractions.tenantId, tenantId),
        eq(leadInteractions.direction, "outbound"),
        lt(leadInteractions.occurredAt, now)
      ))
      .orderBy(desc(leadInteractions.occurredAt));

    for (const i of interactions) {
      if (!latestOutbound[i.leadId]) {
        latestOutbound[i.leadId] = new Date(i.occurredAt);
      }
    }
  }

  const followUpNeeded = contactedTrialLeads
    .filter((l) => {
      const lastContact = latestOutbound[l.id];
      if (!lastContact) return true; // never contacted
      return lastContact < _2dAgo;
    })
    .slice(0, 10)
    .map((l) => {
      const lastContact = latestOutbound[l.id];
      const daysSince = lastContact
        ? Math.floor((now.getTime() - lastContact.getTime()) / 86400000)
        : null;
      return {
        id: l.id,
        fullName: l.fullName,
        stage: l.stage,
        phone: l.phone,
        interestCourse: l.interestCourse,
        valueCents: l.valueCents,
        updatedAt: l.updatedAt,
        reason: daysSince !== null ? `Fără contact ${daysSince}z` : "Niciodată contactat",
      };
    });

  // ─── 4. Next Best Action (top 5 by score desc, aging desc) ───────────────
  const alreadyShownIds = new Set([
    ...newUncontacted.map((l) => l.id),
    ...followUpNeeded.map((l) => l.id),
    ...dueTasks.map((t) => t.leadId),
  ]);

  const nbaConditions = [
    eq(leads.tenantId, tenantId),
    ne(leads.stage, "paid"),
    ne(leads.stage, "lost"),
  ];
  if (!isManager) {
    nbaConditions.push(
      or(eq(leads.assignedTo, userId), isNull(leads.assignedTo))!
    );
  }
  if (alreadyShownIds.size > 0) {
    nbaConditions.push(notInArray(leads.id, [...alreadyShownIds]));
  }

  const nbaLeads = await db
    .select()
    .from(leads)
    .where(and(...nbaConditions))
    .orderBy(desc(leads.score), asc(leads.createdAt))
    .limit(5);

  const nextBestAction = nbaLeads.map((l) => {
    const ageDays = Math.floor((now.getTime() - new Date(l.createdAt).getTime()) / 86400000);
    return {
      id: l.id,
      fullName: l.fullName,
      stage: l.stage,
      phone: l.phone,
      interestCourse: l.interestCourse,
      valueCents: l.valueCents,
      score: l.score,
      ageDays,
    };
  });

  // ─── Counter (for nav badge) ───────────────────────────────────────────────
  const totalActions = dueTasks.length + newUncontacted.length + followUpNeeded.length;

  return c.json({
    overdueOrDueToday: dueTasks,
    newUncontacted,
    followUpNeeded,
    nextBestAction,
    totalActions,
  });
});

export type TodayDashboardResponse = {
  overdueOrDueToday: {
    taskId: string;
    taskTitle: string;
    dueAt: Date | null;
    leadId: string;
    leadFullName: string;
    leadStage: string;
    leadPhone: string | null;
    leadInterestCourse: string | null;
    leadValueCents: number;
  }[];
  newUncontacted: {
    id: string;
    fullName: string;
    stage: string;
    source: string;
    phone: string | null;
    interestCourse: string | null;
    valueCents: number;
    createdAt: Date;
    reason: string;
  }[];
  followUpNeeded: {
    id: string;
    fullName: string;
    stage: string;
    phone: string | null;
    interestCourse: string | null;
    valueCents: number;
    updatedAt: Date;
    reason: string;
  }[];
  nextBestAction: {
    id: string;
    fullName: string;
    stage: string;
    phone: string | null;
    interestCourse: string | null;
    valueCents: number;
    score: number | null;
    ageDays: number;
  }[];
  totalActions: number;
};
