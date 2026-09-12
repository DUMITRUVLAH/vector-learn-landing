/**
 * Fluxul de activitate PAR pentru tabloul de bord — GET /api/par/activity
 *
 * Un workspace care are DOAR modulul PAR nu are ce face cu un dashboard de finanțe: vrea să
 * vadă ce s-a mișcat de când n-a mai intrat — cine a comentat, cine a trimis o cerere, ce s-a
 * aprobat. Comentariile NU scriu în `par_audit`, deci un singur feed le adună din ambele
 * surse și le ordonează după timp.
 *
 * Vizibilitatea repetă EXACT regulile listei de cereri (GET /api/par): organizațiile cu modulul
 * activ, apoi aria de acces (proiect/plătitor), iar cine n-are rol de aprobator/finanțe/admin
 * vede doar propriile cereri. Un feed de activitate care sare peste scope ar fi cea mai ieftină
 * scurgere de date din produs.
 *
 * Montat în app.ts ÎNAINTEA lui `parRoutes`, ca „activity" să nu fie prins de `/:id`.
 */
import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lte, ne, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { parAudit, parComments, parPayers, parProjects, parRequests } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";
import { accessiblePayerIds, accessibleProjectIds, accessibleScopes } from "../lib/par/projectScope";
import { isWorkspaceAdminRole } from "../lib/par/roles";

export const parActivityRoutes = new Hono<{ Variables: AuthVariables }>();
parActivityRoutes.use("*", requireAuth);

/** Evenimentele care merită atenția cuiva pe tabloul de bord; restul sunt zgomot de audit. */
const NOTABLE_EVENTS = ["submitted", "approved", "rejected", "changes_requested", "paid", "reopened", "withdrawn", "payment_reverted", "finance_returned"];

const NEVER = "00000000-0000-0000-0000-000000000000";

/**
 * Condițiile de vizibilitate peste `par_requests`, identice cu cele din lista de cereri.
 * Întoarce null când utilizatorul nu poate vedea nicio cerere (nicio organizație cu PAR activ).
 */
async function visibilityConditions(
  userId: string,
  tenantId: string,
  tenantRole: string,
): Promise<SQL[] | null> {
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  if (entitledPayers.length === 0) return null;
  const conditions: SQL[] = [
    eq(parRequests.tenantId, tenantId),
    inArray(parRequests.payerId, entitledPayers),
  ];

  const roles = await getUserPARRoles(userId, tenantId);
  const hasElevatedRole = roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!hasElevatedRole) {
    conditions.push(eq(parRequests.requestedByUserId, userId));
  } else if (!isWorkspaceAdminRole(tenantRole)) {
    // Ciornele altora rămân private, la fel ca în listă.
    const notOthersDraft = or(ne(parRequests.status, "draft"), eq(parRequests.requestedByUserId, userId));
    if (notOthersDraft) conditions.push(notOthersDraft);
  }

  const { projects: scopedProjects, payers: scopedPayers } = await accessibleScopes(userId, tenantId, tenantRole);
  if (scopedProjects !== null) {
    conditions.push(scopedProjects.length ? inArray(parRequests.projectId, scopedProjects) : eq(parRequests.projectId, NEVER));
  }
  if (scopedPayers !== null) {
    conditions.push(scopedPayers.length ? inArray(parRequests.payerId, scopedPayers) : eq(parRequests.payerId, NEVER));
  }
  return conditions;
}

export interface ParActivityItem {
  id: string;
  kind: "comment" | "event";
  /** Numele evenimentului de audit; null pentru comentarii. */
  event: string | null;
  /** Corpul comentariului sau detaliul evenimentului. */
  text: string | null;
  createdAt: string;
  actorName: string | null;
  parId: string | null;
  requestNo: string | null;
  payerName: string | null;
  projectName: string | null;
}

/** GET /api/par/activity?limit=8 — ultimele comentarii + evenimente notabile, amestecate. */
parActivityRoutes.get("/", async (c) => {
  const user = c.get("user");
  // VM5-09: feedul de pe tabloul de bord arată ultimele 8; ecranul „Activitatea" cere mai multe,
  // filtrate pe o persoană și pe un interval. Plafonul rămâne, ca o cerere să nu poată trage tot
  // jurnalul organizației dintr-o dată.
  const limit = Math.min(300, Math.max(1, Number(c.req.query("limit") ?? "8") || 8));
  const actorUserId = c.req.query("actor_user_id") || null;
  const from = c.req.query("from") ? new Date(c.req.query("from")!) : null;
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : null;
  // Ziua „până la" se citește inclusiv: cine scrie 12.09 vrea și ce s-a întâmplat pe 12.09.
  if (to && !isNaN(to.getTime())) to.setHours(23, 59, 59, 999);

  const conditions = await visibilityConditions(user.id, user.tenantId, user.role);
  if (!conditions) return c.json({ items: [] as ParActivityItem[] });
  const visible = and(...conditions);

  /**
   * Filtrele de persoană și de interval se aplică pe AMBELE surse (comentarii și jurnal), altfel
   * „ce a făcut Iulian în septembrie" ar întoarce comentariile tuturor.
   */
  const actorFilter = (col: AnyPgColumn) => (actorUserId ? eq(col, actorUserId) : undefined);
  const dateFilter = (col: AnyPgColumn) => {
    const parts: SQL[] = [];
    if (from && !isNaN(from.getTime())) parts.push(gte(col, from));
    if (to && !isNaN(to.getTime())) parts.push(lte(col, to));
    return parts.length ? and(...parts) : undefined;
  };

  const [comments, events] = await Promise.all([
    db
      .select({
        id: parComments.id,
        body: parComments.body,
        createdAt: parComments.createdAt,
        actorName: users.name,
        parId: parRequests.id,
        requestNo: parRequests.requestNo,
        payerName: parPayers.name,
        projectName: parProjects.name,
      })
      .from(parComments)
      .innerJoin(parRequests, eq(parRequests.id, parComments.parId))
      .leftJoin(users, eq(users.id, parComments.authorUserId))
      .leftJoin(parPayers, eq(parPayers.id, parRequests.payerId))
      .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
      .where(and(eq(parComments.tenantId, user.tenantId), visible, actorFilter(parComments.authorUserId), dateFilter(parComments.createdAt)))
      .orderBy(desc(parComments.createdAt))
      .limit(limit),
    db
      .select({
        id: parAudit.id,
        event: parAudit.event,
        detail: parAudit.detail,
        createdAt: parAudit.createdAt,
        actorName: users.name,
        parId: parRequests.id,
        requestNo: parRequests.requestNo,
        payerName: parPayers.name,
        projectName: parProjects.name,
      })
      .from(parAudit)
      .innerJoin(parRequests, eq(parRequests.id, parAudit.parId))
      .leftJoin(users, eq(users.id, parAudit.actorUserId))
      .leftJoin(parPayers, eq(parPayers.id, parRequests.payerId))
      .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
      .where(and(eq(parAudit.tenantId, user.tenantId), inArray(parAudit.event, NOTABLE_EVENTS), visible, actorFilter(parAudit.actorUserId), dateFilter(parAudit.createdAt)))
      .orderBy(desc(parAudit.createdAt))
      .limit(limit),
  ]);

  const items: ParActivityItem[] = [
    ...comments.map((row) => ({
      id: `c_${row.id}`,
      kind: "comment" as const,
      event: null,
      text: row.body,
      createdAt: row.createdAt.toISOString(),
      actorName: row.actorName ?? null,
      parId: row.parId,
      requestNo: row.requestNo,
      payerName: row.payerName ?? null,
      projectName: row.projectName ?? null,
    })),
    ...events.map((row) => ({
      id: `e_${row.id}`,
      kind: "event" as const,
      event: row.event,
      text: row.detail ?? null,
      createdAt: row.createdAt.toISOString(),
      actorName: row.actorName ?? null,
      parId: row.parId,
      requestNo: row.requestNo,
      payerName: row.payerName ?? null,
      projectName: row.projectName ?? null,
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);

  return c.json({ items });
});
