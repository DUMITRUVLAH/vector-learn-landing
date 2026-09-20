/**
 * CRM — rapoarte de vânzări, per agent și pe echipă.
 *
 * Agregarea trăiește în `server/lib/crm/reports.ts` (funcții pure, portate din
 * crm-vector). Aici e DOAR stratul de date: aduce rândurile workspace-ului,
 * le normalizează în forma pe care o așteaptă funcțiile pure, și întoarce tot
 * într-un SINGUR răspuns.
 *
 * De ce un singur răspuns și nu șapte endpointuri: pool-ul de conexiuni pe
 * Vercel e `max: 3` (server/db/client.ts). Șapte cereri pentru o pagină de
 * rapoarte ar sta la coadă una după alta.
 *
 * Izolarea pe workspace: FIECARE query de mai jos filtrează pe `tenantId`. Nu
 * există RLS în spate — dacă lipsește un filtru, un client vede cifrele altuia.
 *
 * Montat la /api/crm/reports.
 */
import { Hono } from "hono";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions } from "../db/schema/leads";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmProducts } from "../db/schema/crmProducts";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmKpiTargets } from "../db/schema/crmKpiTargets";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { ensureTenantStages } from "../lib/crm/stages";
import { callFunnel } from "../lib/crm/callOutcomes";
import { ensureTenantPipeline, leadsInPipeline } from "../lib/crm/pipelines";
import { parseSegmentFilters, segmentConditions } from "../lib/crm/segments";
import {
  salesKpis,
  stageConversion,
  averageCycleDays,
  perOwnerBreakdown,
  perProductBreakdown,
  lostReasonBreakdown,
  taskCompliance,
  kpiAttainment,
  funnelBreakdown,
  funnelByOwner,
  type FunnelLead,
  type FunnelStage,
  type ReportLead,
  type ReportTask,
  type ReportStage,
  type ReportInteraction,
  type StageChange,
  type KpiTargetRow,
  type DateRange,
  timeline,
  bucketSizeFor,
  inRange,
} from "../lib/crm/reports";

export const crmReportsRoutes = new Hono<{ Variables: AuthVariables }>();
crmReportsRoutes.use("/*", requireAuth);

/** Câte rânduri aducem cel mult. Un raport nu are voie să scoată baza din priză. */
const MAX_ROWS = 5000;

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

crmReportsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const from = c.req.query("from") ?? null;
  const to = c.req.query("to") ?? null;
  const owner = c.req.query("owner");
  const range: DateRange = { from, to };
  // Cât de fin se taie graficul de evoluție: zi / săptămână / lună, după lungimea perioadei.
  const bucketSize = bucketSizeFor(range);

  try {
    await ensureTenantStages(tenantId);

    const stageRows = await db
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId))
      .orderBy(crmPipelineStages.orderIndex);

    const leadRows = await db
      .select({
        id: leads.id,
        stage: leads.stage,
        assignedTo: leads.assignedTo,
        valueCents: leads.valueCents,
        createdAt: leads.createdAt,
        lostReason: leads.lostReason,
        interestCourse: leads.interestCourse,
        productId: leads.productId,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(MAX_ROWS);

    const leadIds = leadRows.map((l) => l.id);

    // Interacțiunile care contează pentru KPI: apeluri, întâlniri și tranzițiile
    // de etapă (din care se deduc „contracte semnate" și durata ciclului).
    const interactionRows = leadIds.length
      ? await db
          .select({
            leadId: leadInteractions.leadId,
            type: leadInteractions.type,
            occurredAt: leadInteractions.occurredAt,
            body: leadInteractions.body,
            metadata: leadInteractions.metadata,
          })
          .from(leadInteractions)
          .where(and(eq(leadInteractions.tenantId, tenantId), inArray(leadInteractions.leadId, leadIds)))
          .orderBy(desc(leadInteractions.occurredAt))
          .limit(MAX_ROWS * 4)
      : [];

    const taskRows = await db
      .select({
        id: crmLeadTasks.id,
        leadId: crmLeadTasks.leadId,
        assignedTo: crmLeadTasks.assignedTo,
        status: crmLeadTasks.status,
        dueAt: crmLeadTasks.dueAt,
        completedAt: crmLeadTasks.completedAt,
      })
      .from(crmLeadTasks)
      .where(eq(crmLeadTasks.tenantId, tenantId))
      .limit(MAX_ROWS);

    const productRows = await db
      .select({ id: crmProducts.id, name: crmProducts.name })
      .from(crmProducts)
      .where(eq(crmProducts.tenantId, tenantId));
    const productNameById = Object.fromEntries(productRows.map((p) => [p.id, p.name]));

    const memberRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    // Normele (CC-5). Lipsa tabelei nu are voie să rupă raportul: fără ea, ecranul arată exact
    // ca înainte — cifre fără grad de realizare.
    let targetRows: KpiTargetRow[] = [];
    try {
      targetRows = await db
        .select({
          userId: crmKpiTargets.userId,
          period: crmKpiTargets.period,
          metric: crmKpiTargets.metric,
          target: crmKpiTargets.target,
        })
        .from(crmKpiTargets)
        .where(eq(crmKpiTargets.tenantId, tenantId));
    } catch (err) {
      console.error("[crm/reports] normele nu s-au putut citi:", err instanceof Error ? err.message : err);
    }

    // ── Normalizare în forma așteptată de funcțiile pure ──────────────────────
    const reportLeads: ReportLead[] = leadRows.map((l) => ({
      id: l.id,
      stage: l.stage,
      assignedTo: l.assignedTo,
      valueCents: l.valueCents ?? 0,
      createdAt: iso(l.createdAt) ?? new Date(0).toISOString(),
      lostReason: l.lostReason,
      interestCourse: l.interestCourse,
      productId: l.productId,
    }));

    const reportTasks: ReportTask[] = taskRows.map((t) => ({
      id: t.id,
      leadId: t.leadId,
      assignedTo: t.assignedTo,
      status: t.status,
      dueAt: iso(t.dueAt),
      completedAt: iso(t.completedAt),
    }));

    const reportStages: ReportStage[] = stageRows.map((s) => ({
      key: s.key,
      label: s.label,
      orderIndex: s.orderIndex,
      isWon: s.isWon,
      isLost: s.isLost,
    }));

    const reportInteractions: ReportInteraction[] = [];
    const stageChanges: StageChange[] = [];
    for (const row of interactionRows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      if (row.type === "call" || row.type === "meeting") {
        reportInteractions.push({
          leadId: row.leadId,
          type: row.type,
          occurredAt: iso(row.occurredAt) ?? "",
          outcome: typeof meta.outcome === "string" ? meta.outcome : null,
        });
      } else if (row.type === "stage_change") {
        stageChanges.push({
          leadId: row.leadId,
          occurredAt: iso(row.occurredAt) ?? undefined,
          from: typeof meta.from === "string" ? meta.from : null,
          to: typeof meta.to === "string" ? meta.to : null,
        });
      }
    }

    const owners = memberRows.map((m) => ({ id: m.id, name: m.name ?? "—" }));

    const kpiValues = salesKpis(
      reportLeads,
      reportInteractions,
      reportTasks,
      stageChanges,
      reportStages,
      range,
      owner || undefined
    );

    /**
     * Perioada și agentul se aplică TUTUROR secțiunilor, nu doar plăcuțelor.
     *
     * Până acum `conversion`, `cycleDays`, `perProduct`, `lostReasons` și `taskCompliance`
     * primeau rândurile brute: alegeai „luna aceasta" și patru din șase tabele arătau, în tăcere,
     * datele dintotdeauna. Antetul paginii spunea o perioadă, conținutul alta — iar cine compara
     * două cifre de pe același ecran credea că sistemul greșește.
     */
    const ownerOfLead = new Map(reportLeads.map((l) => [l.id, l.assignedTo]));
    const ownedLead = (id: string | null | undefined) => !owner || (id != null && ownerOfLead.get(id) === owner);

    const scopedLeads = reportLeads.filter(
      (l) => (!owner || l.assignedTo === owner) && inRange(l.createdAt, range)
    );
    // Tranzițiile din perioadă, ale leadurilor agentului ales. `conversion` și `cycleDays` se
    // sprijină pe ele, deci „rata de conversie" devine a perioadei, nu a istoriei.
    const scopedChanges = stageChanges.filter((ch) => inRange(ch.occurredAt, range) && ownedLead(ch.leadId));
    const scopedTasks = reportTasks.filter((t) => !owner || t.assignedTo === owner);

    return c.json({
      range,
      owner: owner ?? null,
      stages: reportStages,
      owners,
      kpis: kpiValues,
      // Gradul de realizare față de normă (CC-5). Gol = fără normă setată SAU perioadă
      // nedefinită — interfața arată atunci cifra simplă, nu un 0% care ar acuza degeaba.
      attainment: kpiAttainment(kpiValues, targetRows, range, owner || undefined),
      targets: targetRows,
      conversion: stageConversion(scopedChanges, reportStages),
      cycleDays: averageCycleDays(reportLeads, scopedChanges, reportStages),
      perOwner: perOwnerBreakdown(reportLeads, reportInteractions, reportTasks, stageChanges, reportStages, range, owners),
      // Cu harta de nume, raportul grupează după PRODUSUL din catalog; textul liber
      // (`interest_course`) rămâne doar pentru leadurile cărora nu li s-a ales unul.
      perProduct: perProductBreakdown(scopedLeads, reportStages, productNameById),
      lostReasons: lostReasonBreakdown(reportLeads, {
        stageChanges: scopedChanges,
        stages: reportStages,
        range,
      }),
      taskCompliance: taskCompliance(scopedTasks),
      // Contactabilitatea (CC-6): apeluri → răspunsuri → decidenți. Pe o operațiune de outreach,
      // ăsta e raportul care spune dacă lista cumpărată face bani sau doar consumă timp.
      callFunnel: callFunnel(
        reportInteractions
          .filter((i) => i.type === "call" && inRange(i.occurredAt, range) && ownedLead(i.leadId))
          .map((i) => ({ leadId: i.leadId, outcome: i.outcome }))
      ),
      timeline: timeline(
        // Evoluția are nevoie de TOATE leadurile agentului (ca să lege o vânzare de valoarea ei),
        // dar numără doar ce cade în perioadă — filtrarea e înăuntru.
        owner ? reportLeads.filter((l) => l.assignedTo === owner) : reportLeads,
        scopedChanges,
        reportStages,
        range,
        bucketSize
      ),
      bucketSize,
    });
  } catch (e) {
    // Aceeași degradare ca la /pipeline: o schemă rămasă în urma codului nu are
    // voie să arate un dreptunghi roșu în locul paginii.
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|undefined_table|undefined_column/i.test(msg)) {
      console.error("[crm/reports] schemă incompletă:", msg);
      return c.json({ range, owner: owner ?? null, stages: [], owners: [], schemaLag: true }, 200);
    }
    throw e;
  }
});

// ─── GET /funnel — pâlnia ca pâlnie ─────────────────────────────────────────

/**
 * Pâlnia vizuală: pe fiecare etapă, banii din stânga și rata de cădere din dreapta, pentru
 * pâlnia și segmentul cerute.
 *
 * De ce o rută separată de `GET /` și nu încă o secțiune în răspunsul acela: raportul general
 * aduce taskuri, produse, motive de pierdere și evoluție — patru interogări pe care tabloul
 * pâlniei nu le folosește. Ecranul ăsta se deschide de câteva ori pe zi și se refiltrează des;
 * plata pentru date nefolosite s-ar simți la fiecare schimbare de filtru.
 *
 * Filtrele acceptate: `from`, `to`, `owner`, `pipelineId` + TOATE filtrele de segment
 * (`industry`, `region`, `companySize`, `productId`, `tag`, `cf_<cheie>`, praguri de consum).
 * Segmentarea pe rapoarte lipsea cu desăvârșire: se putea întreba „cum arată pâlnia", dar nu și
 * „cum arată pâlnia pentru industria alimentară" — deși exact pentru asta se importă coloanele.
 */
crmReportsRoutes.get("/funnel", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const query = c.req.query();
  const owner = query.owner || null;
  const range: DateRange = { from: query.from ?? null, to: query.to ?? null };

  try {
    await ensureTenantStages(tenantId);
    const pipeline = await ensureTenantPipeline(tenantId);
    const pipelineId = query.pipelineId || pipeline?.id || null;

    const stageRows = await db
      .select()
      .from(crmPipelineStages)
      .where(
        pipelineId
          ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, pipelineId))
          : eq(crmPipelineStages.tenantId, tenantId)
      )
      .orderBy(crmPipelineStages.orderIndex);

    const conditions = [eq(leads.tenantId, tenantId), isNull(leads.mergedIntoId)];
    if (pipelineId) {
      const cond = leadsInPipeline(pipelineId, pipelineId === pipeline?.id && Boolean(pipeline?.isDefault));
      if (cond) conditions.push(cond);
    }
    conditions.push(...segmentConditions(tenantId, parseSegmentFilters(query)));

    const leadRows = await db
      .select({
        id: leads.id,
        stage: leads.stage,
        assignedTo: leads.assignedTo,
        valueCents: leads.valueCents,
        createdAt: leads.createdAt,
        lostReason: leads.lostReason,
        interestCourse: leads.interestCourse,
        productId: leads.productId,
        probabilityPct: leads.probabilityPct,
      })
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(MAX_ROWS);

    // Perioada taie după DATA CREĂRII lead-ului: pâlnia răspunde la „ce am adus în intervalul
    // ăsta și unde a ajuns", nu la „ce s-a mișcat". A doua întrebare are deja răspuns în
    // `stageConversion` din raportul general.
    const inPeriod = leadRows.filter((l) => inRange(iso(l.createdAt), range));
    const scoped = owner ? inPeriod.filter((l) => l.assignedTo === owner) : inPeriod;

    const funnelLeads: FunnelLead[] = scoped.map((l) => ({
      id: l.id,
      stage: l.stage,
      assignedTo: l.assignedTo,
      valueCents: l.valueCents ?? 0,
      createdAt: iso(l.createdAt) ?? new Date(0).toISOString(),
      lostReason: l.lostReason,
      interestCourse: l.interestCourse,
      productId: l.productId,
      probabilityPct: l.probabilityPct,
    }));

    const leadIds = funnelLeads.map((l) => l.id);
    const changeRows = leadIds.length
      ? await db
          .select({
            leadId: leadInteractions.leadId,
            occurredAt: leadInteractions.occurredAt,
            metadata: leadInteractions.metadata,
          })
          .from(leadInteractions)
          .where(
            and(
              eq(leadInteractions.tenantId, tenantId),
              eq(leadInteractions.type, "stage_change"),
              inArray(leadInteractions.leadId, leadIds)
            )
          )
          .limit(MAX_ROWS * 4)
      : [];

    const changes: StageChange[] = changeRows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        leadId: row.leadId,
        occurredAt: iso(row.occurredAt) ?? undefined,
        from: typeof meta.from === "string" ? meta.from : null,
        to: typeof meta.to === "string" ? meta.to : null,
      };
    });

    const funnelStages: FunnelStage[] = stageRows.map((s) => ({
      key: s.key,
      label: s.label,
      orderIndex: s.orderIndex,
      isWon: s.isWon,
      isLost: s.isLost,
      color: s.color,
      probabilityPct: s.probabilityPct,
    }));

    const memberRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    // Pâlnia pe fiecare agent: doar pentru cei care CHIAR au leaduri în segment — o coloană
    // goală per coleg ar îneca exact comparația pentru care există secțiunea.
    const ownersWithLeads = [...new Set(funnelLeads.map((l) => l.assignedTo).filter((id): id is string => !!id))];

    return c.json({
      pipelineId,
      range,
      owner,
      totalLeads: funnelLeads.length,
      stages: funnelBreakdown(funnelLeads, funnelStages, changes),
      byOwner: ownersWithLeads.map((id) => ({
        userId: id,
        name: memberRows.find((m) => m.id === id)?.name ?? memberRows.find((m) => m.id === id)?.email ?? "—",
        stages: funnelByOwner(funnelLeads, funnelStages, changes, id),
      })),
      owners: memberRows.map((m) => ({ id: m.id, name: m.name ?? m.email })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|undefined_table|undefined_column/i.test(msg)) {
      console.error("[crm/reports] pâlnie — schemă incompletă:", msg);
      return c.json({ stages: [], byOwner: [], owners: [], totalLeads: 0, schemaLag: true }, 200);
    }
    throw e;
  }
});
