/**
 * PAR-112: Finance queue (section 16) + PAR-113: Payment execution + 10% overage rule
 *
 * Routes:
 *   GET  /api/par/finance                         → finance queue (approved execute_payment + in_finance + reapproval_required)
 *   POST /api/par/:id/finance                     → write section 16; PAR → in_finance
 *   POST /api/par/:id/pay                         → record actual payment; 10% rule; PAR → paid or reapproval_required
 *   GET  /api/par/payment-proofs                  → VM4-04: plăți fără ordin de plată în dosar
 *   POST /api/par/dosare.zip                      → dosarele mai multor cereri, într-un singur zip
 *   POST /api/par/:id/unpay                       → VM4-01: anulează plata înregistrată din greșeală; PAR → in_finance
 *   POST /api/par/:id/finance-return              → VM4-02: finanțele refuză plata; PAR → changes_requested
 *   POST /api/par/:id/finance-archive             → VM4-05: scoate cererea din coada de lucru (arhivă)
 *   POST /api/par/:id/finance-unarchive           → VM4-05: readuce cererea arhivată în coadă
 *
 * Note: POST /api/par/:id/reapprove lives in parApprovals.ts (it's an approval action).
 *
 * CORE: backlog/par/PAR-CORE.md §0.16, §3 (10% rule), §4 (state machine), §9
 * Mounted in server/app.ts: app.route("/api/par", parPaymentsRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parPayments,
  parAudit,
  parSettings,
  parApprovals,
  parVendors,
  parProjects,
  parBudgetCodes,
  parAttachments,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { notifyPaid, notifyPaymentReverted, notifyFinanceReturned, notifyReapprovalRequired, notifyPriorApprovers } from "../services/par/notify";
import { applyTenRule } from "../lib/par/payment";
import { evaluateMatch } from "../lib/par/threeWayMatch";
import { findVendorByIban, shouldAutoSaveVendor } from "../lib/par/vendorAutoSave";
import { accessiblePayerIds, accessibleProjectIds, accessibleScopes, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";
import { buildBodyForHash } from "../lib/par/submit";
import {
  FINANCE_ARCHIVE_EVENT,
  FINANCE_QUEUE_STATUSES,
  FINANCE_RETURN_EVENT,
  FINANCE_UNARCHIVE_EVENT,
  belongsInFinanceQueue,
  financeArchiveDiff,
  financeArchiveNote,
  financeReturnReason,
  isArchivedFromFinanceQueue,
  isFinanceReturnedStatus,
} from "../lib/par/financeQueue";
import { verifyParBodyHash } from "../lib/par/integrity";
import { paymentDestination, pickDocumentRef } from "../lib/par/documentRef";
import { buildDosar } from "../lib/par/buildDosar";
import { canViewPar } from "../lib/par/visibility";
import { contentDisposition } from "../lib/http/contentDisposition";
import { DOSARE_ZIP_MAX } from "../../src/lib/par/dosarBatch";

export const parPaymentsRoutes = new Hono<{ Variables: AuthVariables }>();
parPaymentsRoutes.use("*", requireAuth);
// „/:id/:action/*" și NU „/:id/*": ruta soră `/finance` e dintr-un singur segment, iar Hono o
// lasă să se potrivească peste `/:id/*` (wildcard-ul acceptă și gol) — coada de finanțe ar
// răspunde 404 cu id="finance".
parPaymentsRoutes.use("/:id/:action/*", parUuidGuard("id"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAudit(params: {
  tenantId: string;
  parId: string;
  actorUserId: string;
  event: string;
  detail?: string;
  /** JSON — starea de dinainte/după, pentru evenimentele care au nevoie de ea (vezi arhivarea). */
  diff?: string;
}) {
  await db.insert(parAudit).values({
    tenantId: params.tenantId,
    parId: params.parId,
    actorUserId: params.actorUserId,
    event: params.event,
    detail: params.detail ?? null,
    diff: params.diff ?? null,
  });
}

/**
 * VM1-05 — auto-save the payee into the reusable vendor registry once a PAR is paid.
 * Violeta: "odată ce va fi plată pentru un anumit prestator, dacă a fost adăugat IBAN
 * și alte chestii, să se autosalveze".
 *
 * Only runs for an inline payee (no vendorId yet) that has an IBAN — the IBAN is the
 * thing worth remembering for next time. Dedup by IBAN within the tenant (no duplicates);
 * if a vendor already exists, link it and backfill any missing details. Best-effort:
 * never throws — the payment has already been recorded by the time this runs.
 * The dedup/normalization logic lives in ../lib/par/vendorAutoSave (unit-tested).
 */
async function autoLinkVendorOnPayment(par: typeof parRequests.$inferSelect, actorUserId: string) {
  try {
    if (!shouldAutoSaveVendor(par)) return;
    const iban = par.payeeIban!.trim();
    const tenantId = par.tenantId;

    // Dedup against existing vendors in this tenant (small list → compare in JS,
    // robust to IBAN formatting differences).
    const existing = await db
      .select()
      .from(parVendors)
      .where(eq(parVendors.tenantId, tenantId));
    const match = findVendorByIban(existing, iban);

    let vendorId: string;
    if (match) {
      vendorId = match.id;
      // Backfill details the registry was missing, without overwriting existing values.
      const patch: Partial<typeof parVendors.$inferInsert> = {};
      if (!match.idnp && par.payeeIdnp) patch.idnp = par.payeeIdnp;
      if (!match.bank && par.payeeBank) patch.bank = par.payeeBank;
      if (Object.keys(patch).length > 0) {
        await db.update(parVendors).set({ ...patch, updatedAt: new Date() }).where(eq(parVendors.id, vendorId));
      }
    } else {
      const [created] = await db
        .insert(parVendors)
        .values({
          tenantId,
          name: par.payeeName?.trim() || "(beneficiar fără nume)",
          idnp: par.payeeIdnp ?? null,
          iban,
          bank: par.payeeBank ?? null,
          active: true,
        })
        .returning({ id: parVendors.id });
      vendorId = created.id;
    }

    // Link the PAR to the registry vendor so it shows the saved payee next time.
    await db
      .update(parRequests)
      .set({ vendorId, updatedAt: new Date() })
      .where(and(eq(parRequests.id, par.id), eq(parRequests.tenantId, tenantId)));

    await writeAudit({
      tenantId,
      parId: par.id,
      actorUserId,
      event: "vendor_autosaved",
      detail: match
        ? `Plătitor legat de registrul de prestatori (existent): ${vendorId}`
        : `Plătitor salvat automat în registrul de prestatori: ${vendorId}`,
    });
  } catch {
    // best-effort — never block a recorded payment on the registry bookkeeping
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const section16Schema = z.object({
  par_bl: z.string().max(200).optional().nullable(),
  received_by_user_id: z.string().uuid().optional().nullable(),
  assigned_to_user_id: z.string().uuid().optional().nullable(),
});

/**
 * VM4-01/VM4-02 — motivul e obligatoriu la ambele acțiuni de corecție.
 * Anularea unei plăți și refuzul de plată sunt evenimente pe care un auditor le va citi
 * peste un an: „anulat de X la data Y" fără motiv nu explică nimic.
 */
const financeReasonSchema = z.object({
  reason: z.string().trim().min(3, "Motivul este obligatoriu").max(500),
});

const paySchema = z.object({
  actual_amount_cents: z.number().int().positive("actual_amount_cents must be a positive integer"),
  payment_date: z.string().datetime({ offset: true }).or(z.string().date()),
  // Referința plății este opțională (owner: nu o face obligatorie).
  payment_ref: z.string().max(500).optional().nullable(),
  proof_url: z.string().url().max(2000).optional().nullable(),
});

// ─── GET /api/par/finance ─────────────────────────────────────────────────────
// Finance queue: approved execute_payment PARs + in_finance + reapproval_required.
// obtain_quotations / provide_estimate are intentionally EXCLUDED (they close at 'approved').

parPaymentsRoutes.get("/finance", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const roles = await getUserPARRoles(user.id, tenantId);
  const canView = roles.includes("finance") || roles.includes("par_admin");
  if (!canView) return c.json({ error: "forbidden: finance or par_admin role required" }, 403);

  const [settings] = await db
    .select({
      threshold: parSettings.microPurchaseThresholdCents,
      currency: parSettings.defaultCurrency,
      enforceMatch: parSettings.enforceThreeWayMatch,
    })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;
  // PARQA-014: surface whether the 3-way match control is active. When OFF (the default),
  // finance is paying without PO/receipt/amount verification — the UI shows a clear warning
  // so nobody assumes a control that isn't running. Default false = no behavior change.
  const threeWayMatchEnforced = settings?.enforceMatch ?? false;

  // Only execute_payment PARs in the relevant statuses.
  // VM4-02b: `changes_requested` intră în coadă DOAR pentru cererile pe care finanțele le-au
  // refuzat ele însele (Violeta: „ce am refuzat trebuie să văd unde s-a dus"). Fără asta, o cerere
  // refuzată dispărea din ecranul finanțelor în secunda în care era refuzată, iar dacă
  // solicitantul o abandona, nimeni din finanțe nu mai știa de ea. Cererile întoarse de un
  // APROBATOR rămân în afara cozii — n-au ajuns niciodată la finanțe.
  const rawQueue = await db
    .select()
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.purpose, "execute_payment"),
        inArray(parRequests.status, [...FINANCE_QUEUE_STATUSES])
      )
    )
    .orderBy(desc(parRequests.isUrgent), desc(parRequests.createdAt));

  // Cine a refuzat plata, când și cu ce motiv — citit din `par_audit`, ca să nu adăugăm o coloană
  // nouă pentru un fapt pe care jurnalul îl știe deja. Cel mai recent refuz câștigă (o cerere
  // poate fi refuzată, corectată, retrimisă și refuzată din nou).
  const returnedCandidateIds = rawQueue
    .filter((p) => isFinanceReturnedStatus(p.status))
    .map((p) => p.id);
  const returnRows = returnedCandidateIds.length
    ? await db
        .select({
          parId: parAudit.parId,
          detail: parAudit.detail,
          createdAt: parAudit.createdAt,
          actorUserId: parAudit.actorUserId,
        })
        .from(parAudit)
        .where(
          and(
            eq(parAudit.tenantId, tenantId),
            eq(parAudit.event, FINANCE_RETURN_EVENT),
            inArray(parAudit.parId, returnedCandidateIds)
          )
        )
        .orderBy(desc(parAudit.createdAt))
    : [];
  const returnByPar = new Map<string, (typeof returnRows)[number]>();
  for (const r of returnRows) if (!returnByPar.has(r.parId)) returnByPar.set(r.parId, r);

  const { projects: projectScope, payers: payerScope } = await accessibleScopes(user.id, tenantId, user.role);
  const visible = rawQueue.filter((par) => {
    const inScope = par.projectId
      ? projectScope === null || projectScope.includes(par.projectId)
      : !!par.payerId && (payerScope === null || payerScope.includes(par.payerId));
    if (!inScope) return false;
    return belongsInFinanceQueue(par, { returnedByFinance: returnByPar.has(par.id) });
  });

  // VM4-05: arhiva. Starea e ultimul eveniment `finance_archived` / `finance_unarchived` din
  // jurnal — o cerere arhivată iese din lista de lucru, dar rămâne la un click distanță în tabul
  // „Arhivate", cu tot ce se știe despre ea. `?archived=1` cere lista arhivată în locul celei active.
  const wantArchived = ["1", "true", "yes"].includes((c.req.query("archived") ?? "").toLowerCase());
  const visibleIds = visible.map((p) => p.id);
  const archiveRows = visibleIds.length
    ? await db
        .select({
          parId: parAudit.parId,
          event: parAudit.event,
          detail: parAudit.detail,
          diff: parAudit.diff,
          createdAt: parAudit.createdAt,
          actorUserId: parAudit.actorUserId,
        })
        .from(parAudit)
        .where(
          and(
            eq(parAudit.tenantId, tenantId),
            inArray(parAudit.event, [FINANCE_ARCHIVE_EVENT, FINANCE_UNARCHIVE_EVENT]),
            inArray(parAudit.parId, visibleIds)
          )
        )
        .orderBy(desc(parAudit.createdAt))
    : [];
  // Cel mai recent eveniment per cerere decide: arhivată sau nu.
  const archiveByPar = new Map<string, (typeof archiveRows)[number]>();
  for (const r of archiveRows) if (!archiveByPar.has(r.parId)) archiveByPar.set(r.parId, r);
  const archivedIds = new Set(
    visible.filter((p) => isArchivedFromFinanceQueue(p.status, archiveByPar.get(p.id))).map((p) => p.id)
  );

  const queue = visible.filter((p) => archivedIds.has(p.id) === wantArchived);

  // Attach existing par_payments section-16 data
  const parIds = queue.map((p) => p.id);
  const paymentsMap: Record<string, typeof parPayments.$inferSelect> = {};
  if (parIds.length > 0) {
    const pmts = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, parIds)));
    for (const p of pmts) paymentsMap[p.parId] = p;
  }

  // Resolve display names (finance needs: who requested, which project, who approved).
  // VM3-01: decidedAt is included so the queue can show WHEN each approver signed (audit ask).
  const approvalRows = parIds.length
    ? await db
        .select({ parId: parApprovals.parId, step: parApprovals.step, decision: parApprovals.decision, approverUserId: parApprovals.approverUserId, decidedAt: parApprovals.decidedAt })
        .from(parApprovals)
        .where(and(eq(parApprovals.tenantId, tenantId), inArray(parApprovals.parId, parIds)))
    : [];
  const projectIds = [...new Set(queue.map((p) => p.projectId).filter((v): v is string => !!v))];
  const userIds = [
    ...new Set([
      ...queue.map((p) => p.requestedByUserId).filter((v): v is string => !!v),
      ...approvalRows.filter((a) => a.step >= 1 && a.decision === "approved" && a.approverUserId).map((a) => a.approverUserId as string),
      // Cine din finanțe a refuzat plata — coada arată numele, nu un UUID.
      ...queue.map((p) => returnByPar.get(p.id)?.actorUserId).filter((v): v is string => !!v),
      // Cine a arhivat cererea — la fel, arhiva arată un nume.
      ...queue.map((p) => archiveByPar.get(p.id)?.actorUserId).filter((v): v is string => !!v),
    ]),
  ];
  const projRows = projectIds.length
    ? await db.select({ id: parProjects.id, name: parProjects.name }).from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectIds)))
    : [];
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)))
    : [];
  const projName = (id: string | null) => (id && projRows.find((r) => r.id === id)?.name) || null;
  const userName = (id: string | null) => (id && userRows.find((r) => r.id === id)?.name) || null;
  const approversFor = (parId: string) =>
    [...new Set(
      approvalRows
        .filter((a) => a.parId === parId && a.step >= 1 && a.decision === "approved" && a.approverUserId)
        .map((a) => userName(a.approverUserId))
        .filter((n): n is string => !!n),
    )];
  // VM3-01: approvers WITH decision dates — Violeta (finance/audit) needs "cine a aprobat și la ce dată"
  // visible in the queue, not buried in the audit log.
  const approverDecisionsFor = (parId: string) =>
    approvalRows
      .filter((a) => a.parId === parId && a.step >= 1 && a.decision === "approved" && a.approverUserId)
      .sort((a, b) => a.step - b.step)
      .map((a) => ({ name: userName(a.approverUserId), step: a.step, decidedAt: a.decidedAt }))
      .filter((d): d is { name: string; step: number; decidedAt: Date | null } => !!d.name);

  // VM3-01: budget code labels (Violeta: "și budget line să se vadă")
  const budgetCodeIds = [...new Set(queue.map((p) => p.budgetCodeId).filter((v): v is string => !!v))];
  const budgetRows = budgetCodeIds.length
    ? await db.select({ id: parBudgetCodes.id, code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), inArray(parBudgetCodes.id, budgetCodeIds)))
    : [];
  const budgetLabel = (id: string | null) => {
    if (!id) return null;
    const b = budgetRows.find((r) => r.id === id);
    return b ? `${b.code} — ${b.name}` : null;
  };

  // VM3-01: attachment METADATA only (id/fileName/kind) — the file bodies are data-URLs and would
  // bloat the list response; the UI fetches content on demand via GET /api/par/:id/attachments.
  const attachmentRows = parIds.length
    ? await db.select({
        id: parAttachments.id,
        parId: parAttachments.parId,
        fileName: parAttachments.fileName,
        kind: parAttachments.kind,
        // Doar pentru referința actului (vezi mai jos) — `analysis` NU pleacă spre client.
        analysis: parAttachments.analysis,
      })
        .from(parAttachments)
        .where(and(eq(parAttachments.tenantId, tenantId), inArray(parAttachments.parId, parIds)))
    : [];
  const attachmentsFor = (parId: string) =>
    attachmentRows
      .filter((a) => a.parId === parId)
      .map(({ id, fileName, kind }) => ({ id, fileName, kind }));

  // Owner, 18.09.2026: „la destinația plății, prin bară, automat să se înscrie și seria/nr la
  // factura fiscală și data, sau nr contului și data." Referința e citită la încărcarea actului
  // (`analysis.document`); aici se alege documentul care contează și se lipește de descriere.
  const destinationFor = (parId: string, endUse: string | null) =>
    paymentDestination(endUse, pickDocumentRef(attachmentRows.filter((a) => a.parId === parId)));

  const items = queue.map((p) => ({
    ...p,
    above_micro_threshold: p.totalEstimatedCents > threshold,
    payment: paymentsMap[p.id] ?? null,
    requestedByName: userName(p.requestedByUserId),
    projectName: projName(p.projectId),
    approverNames: approversFor(p.id),
    approverDecisions: approverDecisionsFor(p.id),
    budgetCodeLabel: budgetLabel(p.budgetCodeId),
    attachmentsMeta: attachmentsFor(p.id),
    paymentDestination: destinationFor(p.id, p.endUse),
    financeReturn: (() => {
      const r = returnByPar.get(p.id);
      if (!r) return null;
      return {
        returnedAt: r.createdAt,
        reason: financeReturnReason(r.detail),
        byName: userName(r.actorUserId),
      };
    })(),
    // VM4-05: nenul doar pe cererile arhivate — cine a scos-o din coadă, când și cu ce notă.
    financeArchive: (() => {
      if (!archivedIds.has(p.id)) return null;
      const a = archiveByPar.get(p.id);
      if (!a) return null;
      return {
        archivedAt: a.createdAt,
        note: financeArchiveNote(a.detail),
        byName: userName(a.actorUserId),
      };
    })(),
  }));

  return c.json({
    items,
    total: items.length,
    threeWayMatchEnforced,
    // Ambele numere pleacă indiferent de tabul cerut: taburile își arată contorul fără a doua cerere.
    activeCount: visible.length - archivedIds.size,
    archivedCount: archivedIds.size,
    archived: wantArchived,
  });
});

// ─── POST /api/par/:id/finance ────────────────────────────────────────────────
// Write section 16 (par_bl, received_by, assigned_to); move PAR to in_finance.
// Finance role only. Works on 'approved' (execute_payment) PARs → creates par_payments row.
// Also accepted on 'in_finance' for updates (re-assign, update par_bl).

parPaymentsRoutes.post(
  "/:id/finance",
  zValidator("json", section16Schema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    // Rolul și cererea se citesc ODATĂ, nu una după alta: pe Supabase fiecare interogare e un
    // drum dus-întors, iar ruta asta face deja destule. Owner, 13.09: „confirmarea plății e foarte
    // lentă" — pe lângă analiza AI (scoasă din calea plății), aici erau ~15 interogări în șir.
    const [roles, parRows] = await Promise.all([
      getUserPARRoles(user.id, tenantId),
      db.select().from(parRequests).where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId))),
    ]);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = parRows;
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    if (par.purpose !== "execute_payment") {
      return c.json(
        { error: "conflict: only execute_payment PARs can enter finance queue" },
        409
      );
    }

    if (!["approved", "in_finance"].includes(par.status)) {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected approved or in_finance` },
        409
      );
    }

    const now = new Date();

    // Upsert par_payments section-16 fields
    const existing = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    if (existing.length === 0) {
      await db.insert(parPayments).values({
        tenantId,
        parId,
        parBl: body.par_bl ?? null,
        receivedAt: now,
        receivedByUserId: body.received_by_user_id ?? user.id,
        assignedToUserId: body.assigned_to_user_id ?? null,
      });
    } else {
      await db
        .update(parPayments)
        .set({
          parBl: body.par_bl ?? existing[0].parBl,
          receivedByUserId: body.received_by_user_id ?? existing[0].receivedByUserId,
          assignedToUserId: body.assigned_to_user_id ?? existing[0].assignedToUserId,
          updatedAt: now,
        })
        .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));
    }

    // Transition to in_finance (idempotent)
    if (par.status === "approved") {
      await db
        .update(parRequests)
        .set({ status: "in_finance", updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "in_finance",
        detail: `Received by user ${body.received_by_user_id ?? user.id}; assigned to ${body.assigned_to_user_id ?? "unassigned"}`,
      });
    }

    // Fetch updated
    const [updated] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

    const [payment] = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    return c.json({ par: updated, payment });
  }
);

// ─── POST /api/par/:id/pay ────────────────────────────────────────────────────
// Record actual payment. Applies the 10% overage rule (integer math only).
// CORE §3: if actual > total * 1.10 AND total > micro_purchase_threshold → reapproval_required.
// Otherwise → paid.

parPaymentsRoutes.post(
  "/:id/pay",
  zValidator("json", paySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    // Accept in_finance (normal path) OR reapproval_required after overage_reapproved=true
    if (!["in_finance", "reapproval_required"].includes(par.status)) {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected in_finance or reapproval_required` },
        409
      );
    }

    // Tot ce urmează are nevoie de aceleași patru citiri, iar niciuna nu depinde de cealaltă:
    // plata existentă, setările tenantului, potrivirea în trei și corpul pe care se verifică
    // sigiliul. Se cer în paralel; verificările de mai jos rămân în EXACT aceeași ordine, ca
    // motivul cu care se oprește o plată să nu se schimbe.
    const [existing, settingsRows, match, bodyForHash] = await Promise.all([
      db.select().from(parPayments).where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId))),
      db
        .select({ threshold: parSettings.microPurchaseThresholdCents, enforceMatch: parSettings.enforceThreeWayMatch })
        .from(parSettings)
        .where(eq(parSettings.tenantId, tenantId)),
      evaluateMatch(parId, tenantId, body.actual_amount_cents),
      par.bodyHash ? buildBodyForHash(parId, tenantId) : Promise.resolve(null),
    ]);
    const [settings] = settingsRows;

    // If reapproval_required, must check overage_reapproved flag first
    if (par.status === "reapproval_required") {
      const [pmtRow] = existing;

      if (!pmtRow?.overageReapproved) {
        return c.json(
          { error: "conflict: overage must be re-approved before payment can proceed" },
          409
        );
      }
    }

    // SECURITY (audit 2026-08-29): momentul în care banii pleacă era singurul de pe tot fluxul
    // care NU re-verifica sigiliul de integritate. Aprobarea îl verifică (parApprovals.ts), plata
    // nu — deci o modificare a IBAN-ului sau a sumei strecurată ÎNTRE ultima semnătură și
    // execuție trecea neobservată exact acolo unde contează. Aceeași verificare, aceeași funcție.
    if (par.bodyHash) {
      if (bodyForHash) {
        const integrity = verifyParBodyHash(bodyForHash, par.bodyHash);
        if (!integrity.valid) {
          await writeAudit({
            tenantId, parId, actorUserId: user.id, event: "integrity_mismatch",
            detail: `Payment blocked: ${integrity.detail ?? "body hash mismatch"}`,
          });
          return c.json(
            { error: "integrity_violation: PAR body was modified after approval — payment blocked",
              detail: integrity.detail },
            409
          );
        }
      }
    }

    // Segregarea sarcinilor: cine a cerut plata nu ar trebui să fie și cel care o execută.
    // NU blocăm — într-un ONG mic aceeași persoană chiar ține și cererea, și banca, iar plata a
    // fost deja aprobată de altcineva (auto-aprobarea e interzisă dur în parApprovals.ts). Dar
    // excepția se scrie explicit în audit, ca să fie vizibilă în dosar și în timeline, nu tăcută.
    if (par.requestedByUserId === user.id) {
      await writeAudit({
        tenantId, parId, actorUserId: user.id, event: "sod_self_payment",
        detail: "Plata a fost înregistrată de chiar solicitantul cererii (segregare a sarcinilor neasigurată).",
      });
    }

    const threshold = settings?.threshold ?? 1000000;

    // VF-505: 3-way match (PO + receipt + amount). If enforced and it fails → block with 409.
    // Otherwise attach a non-blocking warning to the response.
    if (settings?.enforceMatch && !match.ok) {
      return c.json({ error: "three_way_match_failed", issues: match.issues }, 409);
    }
    const matchWarning = !match.ok ? match.issues : null;

    // 10% rule — integer math, no floats (CORE §3, T-PAR-113-1..3)
    const result = applyTenRule({
      actualAmountCents: body.actual_amount_cents,
      totalEstimatedCents: par.totalEstimatedCents,
      microPurchaseThresholdCents: threshold,
      // PARQA-017: the threshold is in MDL — compare against the frozen MDL-equivalent for non-MDL
      // PARs (falls back to the native total for MDL PARs, where they're equal).
      thresholdBasisCents: par.totalMdlCents ?? par.totalEstimatedCents,
    });

    const now = new Date();

    // Upsert par_payments with actual payment details (rândul e deja citit mai sus).
    // PAR-113: once the overage was explicitly re-approved (reapprove → overageReapproved=true,
    // PAR back to in_finance), re-running the 10% rule must NOT bounce the payment back to
    // reapproval_required again — otherwise the same overage can never be paid (infinite loop).
    const alreadyReapproved = existing[0]?.overageReapproved === true;

    if (existing.length === 0) {
      await db.insert(parPayments).values({
        tenantId,
        parId,
        actualAmountCents: body.actual_amount_cents,
        paymentDate: new Date(body.payment_date),
        paymentRef: body.payment_ref ?? null,
        proofUrl: body.proof_url ?? null,
        receivedAt: now,
        receivedByUserId: user.id,
      });
    } else {
      await db
        .update(parPayments)
        .set({
          actualAmountCents: body.actual_amount_cents,
          paymentDate: new Date(body.payment_date),
          paymentRef: body.payment_ref ?? null,
          proofUrl: body.proof_url ?? null,
          updatedAt: now,
        })
        .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));
    }

    if (result.needsReapproval && !alreadyReapproved) {
      // → reapproval_required
      await db
        .update(parRequests)
        .set({ status: "reapproval_required", updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "reapproval_required",
        detail: `Actual ${body.actual_amount_cents} exceeds estimated ${par.totalEstimatedCents} by >10% (threshold ${threshold}). Re-approval required.`,
      });

      // Notify final approver
      const finalApproval = await db
        .select()
        .from(parApprovals)
        .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
        .orderBy(parApprovals.step);

      const finalStep = finalApproval.filter((a) => a.decision === "approved").sort((a, b) => b.step - a.step)[0];
      const finalApproverUserId = finalStep?.approverUserId ?? null;

      // Notificarea asta trăia aici, scrisă de mână, doar in-app și în engleză — aprobatorul
      // care TREBUIE să decidă afla doar dacă intra în aplicație. Acum trece prin serviciul
      // de notificări, deci pleacă și pe email, cu ambele sume și diferența.
      if (finalApproverUserId) {
        await notifyReapprovalRequired(
          { tenantId, parId, requestNo: par.requestNo },
          finalApproverUserId,
          {
            estimatedCents: par.totalEstimatedCents ?? 0,
            actualAmountCents: body.actual_amount_cents,
          }
        );
      }

      return c.json({
        status: "reapproval_required",
        message: "Actual amount exceeds estimate by >10%. Re-approval required before payment proceeds.",
        par: { ...par, status: "reapproval_required" },
      });
    } else {
      // → paid
      const paidAt = new Date();
      await db
        .update(parRequests)
        .set({ status: "paid", paidAt, updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "paid",
        detail: `Actual amount: ${body.actual_amount_cents} cents. Ref: ${body.payment_ref ?? "-"}`,
      });

      // Notify requestor
      await notifyPaid(
        { tenantId, parId, requestNo: par.requestNo },
        par.requestedByUserId,
        { actualAmountCents: body.actual_amount_cents }
      );

      // VM5-13: aprobatorii care au semnat află că plata chiar s-a executat — până acum lanțul se
      // termina pentru ei la propria semnătură. In-app pe loc, pe email prin digest.
      const semnatari = await db
        .select({ approverUserId: parApprovals.approverUserId })
        .from(parApprovals)
        .where(and(
          eq(parApprovals.parId, parId),
          eq(parApprovals.tenantId, tenantId),
          eq(parApprovals.decision, "approved")
        ));
      await notifyPriorApprovers(
        { tenantId, parId, requestNo: par.requestNo },
        semnatari.map((s) => s.approverUserId).filter((id): id is string => !!id),
        "a fost achitată",
        { amountLabel: undefined }
      );

      // VM1-05: remember this payee (IBAN etc.) in the vendor registry for reuse.
      await autoLinkVendorOnPayment(par, user.id);

      const [updatedPar] = await db
        .select()
        .from(parRequests)
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      return c.json({ status: "paid", par: updatedPar, match_warning: matchWarning });
    }
  }
);

// ─── VM4-04: GET /api/par/payment-proofs — plățile fără ordin de plată în dosar ──
// Violeta (finanțe): „extrasele bancare vin a 2-a zi cu ștampila băncii în PDF… când am 20 sau 30
// de plăți trebuie să mă duc jos cu split la fiecare act". Dovada NU poate fi atașată la momentul
// plății (documentul ștampilat nu există încă), deci ecranul ăsta adună într-un singur loc
// plățile care încă așteaptă dovada — de acolo se atașează toate odată.
//
// Coada e DERIVATĂ (cereri plătite fără atașament de tip `payment_order`), nu un tabel nou:
// atașezi ordinul de plată oriunde în aplicație și cererea dispare de aici singură.

parPaymentsRoutes.get("/payment-proofs", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.includes("finance") && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden: finance or par_admin role required" }, 403);
  }

  // „missing" (implicit) = treaba de făcut; „all" = și cele care au deja dovada, pentru verificare.
  const filter = (c.req.query("filter") ?? "missing").toLowerCase();

  const paidPars = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "paid")))
    .orderBy(desc(parRequests.paidAt));

  const { projects: projectScope, payers: payerScope } = await accessibleScopes(user.id, tenantId, user.role);
  const visible = paidPars.filter((par) => par.projectId
    ? projectScope === null || projectScope.includes(par.projectId)
    : !!par.payerId && (payerScope === null || payerScope.includes(par.payerId)));

  const parIds = visible.map((p) => p.id);
  const payments = parIds.length
    ? await db
        .select()
        .from(parPayments)
        .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, parIds)))
    : [];
  const paymentByPar = new Map(payments.map((p) => [p.parId, p]));

  const proofRows = parIds.length
    ? await db
        .select({ parId: parAttachments.parId, id: parAttachments.id, fileName: parAttachments.fileName })
        .from(parAttachments)
        .where(and(
          eq(parAttachments.tenantId, tenantId),
          inArray(parAttachments.parId, parIds),
          eq(parAttachments.kind, "payment_order"),
        ))
    : [];
  const proofsByPar = new Map<string, { id: string; fileName: string }[]>();
  for (const row of proofRows) {
    const list = proofsByPar.get(row.parId) ?? [];
    list.push({ id: row.id, fileName: row.fileName });
    proofsByPar.set(row.parId, list);
  }

  const projectIds = [...new Set(visible.map((p) => p.projectId).filter((v): v is string => !!v))];
  const projRows = projectIds.length
    ? await db.select({ id: parProjects.id, name: parProjects.name }).from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectIds)))
    : [];
  const projName = (id: string | null) => (id && projRows.find((r) => r.id === id)?.name) || null;

  const items = visible
    .map((p) => {
      const payment = paymentByPar.get(p.id) ?? null;
      const proofs = proofsByPar.get(p.id) ?? [];
      return {
        id: p.id,
        requestNo: p.requestNo,
        payeeName: p.payeeName,
        payeeIban: p.payeeIban,
        projectName: projName(p.projectId),
        endUse: p.endUse,
        currency: p.currency,
        totalEstimatedCents: p.totalEstimatedCents,
        paidAt: p.paidAt?.toISOString() ?? null,
        actualAmountCents: payment?.actualAmountCents ?? null,
        paymentDate: payment?.paymentDate?.toISOString() ?? null,
        paymentRef: payment?.paymentRef ?? null,
        proofs,
      };
    })
    .filter((item) => (filter === "all" ? true : item.proofs.length === 0));

  return c.json({
    items,
    total: items.length,
    missingCount: visible.filter((p) => (proofsByPar.get(p.id) ?? []).length === 0).length,
    paidCount: visible.length,
  });
});

// ─── VM4-01: POST /api/par/:id/unpay — anulează o plată înregistrată din greșeală ──
// Violeta (finanțe): „din greșeală am apăsat plătit… cum să fac recall la acest PAR, să nu fie
// plata. Am vrut să apăs refuzat." Până acum `paid` era o fundătură: un click greșit rămânea în
// istoric ca plată reală, iar singura ieșire era o cerere nouă.
//
// Ce face: PAR `paid` → înapoi la `in_finance` (de unde finanțele fie reînregistrează plata
// corect, fie o refuză prin /finance-return). Rândul din `par_payments` NU se șterge — suma și
// referința rămân precompletate pentru re-plată, iar `par_audit` păstrează ambele evenimente
// (`paid`, apoi `payment_reverted` cu motiv). Nimic nu dispare din istoric.

parPaymentsRoutes.post(
  "/:id/unpay",
  zValidator("json", financeReasonSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const { reason } = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    if (par.status !== "paid") {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected paid` },
        409
      );
    }

    const [payment] = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    const now = new Date();

    const [updated] = await db
      .update(parRequests)
      .set({ status: "in_finance", paidAt: null, updatedAt: now })
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "payment_reverted",
      detail:
        `Plata anulată (suma înregistrată: ${payment?.actualAmountCents ?? "-"} bani, ` +
        `ref: ${payment?.paymentRef ?? "-"}). Cererea revine la 'in_finance'. Motiv: ${reason.slice(0, 300)}`,
    });

    // Solicitantul a primit deja „PAR plătit" — trebuie să afle și că plata a fost anulată.
    if (par.requestedByUserId) {
      await notifyPaymentReverted(
        { tenantId, parId, requestNo: par.requestNo },
        par.requestedByUserId,
        reason
      );
    }

    return c.json({ status: "in_finance", par: updated, payment: payment ?? null });
  }
);

// ─── VM4-02: POST /api/par/:id/finance-return — finanțele refuză plata ────────
// Contrapartea butonului „Marchează plătit": până acum finanțele puteau doar PLĂTI. Dacă
// rechizitele erau greșite sau documentul lipsea, nu exista niciun buton de refuz — de aici și
// clickul greșit pe „plătit" în locul unui „refuzat" inexistent.
//
// Ce face: PAR `approved` | `in_finance` | `reapproval_required` → `changes_requested`, adică
// exact starea editabilă în care solicitantul corectează și retrimite (submit reconstruiește
// lanțul de aprobare din DOA — o cerere corectată trece din nou pe la aprobatori).

parPaymentsRoutes.post(
  "/:id/finance-return",
  zValidator("json", financeReasonSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const { reason } = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    if (!["approved", "in_finance", "reapproval_required"].includes(par.status)) {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected approved, in_finance or reapproval_required` },
        409
      );
    }

    const now = new Date();

    const [updated] = await db
      .update(parRequests)
      .set({ status: "changes_requested", updatedAt: now })
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "finance_returned",
      detail: `Finanțele au refuzat plata și au trimis cererea înapoi la solicitant. Motiv: ${reason.slice(0, 300)}`,
    });

    if (par.requestedByUserId) {
      await notifyFinanceReturned(
        { tenantId, parId, requestNo: par.requestNo },
        par.requestedByUserId,
        reason
      );
    }

    return c.json({ status: "changes_requested", par: updated });
  }
);

// ─── VM4-05: arhiva cozii de finanțe ─────────────────────────────────────────
// POST /api/par/:id/finance-archive    — scoate cererea din lista de lucru
// POST /api/par/:id/finance-unarchive  — o readuce
//
// Nimic nu se șterge și niciun status nu se schimbă: arhivarea e o etichetă în jurnal, deci
// cererea rămâne exact în starea ei (o cerere refuzată e tot refuzată, doar că nu mai stă în ochii
// nimănui). Dacă între timp cererea se mișcă — solicitantul o corectează, ea e aprobată din nou —
// statusul diferă de cel de la arhivare și cererea reapare singură în coadă (vezi
// `isArchivedFromFinanceQueue`): o plată reală nu are voie să rămână ascunsă.

/** Nota de arhivare e opțională — arhivarea e curățenie, nu un refuz care cere justificare. */
async function readArchiveNote(c: { req: { json: () => Promise<unknown> } }): Promise<string | null> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return null; // corp gol = fără notă, nu eroare
  }
  if (!body || typeof body !== "object") return null;
  const raw = (body as { note?: unknown }).note;
  if (typeof raw !== "string") return null;
  const note = raw.trim().slice(0, 500);
  return note || null;
}

/** Cererea + verificările comune celor două acțiuni (rol, perimetru, „chiar e în coadă?"). */
async function loadArchivablePar(
  user: { id: string; tenantId: string; role: string },
  parId: string
): Promise<
  | { ok: true; par: typeof parRequests.$inferSelect }
  | { ok: false; status: 403 | 404 | 409; error: string }
> {
  const tenantId = user.tenantId;
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.includes("finance") && !roles.includes("par_admin")) {
    return { ok: false, status: 403, error: "forbidden: finance role required" };
  }

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return { ok: false, status: 404, error: "not_found" };

  const inScope = par.projectId
    ? await mayAccessProject(user.id, tenantId, par.projectId, user.role)
    : await mayAccessPayer(user.id, tenantId, par.payerId, user.role);
  if (!inScope) return { ok: false, status: 404, error: "not_found" };

  // Doar ce trece prin coada de finanțe se poate arhiva DIN coada de finanțe. O cerere plătită sau
  // respinsă a ieșit deja din ea; „arhivarea" ei aici n-ar avea ce ascunde.
  if (!(FINANCE_QUEUE_STATUSES as readonly string[]).includes(par.status)) {
    return {
      ok: false,
      status: 409,
      error: `conflict: PAR status is '${par.status}', not in the finance queue`,
    };
  }
  const returned = par.status === "changes_requested"
    ? await db
        .select({ id: parAudit.id })
        .from(parAudit)
        .where(
          and(
            eq(parAudit.tenantId, tenantId),
            eq(parAudit.parId, par.id),
            eq(parAudit.event, FINANCE_RETURN_EVENT)
          )
        )
        .limit(1)
    : [];
  if (!belongsInFinanceQueue(par, { returnedByFinance: returned.length > 0 })) {
    return { ok: false, status: 409, error: "conflict: PAR is not in the finance queue" };
  }

  return { ok: true, par };
}

parPaymentsRoutes.post("/:id/finance-archive", async (c) => {
  const user = c.get("user");
  const parId = c.req.param("id");
  const note = await readArchiveNote(c);

  const loaded = await loadArchivablePar(user, parId);
  if (!loaded.ok) return c.json({ error: loaded.error }, loaded.status);
  const { par } = loaded;

  await writeAudit({
    tenantId: user.tenantId,
    parId,
    actorUserId: user.id,
    event: FINANCE_ARCHIVE_EVENT,
    detail:
      `Scoasă din coada de finanțe (arhivată din statusul '${par.status}').` +
      (note ? ` Notă: ${note}` : ""),
    diff: financeArchiveDiff(par.status),
  });

  return c.json({ archived: true, par });
});

parPaymentsRoutes.post("/:id/finance-unarchive", async (c) => {
  const user = c.get("user");
  const parId = c.req.param("id");
  const note = await readArchiveNote(c);

  const loaded = await loadArchivablePar(user, parId);
  if (!loaded.ok) return c.json({ error: loaded.error }, loaded.status);
  const { par } = loaded;

  await writeAudit({
    tenantId: user.tenantId,
    parId,
    actorUserId: user.id,
    event: FINANCE_UNARCHIVE_EVENT,
    detail: `Readusă în coada de finanțe.` + (note ? ` Notă: ${note}` : ""),
  });

  return c.json({ archived: false, par });
});

// ─── VF-505: GET /api/par/:id/match — 3-way match state (for the UI). ──────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
parPaymentsRoutes.get("/:id/match", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  if (!UUID_RE.test(parId)) return c.json({ error: "not_found" }, 404);

  const [par] = await db
    .select({ requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
    return c.json({ error: "not_found" }, 404);
  }
  const roles = await getUserPARRoles(user.id, tenantId);
  const canSee = par.requestedByUserId === user.id || roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!canSee) return c.json({ error: "not_found" }, 404);

  const match = await evaluateMatch(parId, tenantId);
  return c.json(match);
});

// ─── POST /api/par/dosare.zip — mai multe dosare, într-un singur fișier ───────
//
// Owner, 18.09.2026: „să putem selecta mai multe PAR-uri o dată, să salvăm."
// Până acum salvarea era un dosar pe rând: bifezi, aștepți, salvezi, o iei de la capăt — de 30 de
// ori la închiderea lunii. Aici se cer N cereri și se primește UN zip cu dosarele lor, fiecare cu
// numele pe care l-ar fi avut descărcat singur (`dosarFileName`).
//
// Aceleași reguli de acces ca la descărcarea unui singur dosar: `canViewPar`, cerere cu cerere. O
// cerere pe care omul n-o poate vedea nu intră în pachet și nu strică restul.

/** Ne oprim înainte de limita de 60s a platformei și livrăm ce s-a construit până atunci. */
const DOSARE_ZIP_BUDGET_MS = 45_000;

parPaymentsRoutes.post(
  "/dosare.zip",
  zValidator("json", z.object({ ids: z.array(z.string().uuid()).min(1).max(DOSARE_ZIP_MAX) })),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { ids } = c.req.valid("json");

    const rows = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, ids)));
    // Ordinea din ecran, nu cea din baza de date.
    const ordered = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is typeof rows[number] => !!r);

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    const deadline = Date.now() + DOSARE_ZIP_BUDGET_MS;
    let included = 0;
    let skipped = ids.length - ordered.length;

    for (const par of ordered) {
      // Bugetul de timp: mai bine un pachet cu 12 dosare și un mesaj clar decât o eroare de
      // gateway după 60 de secunde, cu zero fișiere.
      if (Date.now() >= deadline) {
        skipped += 1;
        continue;
      }
      if (!(await canViewPar(user, tenantId, par))) {
        skipped += 1;
        continue;
      }
      try {
        const built = await buildDosar(par.id, tenantId, { requestOrigin: new URL(c.req.url).origin });
        if (!built) {
          skipped += 1;
          continue;
        }
        // Două cereri pot ajunge la același nume (aceeași plată, același beneficiar) — un zip cu
        // două intrări identice pierde una la dezarhivare.
        let name = built.fileName;
        for (let i = 2; used.has(name); i++) name = built.fileName.replace(/\.pdf$/i, ` (${i}).pdf`);
        used.add(name);
        zip.file(name, built.bytes);
        included += 1;
      } catch {
        // Un dosar care nu se poate construi (act corupt) nu are voie să piardă tot pachetul.
        skipped += 1;
      }
    }

    if (included === 0) {
      return c.json({ error: "empty", detail: "Niciun dosar nu a putut fi construit din selecție." }, 404);
    }

    // STORE, nu DEFLATE: un PDF e deja comprimat, iar comprimarea lui încă o dată costă secunde
    // din bugetul funcției pentru câțiva kilobytes.
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    const fileName = `Dosare_PAR_${new Date().toISOString().slice(0, 10)}.zip`;

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", contentDisposition("attachment", fileName));
    // Câte au intrat și câte au rămas — ecranul o spune omului, altfel un pachet incomplet trece
    // neobservat. Expuse prin CORS ca `fetch` să le poată citi.
    c.header("X-Dosare-Incluse", String(included));
    c.header("X-Dosare-Sarite", String(skipped));
    c.header("Access-Control-Expose-Headers", "Content-Disposition, X-Dosare-Incluse, X-Dosare-Sarite");
    return c.body(bytes);
  },
);
