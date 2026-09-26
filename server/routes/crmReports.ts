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
  bucketKey,
  inRange,
} from "../lib/crm/reports";
import {
  dealOutcomes,
  previousRange,
  sourceBreakdown,
  openDealAging,
  stageVelocity,
  ownerOutcomes,
  lostTimeline,
  type InsightLead,
} from "../lib/crm/salesInsights";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmCompanies } from "../db/schema/crmCompanies";
import { customFields, leadFieldValues } from "../db/schema/leads";
import { crmReportLayouts } from "../db/schema/crmReportLayouts";
import {
  buildInsights,
  segmentDimensions,
  type SegmentDimensionDef,
  type SegmentLead,
} from "../lib/crm/reportSegments";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

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
  /**
   * CRM-G02 — raportul e AL UNEI PÂLNII. Până acum amesteca etapele tuturor pâlniilor ordonate
   * după `orderIndex`, deci „conversia" lega „Lead nou" din Vânzări de „A cerut detalii" din
   * Cursuri deschise — un lanț de 23 de treceri fără sens, cu „au avansat" 0 aproape peste tot.
   * Implicit: pâlnia implicită. `pipelineId=all` = toată baza (fără secțiunea de pâlnie).
   */
  const pipelineParam = c.req.query("pipelineId") ?? null;
  const range: DateRange = { from, to };
  // Cât de fin se taie graficul de evoluție: zi / săptămână / lună, după lungimea perioadei.
  const bucketSize = bucketSizeFor(range);

  try {
    await ensureTenantStages(tenantId);
    const defaultPipeline = await ensureTenantPipeline(tenantId);
    let pipelineRows: { id: string; name: string; isDefault: boolean }[] = [];
    try {
      pipelineRows = await db
        .select({ id: crmPipelines.id, name: crmPipelines.name, isDefault: crmPipelines.isDefault })
        .from(crmPipelines)
        .where(eq(crmPipelines.tenantId, tenantId))
        .orderBy(crmPipelines.orderIndex);
    } catch (err) {
      console.error("[crm/reports] pâlniile nu s-au putut citi:", err instanceof Error ? err.message : err);
    }
    // Un id străin (alt workspace, pâlnie ștearsă) cade pe implicita, nu pe „toată baza".
    const pipelineId =
      pipelineParam === "all"
        ? null
        : pipelineRows.some((p) => p.id === pipelineParam)
          ? pipelineParam
          : defaultPipeline?.id ?? null;
    const isDefaultPipeline = !!pipelineId && pipelineId === defaultPipeline?.id;

    const stageRows = await db
      .select()
      .from(crmPipelineStages)
      .where(
        pipelineId
          ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, pipelineId))
          : eq(crmPipelineStages.tenantId, tenantId)
      )
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
        source: leads.source,
        fullName: leads.fullName,
        company: leads.company,
        dealName: leads.dealName,
        probabilityPct: leads.probabilityPct,
        companyId: leads.companyId,
      })
      .from(leads)
      .where(
        pipelineId
          ? and(eq(leads.tenantId, tenantId), leadsInPipeline(pipelineId, isDefaultPipeline))
          : eq(leads.tenantId, tenantId)
      )
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
    /** Ultimul semn de viață al fiecărui lead — orice interacțiune, nu doar apelurile. */
    const lastActivityAt = new Map<string, string>();
    for (const row of interactionRows) {
      const at = iso(row.occurredAt);
      if (at && (!lastActivityAt.has(row.leadId) || at > (lastActivityAt.get(row.leadId) as string))) {
        lastActivityAt.set(row.leadId, at);
      }
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

    // ── CRM-G02: rezultate, comparație, surse, stagnare, viteză ──────────────
    const insightLeads: InsightLead[] = leadRows.map((l) => ({
      id: l.id,
      stage: l.stage,
      assignedTo: l.assignedTo,
      valueCents: l.valueCents ?? 0,
      createdAt: iso(l.createdAt) ?? new Date(0).toISOString(),
      source: l.source,
      fullName: l.fullName,
      company: l.company,
      dealName: l.dealName,
    }));
    const ownedInsightLeads = owner ? insightLeads.filter((l) => l.assignedTo === owner) : insightLeads;
    const ownedChanges = stageChanges.filter((ch) => ownedLead(ch.leadId));
    const prevRange = previousRange(range);
    const outcomes = dealOutcomes(insightLeads, stageChanges, reportStages, range, owner || undefined);
    const previous = prevRange
      ? {
          range: prevRange,
          kpis: salesKpis(reportLeads, reportInteractions, reportTasks, stageChanges, reportStages, prevRange, owner || undefined),
          outcomes: dealOutcomes(insightLeads, stageChanges, reportStages, prevRange, owner || undefined),
          cycleDays: averageCycleDays(
            reportLeads,
            stageChanges.filter((ch) => inRange(ch.occurredAt, prevRange) && ownedLead(ch.leadId)),
            reportStages
          ),
        }
      : null;

    const ownedReportLeads = owner ? reportLeads.filter((l) => l.assignedTo === owner) : reportLeads;
    const lostPerBucket = lostTimeline(ownedChanges, reportStages, range, (at) => bucketKey(at, bucketSize));
    const currentTimeline = timeline(ownedReportLeads, scopedChanges, reportStages, range, bucketSize);
    // Zilele fără nicio pierdere n-au găleată în `timeline`; le adăugăm, altfel graficul ar sări
    // peste exact zilele în care s-a pierdut ceva fără să se câștige.
    const tlByKey = new Map(currentTimeline.map((b) => [b.bucket, { ...b, lostCount: 0 }]));
    for (const [key, n] of lostPerBucket) {
      const b = tlByKey.get(key) ?? { bucket: key, leadsCreated: 0, offersSent: 0, contractsSigned: 0, salesValueCents: 0, lostCount: 0 };
      b.lostCount = n;
      tlByKey.set(key, b);
    }
    const fullTimeline = [...tlByKey.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
    const previousTimeline = prevRange
      ? timeline(
          ownedReportLeads,
          stageChanges.filter((ch) => inRange(ch.occurredAt, prevRange) && ownedLead(ch.leadId)),
          reportStages,
          prevRange,
          bucketSize
        )
      : [];

    // Pâlnia are sens doar pe O pâlnie: pe „toată baza" etapele a patru procese nu formează lanț.
    const funnel = pipelineId
      ? funnelBreakdown(
          leadRows
            .filter((l) => !owner || l.assignedTo === owner)
            .map((l) => ({
              id: l.id,
              stage: l.stage,
              assignedTo: l.assignedTo,
              valueCents: l.valueCents ?? 0,
              createdAt: iso(l.createdAt) ?? new Date(0).toISOString(),
              lostReason: l.lostReason,
              interestCourse: l.interestCourse,
              probabilityPct: l.probabilityPct,
            })),
          stageRows.map((st) => ({
            key: st.key,
            label: st.label,
            orderIndex: st.orderIndex,
            isWon: st.isWon,
            isLost: st.isLost,
            color: st.color,
            probabilityPct: st.probabilityPct,
          })),
          ownedChanges
        )
      : [];
    const velocity = pipelineId ? stageVelocity(ownedInsightLeads, ownedChanges, reportStages) : [];

    // ── CRM-G09: raportul pe segment + insighturile ──────────────────────────
    const segments = await loadSegments({
      tenantId,
      leadRows: owner ? leadRows.filter((l) => l.assignedTo === owner) : leadRows,
      productNameById,
      owners,
    });
    const dimensions = segmentDimensions(segments.leads, reportStages, range, segments.defs);
    const aging = openDealAging(ownedInsightLeads, reportStages, lastActivityAt);
    const leaderboard = ownerOutcomes(insightLeads, stageChanges, reportStages, range, owners);
    const lostReasons = lostReasonBreakdown(reportLeads, { stageChanges: scopedChanges, stages: reportStages, range });
    const insights = buildInsights({
      // Pe un singur agent, „cel mai bun vânzător" n-are cu cine se compara.
      leaderboard: owner ? [] : leaderboard,
      dimensions,
      funnel,
      aging,
      lostReasons,
      sales: { currentCents: outcomes.wonValueCents, previousCents: previous ? previous.outcomes.wonValueCents : null },
    });

    return c.json({
      range,
      owner: owner ?? null,
      pipelineId,
      pipelines: pipelineRows,
      stages: reportStages,
      owners,
      kpis: kpiValues,
      outcomes,
      previous,
      funnel,
      velocity,
      sources: sourceBreakdown(ownedInsightLeads, reportStages, range),
      aging,
      leaderboard,
      dimensions,
      insights,
      previousTimeline,
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
      lostReasons,
      taskCompliance: taskCompliance(scopedTasks),
      // Contactabilitatea (CC-6): apeluri → răspunsuri → decidenți. Pe o operațiune de outreach,
      // ăsta e raportul care spune dacă lista cumpărată face bani sau doar consumă timp.
      callFunnel: callFunnel(
        reportInteractions
          .filter((i) => i.type === "call" && inRange(i.occurredAt, range) && ownedLead(i.leadId))
          .map((i) => ({ leadId: i.leadId, outcome: i.outcome }))
      ),
      // Evoluția are nevoie de TOATE leadurile agentului (ca să lege o vânzare de valoarea ei),
      // dar numără doar ce cade în perioadă — filtrarea e înăuntru. Plus pierderile, pe aceeași axă.
      timeline: fullTimeline,
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

// ─── CRM-G09: segmentele raportului ──────────────────────────────────────────

interface SegmentSourceRow {
  id: string;
  stage: string;
  assignedTo: string | null;
  valueCents: number | null;
  createdAt: Date | string | null;
  source: string | null;
  productId: string | null;
  interestCourse: string | null;
  companyId: string | null;
}

/**
 * Leadurile raportului cu TOATE dimensiunile rezolvate: produsul pe nume, firmografia din firma
 * leadului, câmpurile personalizate (text/listă — numerele nu se segmentează pe valoare exactă).
 *
 * Fiecare citire suplimentară e opțională: o tabelă lipsă pe prod (migrare neaplicată) scoate
 * dimensiunea ei din raport, nu raportul întreg.
 */
async function loadSegments(args: {
  tenantId: string;
  leadRows: SegmentSourceRow[];
  productNameById: Record<string, string>;
  owners: { id: string; name: string }[];
}): Promise<{ leads: SegmentLead[]; defs: SegmentDimensionDef[] }> {
  const { tenantId, leadRows, productNameById } = args;
  const defs: SegmentDimensionDef[] = [
    { key: "source", label: "Sursă", kind: "builtin" },
    { key: "owner", label: "Agent", kind: "builtin" },
    { key: "product", label: "Produs", kind: "builtin" },
    { key: "industry", label: "Industrie", kind: "builtin" },
    { key: "region", label: "Regiune", kind: "builtin" },
    { key: "companySize", label: "Mărimea firmei", kind: "builtin" },
  ];

  const companyIds = [...new Set(leadRows.map((l) => l.companyId).filter((id): id is string => !!id))];
  const companyById = new Map<string, { industry: string | null; region: string | null; companySize: string | null }>();
  if (companyIds.length) {
    try {
      const rows = await db
        .select({ id: crmCompanies.id, industry: crmCompanies.industry, region: crmCompanies.region, companySize: crmCompanies.companySize })
        .from(crmCompanies)
        .where(and(eq(crmCompanies.tenantId, tenantId), inArray(crmCompanies.id, companyIds)));
      for (const r of rows) companyById.set(r.id, r);
    } catch (err) {
      console.error("[crm/reports] firmele nu s-au putut citi:", err instanceof Error ? err.message : err);
    }
  }

  const leadIds = leadRows.map((l) => l.id);
  const customByLead = new Map<string, Record<string, string>>();
  if (leadIds.length) {
    try {
      const fields = await db
        .select({ id: customFields.id, key: customFields.key, label: customFields.label, type: customFields.type })
        .from(customFields)
        .where(eq(customFields.tenantId, tenantId))
        .orderBy(customFields.orderIndex);
      const usable = fields.filter((f) => f.type !== "number");
      if (usable.length) {
        const keyByField = new Map(usable.map((f) => [f.id, `cf_${f.key}`]));
        const values = await db
          .select({ leadId: leadFieldValues.leadId, fieldId: leadFieldValues.fieldId, value: leadFieldValues.value })
          .from(leadFieldValues)
          .where(
            and(
              eq(leadFieldValues.tenantId, tenantId),
              inArray(leadFieldValues.fieldId, usable.map((f) => f.id)),
              inArray(leadFieldValues.leadId, leadIds)
            )
          )
          .limit(MAX_ROWS * 10);
        for (const v of values) {
          const key = keyByField.get(v.fieldId);
          if (!key || !v.value) continue;
          const bag = customByLead.get(v.leadId) ?? {};
          bag[key] = v.value;
          customByLead.set(v.leadId, bag);
        }
        for (const f of usable) defs.push({ key: `cf_${f.key}`, label: f.label, kind: "custom" });
      }
    } catch (err) {
      console.error("[crm/reports] câmpurile personalizate nu s-au putut citi:", err instanceof Error ? err.message : err);
    }
  }

  const leads: SegmentLead[] = leadRows.map((l) => {
    const company = l.companyId ? companyById.get(l.companyId) : undefined;
    return {
      id: l.id,
      stage: l.stage,
      assignedTo: l.assignedTo,
      valueCents: l.valueCents ?? 0,
      createdAt: iso(l.createdAt) ?? new Date(0).toISOString(),
      values: {
        source: l.source,
        owner: l.assignedTo,
        product: (l.productId && productNameById[l.productId]) || l.interestCourse,
        industry: company?.industry ?? null,
        region: company?.region ?? null,
        companySize: company?.companySize ?? null,
        ...customByLead.get(l.id),
      },
    };
  });
  return { leads, defs };
}

// ─── CRM-G09: aranjamentul personal al rapoartelor ───────────────────────────

const key = z.string().trim().min(1).max(64);
const layoutSchema = z.object({
  order: z.array(key).max(40).optional(),
  hidden: z.array(key).max(40).optional(),
  hiddenMetrics: z.array(key).max(20).optional(),
  segmentDimension: key.nullable().optional(),
});

const missingTable = (err: unknown) => /does not exist|undefined_table/i.test(err instanceof Error ? err.message : String(err));

crmReportsRoutes.get("/layout", async (c) => {
  const user = c.get("user");
  try {
    const [row] = await db
      .select({ layout: crmReportLayouts.layout })
      .from(crmReportLayouts)
      .where(and(eq(crmReportLayouts.tenantId, user.tenantId), eq(crmReportLayouts.userId, user.id)))
      .limit(1);
    return c.json({ layout: row?.layout ?? null });
  } catch (err) {
    // Tabela încă neaplicată pe prod: ecranul arată aranjamentul implicit, nu o eroare.
    if (missingTable(err)) return c.json({ layout: null });
    throw err;
  }
});

crmReportsRoutes.put("/layout", zValidator("json", layoutSchema), async (c) => {
  const user = c.get("user");
  const layout = c.req.valid("json");
  try {
    await db
      .insert(crmReportLayouts)
      .values({ tenantId: user.tenantId, userId: user.id, layout, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [crmReportLayouts.tenantId, crmReportLayouts.userId],
        set: { layout, updatedAt: new Date() },
      });
    return c.json({ layout, saved: true });
  } catch (err) {
    if (missingTable(err)) return c.json({ layout, saved: false }, 503);
    throw err;
  }
});
