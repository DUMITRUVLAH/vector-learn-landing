/**
 * CRM — normele de activitate ale agenților.
 *
 * Rapoartele măsurau deja apeluri, contacte reușite, întâlniri, oferte, contracte și valoare.
 * Lipsea ȚINTA — iar fără ea, cifra „43 de apeluri" nu spune nimic: e bine sau e catastrofal?
 * Un manager de call-center caută exact răspunsul celălalt: „43 din 60, adică 72%".
 *
 * Model:
 *  - o normă e (indicator, perioadă, țintă), pusă fie pe un OM, fie pe tot workspace-ul;
 *  - norma personală bate norma generală; lipsa amândurora înseamnă „fără normă", iar raportul
 *    arată atunci cifra goală, ca până acum — NU un 0%, care ar acuza pe nedrept;
 *  - ținta e „pe săptămână" sau „pe lună"; raportul o scalează la perioada aleasă (vezi
 *    `attainment` în `server/lib/crm/reports.ts`).
 *
 * Montat la /api/crm/kpi-targets.
 *
 * GET    /                 — normele workspace-ului (generale + personale)
 * PUT    /                 — pune/actualizează o normă (`target: 0` o șterge)
 * DELETE /:id              — scoate o normă
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { crmKpiTargets, KPI_TARGET_METRICS, KPI_TARGET_PERIODS } from "../db/schema/crmKpiTargets";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { logCrmAudit } from "../lib/crm/audit";

export const crmKpiTargetsRoutes = new Hono<{ Variables: AuthVariables }>();
crmKpiTargetsRoutes.use("/*", requireAuth);
// Normele sunt o decizie de management: oricine le poate CITI (agentul trebuie să-și știe ținta),
// dar numai cine administrează repartizarea le poate schimba.
crmKpiTargetsRoutes.put("/*", requireCrmPermission("assignment.manage"));
crmKpiTargetsRoutes.delete("/*", requireCrmPermission("assignment.manage"));

const putSchema = z.object({
  /** `null` = norma generală a workspace-ului. */
  userId: z.string().uuid().nullish(),
  period: z.enum(KPI_TARGET_PERIODS).default("week"),
  metric: z.enum(KPI_TARGET_METRICS),
  /** 0 înseamnă „fără normă" și ȘTERGE rândul — altfel un 0 salvat ar arăta veșnic 0%. */
  target: z.number().int().min(0).max(100_000_000),
});

function isMissingSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|undefined_table|undefined_column/i.test(msg);
}

crmKpiTargetsRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmKpiTargets)
      .where(eq(crmKpiTargets.tenantId, user.tenantId))
      .orderBy(asc(crmKpiTargets.metric));
    return c.json({ items });
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    // Fără normele astea, raportul arată exact ca înainte de CC-5. Nu e motiv de 500.
    console.error("[crm/kpi-targets] schemă în urma codului:", err);
    return c.json({ items: [], schemaLag: true });
  }
});

crmKpiTargetsRoutes.put("/", zValidator("json", putSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Un id de utilizator din alt workspace ar pune norma pe omul altcuiva — și, mai rău, ar face-o
  // invizibilă aici, deci imposibil de șters din interfață.
  if (body.userId) {
    const [member] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, body.userId), eq(users.tenantId, user.tenantId)));
    if (!member) return c.json({ error: "unknown_member" }, 400);
  }

  const scope = and(
    eq(crmKpiTargets.tenantId, user.tenantId),
    body.userId ? eq(crmKpiTargets.userId, body.userId) : isNull(crmKpiTargets.userId),
    eq(crmKpiTargets.period, body.period),
    eq(crmKpiTargets.metric, body.metric)
  );

  const [existing] = await db.select().from(crmKpiTargets).where(scope);

  if (body.target === 0) {
    if (existing) {
      await db.delete(crmKpiTargets).where(eq(crmKpiTargets.id, existing.id));
      await logCrmAudit({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "kpi_target.removed",
        target: "crm_kpi_target",
        targetId: existing.id,
        before: { metric: existing.metric, period: existing.period, target: existing.target },
      });
    }
    return c.json({ ok: true, removed: true });
  }

  // Upsert „citește, apoi scrie" și nu `onConflictDoUpdate`: cheia unică e un index PARȚIAL
  // (două, de fapt), iar `ON CONFLICT` pe indexuri parțiale cere numirea lor exactă — o legătură
  // fragilă între cod și numele unui index din migrare.
  const row = existing
    ? (
        await db
          .update(crmKpiTargets)
          .set({ target: body.target, updatedAt: new Date() })
          .where(eq(crmKpiTargets.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(crmKpiTargets)
          .values({
            tenantId: user.tenantId,
            userId: body.userId ?? null,
            period: body.period,
            metric: body.metric,
            target: body.target,
          })
          .returning()
      )[0];

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: existing ? "kpi_target.updated" : "kpi_target.created",
    target: "crm_kpi_target",
    targetId: row.id,
    before: existing ? { target: existing.target } : null,
    after: { metric: row.metric, period: row.period, target: row.target, userId: row.userId },
  });

  return c.json(row, existing ? 200 : 201);
});

crmKpiTargetsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [removed] = await db
    .delete(crmKpiTargets)
    .where(and(eq(crmKpiTargets.id, id), eq(crmKpiTargets.tenantId, user.tenantId)))
    .returning();
  if (!removed) return c.json({ error: "not_found" }, 404);
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "kpi_target.removed",
    target: "crm_kpi_target",
    targetId: id,
    before: { metric: removed.metric, period: removed.period, target: removed.target },
  });
  return c.json({ ok: true });
});
