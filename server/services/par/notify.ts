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
import { tenants } from "../../db/schema/tenants";
import { parMembers, parRequests, parProjects, parBudgetCodes, parVendors, parEvents } from "../../db/schema/par";
import { appUrl } from "../../lib/par/invites";
import { getActiveDelegatesOf } from "../../lib/par/delegations";
import { MessagingService } from "../messaging/index";

const messagingService = new MessagingService(db);

/**
 * VM1-08: absolute deep link that works from Gmail/Outlook. The SPA uses hash
 * routing, so the path MUST be behind `/#/` — a bare relative path is a dead link.
 */
export function parDeepLink(parId: string): string {
  return `${appUrl()}/#/business/par/${parId}`;
}

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

/** Ce se știe despre o cerere, în formă deja formatată pentru text de email. */
interface ParFacts {
  currency: string;
  amountLabel: string;
  payeeName: string;
  reason: string;
  projectName: string;
  eventName: string;
  budgetLabel: string;
  /** VM5-13: doar cererile urgente mai sparg digestul și pleacă pe email în clipa depunerii. */
  isUrgent: boolean;
  /** Cine a depus cererea — ca să nu-i trimitem LUI „așteaptă aprobarea ta" pe propria cerere. */
  requestedByUserId: string | null;
}

/** Taie un text lung ca să încapă în prima propoziție a emailului sau în subiect. */
function shorten(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * VM1-08 — payment details shown to the approver in the email (NO IBAN / bank data;
 * those stay in-app per the owner's decision). Includes amount, payee, reason, project,
 * budget. Best-effort: returns a multi-line block, or null if the PAR can't be loaded.
 */
async function loadParFacts(tenantId: string, parId: string): Promise<ParFacts | null> {
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
        eventId: parRequests.eventId,
        budgetCodeId: parRequests.budgetCodeId,
        isUrgent: parRequests.isUrgent,
        requestedByUserId: parRequests.requestedByUserId,
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

    // VM1-04: the event the PAR belongs to (donor reporting is per-event in NGOs).
    let eventName = "";
    if (p.eventId) {
      const [ev] = await db
        .select({ name: parEvents.name })
        .from(parEvents)
        .where(and(eq(parEvents.id, p.eventId), eq(parEvents.tenantId, tenantId)));
      eventName = ev?.name ?? "";
    }

    let budgetLabel = "";
    if (p.budgetCodeId) {
      const [bc] = await db
        .select({ code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.id, p.budgetCodeId), eq(parBudgetCodes.tenantId, tenantId)));
      if (bc) budgetLabel = [bc.code, bc.name].filter(Boolean).join(" — ");
    }

    return {
      currency: p.currency ?? "MDL",
      amountLabel: formatParAmount(p.totalEstimatedCents, p.currency),
      payeeName,
      reason: p.endUse?.trim() || PURPOSE_LABELS[p.purpose] || "",
      projectName,
      eventName,
      budgetLabel,
      isUrgent: p.isUrgent ?? false,
      requestedByUserId: p.requestedByUserId ?? null,
    };
  } catch {
    return null;
  }
}

/** Blocul de detalii din email — o listă scanabilă sub prima propoziție. */
function summaryBlock(facts: ParFacts, extra?: { paidAmountLabel?: string | null }): string {
  const lines = ["Detalii plată:", `• Sumă: ${facts.amountLabel}`];
  if (extra?.paidAmountLabel && extra.paidAmountLabel !== facts.amountLabel) {
    lines.push(`• Sumă achitată: ${extra.paidAmountLabel}`);
  }
  if (facts.payeeName) lines.push(`• Către: ${facts.payeeName}`);
  if (facts.reason) lines.push(`• Motiv: ${facts.reason}`);
  if (facts.projectName) lines.push(`• Proiect: ${facts.projectName}`);
  if (facts.eventName) lines.push(`• Eveniment: ${facts.eventName}`);
  if (facts.budgetLabel) lines.push(`• Buget: ${facts.budgetLabel}`);
  return lines.join("\n");
}

/**
 * Prima propoziție a notificării: „Plata pentru chirie birou către ACME SRL în sumă de
 * 12.500,00 MDL a fost aprobată (cererea PAR-2026-0026)."
 *
 * De ce așa: un email care spune doar „PAR-2026-0026 a fost aprobată" nu-i spune nimic
 * destinatarului fără să deschidă aplicația — numărul cererii nu e informație pentru om.
 * Suma, beneficiarul și motivul sunt. Când cererea nu poate fi citită, se cade înapoi pe
 * numărul cererii, ca notificarea să plece oricum.
 */
function outcomeLine(
  facts: ParFacts | null,
  requestNo: string,
  verbPhrase: string,
  opts?: { amountLabel?: string; stepLabel?: string },
): string {
  const ref = [`cererea ${requestNo}`, opts?.stepLabel ? `pas: ${opts.stepLabel}` : null]
    .filter(Boolean)
    .join(", ");
  if (!facts) return `Cererea ${requestNo} ${verbPhrase}${opts?.stepLabel ? ` (pas: ${opts.stepLabel})` : ""}.`;
  const parts = ["Plata"];
  if (facts.reason) parts.push(`pentru ${shorten(facts.reason, 90)}`);
  if (facts.payeeName) parts.push(`către ${shorten(facts.payeeName, 60)}`);
  parts.push(`în sumă de ${opts?.amountLabel ?? facts.amountLabel}`);
  return `${parts.join(" ")} ${verbPhrase} (${ref}).`;
}

/**
 * Subiectul poartă suma și beneficiarul, ca notificarea să fie utilă din lista de inbox,
 * fără deschidere. Prefixul „[PAR] <număr>" rămâne neschimbat — filtrele existente pe el.
 */
function subjectFor(facts: ParFacts | null, requestNo: string, label: string, amountLabel?: string): string {
  const base = `[PAR] ${requestNo} — ${label}`;
  if (!facts) return base;
  const amount = amountLabel ?? facts.amountLabel;
  return facts.payeeName ? `${base} · ${amount} către ${shorten(facts.payeeName, 40)}` : `${base} · ${amount}`;
}

/**
 * VM1-08 — full approver email body: one-line intro + payment details + deep link.
 * Used for the "someone submitted a PAR → approver" email (and the next-step email).
 */
function buildApproverEmailBody(facts: ParFacts | null, ctx: ParNotifyContext, stepLabel?: string): string {
  const intro = outcomeLine(facts, ctx.requestNo, "așteaptă aprobarea ta", { stepLabel });
  const link = `Deschide cererea: ${parDeepLink(ctx.parId)}`;
  // VM5-13: emailul ăsta pleacă doar pentru cereri urgente, deci trebuie să spună de ce a ajuns
  // în inbox în afara digestului — altfel omul care a cerut „două emailuri pe zi" crede că regula
  // s-a stricat.
  const urgentNote = facts?.isUrgent
    ? "Cererea e marcată URGENT, de aceea îți vine acum și nu în digestul de la 09:00 / 16:00."
    : null;
  return [intro, "", urgentNote, urgentNote ? "" : null, facts ? summaryBlock(facts) : null, facts ? "" : null, link]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * VM1-08 — notify every approver of a step. VM5-13 a schimbat CÂND pleacă emailul:
 *
 *   - in-app: mereu, în clipa evenimentului (e gratis și e chiar locul unde omul lucrează);
 *   - email: NUMAI dacă cererea e marcată urgentă. Restul se adună în digestul de 09:00 / 16:00
 *     (`services/par/digestRunner.ts`), care citește starea reală a inboxului, nu o coadă.
 *
 * De ce așa: owner-ul a cerut explicit ca digestul să ÎNLOCUIASCĂ emailurile per-cerere, nu să se
 * adauge peste ele. Până acum mergeau amândouă, iar subsolul digestului promitea deja „un singur
 * email cu toate cererile, de două ori pe zi" — o promisiune pe care codul o încălca.
 */
async function notifyApprovers(params: {
  ctx: ParNotifyContext;
  specificUserId: string | null;
  stepLabel?: string;
}): Promise<void> {
  const { ctx, specificUserId, stepLabel } = params;
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const emailBody = buildApproverEmailBody(facts, ctx, stepLabel);
  const inAppBody = `${outcomeLine(facts, ctx.requestNo, "așteaptă aprobarea ta", { stepLabel })} Link: /business/par/${ctx.parId}`;
  const baseLabel = stepLabel ? `aprobare necesară (${stepLabel})` : "aprobare necesară";
  const subject = subjectFor(
    facts,
    ctx.requestNo,
    facts?.isUrgent ? `URGENT — ${baseLabel}` : baseLabel
  );
  // Fără urgență nu pleacă niciun email de „aprobare necesară": cererea apare în digest.
  const emailNow = facts?.isUrgent === true;

  let recipients: string[];
  if (specificUserId) {
    // VM1-07: while a delegation X→Y is active, Y must be notified too — otherwise the
    // delegate can approve but never learns a request is waiting.
    let delegates: string[] = [];
    try {
      delegates = await getActiveDelegatesOf(specificUserId, ctx.tenantId);
    } catch {
      // best-effort — a delegation lookup failure must not kill the primary notification
    }
    recipients = [...new Set([specificUserId, ...delegates])];
  } else {
    const rows = await db
      .select({ userId: parMembers.userId })
      .from(parMembers)
      .where(
        and(eq(parMembers.tenantId, ctx.tenantId), inArray(parMembers.role, ["approver", "par_admin"]))
      );
    recipients = [...new Set(rows.map((r) => r.userId))];
  }

  // VM5-13: solicitantul nu primește NICIODATĂ „așteaptă aprobarea ta" pe propria cerere.
  // Cazul real: cine depune o cerere și are și rol de aprobator își vede pasul deblocat de pe nume
  // la depunere (`lib/par/submit.ts`, sanitizarea anti-auto-aprobare), pasul cade pe rutare pe rol,
  // iar rutarea pe rol îl includea înapoi pe el — primea un email că trebuie să aprobe o cerere pe
  // care regula de segregare a sarcinilor îl împiedică oricum s-o aprobe (403 la `parApprovals.ts`).
  if (facts?.requestedByUserId) {
    recipients = recipients.filter((id) => id !== facts.requestedByUserId);
  }
  if (!recipients.length) return;

  // PERF (audit 2026-08-29): bucla era complet secvențială — per destinatar un INSERT, un SELECT
  // și un apel HTTP către Resend, toate `await`-uite pe calea cererii. Cu cinci aprobatori,
  // trimiterea unei cereri însemna ~15 dus-întorsuri înlănțuite, iar utilizatorul aștepta
  // secunde bune pentru munca de notificare, nu pentru propria acțiune.
  //
  // Acum: un singur SELECT pentru toți destinatarii, iar notificările pleacă în paralel.
  // `allSettled`, nu `all`: un email eșuat nu are voie să anuleze restul (notificarea a fost
  // dintotdeauna best-effort).
  const recipientRows = recipients.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, ctx.tenantId), inArray(users.id, recipients)))
    : [];
  const emailById = new Map(recipientRows.map((u) => [u.id, u.email]));

  await Promise.allSettled(
    recipients.flatMap((userId) => {
      const tasks = [
        sendInApp({ tenantId: ctx.tenantId, recipientUserId: userId, body: inAppBody, parId: ctx.parId }),
      ];
      const email = emailById.get(userId);
      if (email && emailNow) {
        tasks.push(sendEmail({ tenantId: ctx.tenantId, toAddress: email, subject, body: emailBody }));
      }
      return tasks;
    })
  );
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

/**
 * Coada fiecărui email PAR: în CE workspace și pe CE cont duce linkul.
 *
 * Fără ea, un destinatar care are conturi în mai multe workspace-uri deschide linkul din sesiunea
 * greșită și primește un 404 fără explicație (incidentul 2026-08-28). Informația trebuie să fie în
 * email, nu doar în pagina de eroare. Best-effort: dacă interogarea pică, emailul pleacă neschimbat.
 */
async function accountFooter(tenantId: string, toAddress: string): Promise<string> {
  try {
    const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
    const workspace = t?.name ? `Workspace: ${t.name} · ` : "";
    return `\n\n${workspace}Cont destinatar: ${toAddress}`;
  } catch {
    return "";
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
      body: params.body + (await accountFooter(params.tenantId, params.toAddress)),
    });
  } catch {
    // Best-effort — never crash the caller
  }
}

/**
 * Corpul notificării in-app conține „Link: /business/par/<id>" — o cale relativă, utilă doar în
 * aplicație. În email era text mort (niciun client nu o poate deschide), pe lângă linkul absolut
 * adăugat mai jos. Se scoate ca destinatarul să vadă un singur link, cel care chiar funcționează.
 */
export function stripInAppLink(body: string): string {
  // `\S+` și nu doar hex: identificatorul cererii nu e garantat un UUID, iar o cale
  // nerecunoscută însemna un link mort lăsat în email — exact ce funcția asta trebuie să scoată.
  return body.replace(/\s*Link:\s*\/business\/par\/\S+/gi, "").trim();
}

/** Notify a single user (in-app + email) */
async function notifyUser(params: {
  tenantId: string;
  userId: string;
  parId: string;
  body: string;
  subject: string;
  /**
   * In-app rămâne o singură linie (lista de notificări e o listă, nu un raport), iar emailul
   * primește în plus blocul de detalii — acolo destinatarul chiar are nevoie de context,
   * fiindcă nu are aplicația în față.
   */
  detailsBlock?: string | null;
  /**
   * VM5-13: `false` ține notificarea doar în aplicație, iar emailul îl face digestul de 09:00 /
   * 16:00. Implicit `true` — respingerea, „modificări cerute", plata și anularea plății rămân
   * instantanee: alea cer o reacție acum, nu peste opt ore.
   */
  emailNow?: boolean;
}): Promise<void> {
  await sendInApp({
    tenantId: params.tenantId,
    recipientUserId: params.userId,
    body: params.body,
    parId: params.parId,
  });

  if (params.emailNow === false) return;

  // Optional email — best-effort only. Căutarea destinatarului e și ea best-effort: notificarea
  // pleacă după ce acțiunea (plata, respingerea) s-a scris deja în DB, așa că o eroare aici nu
  // are voie să întoarcă 500 pe o operațiune care a reușit.
  let userRecord: { name: string; email: string } | null = null;
  try {
    userRecord = await getUser(params.userId, params.tenantId);
  } catch {
    return;
  }
  if (userRecord?.email) {
    const emailBody = [
      stripInAppLink(params.body),
      "",
      params.detailsBlock ?? null,
      params.detailsBlock ? "" : null,
      `Deschide cererea: ${parDeepLink(params.parId)}`,
    ]
      .filter((l) => l !== null)
      .join("\n");
    await sendEmail({
      tenantId: params.tenantId,
      toAddress: userRecord.email,
      subject: params.subject,
      body: emailBody,
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


/**
 * VM5-01 — cine a decis și când, scris în română, pentru corpul notificării.
 *
 * Din ședința de prezentare: „persoana care a elaborat PAR să primească feedback cu statutul
 * PAR-ului și motivul". Mecanica exista, dar emailul era în engleză („PAR-2026-0025 was rejected")
 * și nu spunea cine a decis — un feedback pe care omul nu-l citește ca feedback.
 */
async function decidedByLabel(tenantId: string, decidedByUserId?: string | null): Promise<string> {
  if (!decidedByUserId) return "";
  const u = await getUser(decidedByUserId, tenantId);
  const name = u?.name?.trim() || u?.email?.trim();
  return name ? ` de ${name}` : "";
}

/** Momentul deciziei în format românesc: „10.09.2026, 14:32". */
function nowLabel(): string {
  return new Date().toLocaleString("ro-MD", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
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
  await notifyApprovers({ ctx, specificUserId: approverUserId });
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
  await notifyApprovers({ ctx, specificUserId: nextApproverUserId, stepLabel: nextStepLabel });
}

/**
 * On final approval with purpose=execute_payment → notify all finance users.
 *
 * VM5-13: ca și la aprobatori, emailul per-cerere s-a oprit. Finanțele primesc in-app pe loc, iar
 * pe email secțiunea „de executat" din digestul de 09:00 / 16:00. Excepția rămâne cererea urgentă.
 */
export async function notifyFullyApprovedToFinance(ctx: ParNotifyContext): Promise<void> {
  const financeUsers = await getFinanceUsers(ctx.tenantId);
  if (financeUsers.length === 0) return;

  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const body = `${outcomeLine(facts, ctx.requestNo, "e aprobată complet și așteaptă execuția plății")} Link: /business/par/${ctx.parId}`;
  const subject = subjectFor(
    facts,
    ctx.requestNo,
    facts?.isUrgent ? "URGENT — gata de plată" : "gata de plată"
  );
  const detailsBlock = facts ? summaryBlock(facts) : null;
  const emailNow = facts?.isUrgent === true;

  for (const userId of financeUsers) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId,
      parId: ctx.parId,
      body,
      subject,
      detailsBlock,
      emailNow,
    });
  }
}

/**
 * VM5-13: aprobatorii care au semnat deja află ce s-a ales de cererea lor.
 *
 * Owner-ul: „cel care a acceptat să primească updates". Până acum, cine aproba la pasul 1 nu mai
 * afla nimic — nici că cererea a trecut de toate pasurile, nici că s-a plătit. Singurul update
 * existent era respingerea de către altcineva (VM5-12, `notifyOthersRequestStopped`).
 *
 * Doar in-app: un update nu e o sarcină, deci nu merită să spargă regula celor două emailuri pe zi.
 * Ajunge pe email prin secțiunea „Ce s-a întâmplat cu cererile pe care le-ai aprobat" din digest.
 */
export async function notifyPriorApprovers(
  ctx: ParNotifyContext,
  approverUserIds: readonly string[],
  verbPhrase: string,
  opts?: { amountLabel?: string }
): Promise<void> {
  const recipients = [...new Set(approverUserIds)].filter(Boolean);
  if (!recipients.length) return;

  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const body = `${outcomeLine(facts, ctx.requestNo, verbPhrase, { amountLabel: opts?.amountLabel })} Ai aprobat-o tu. Link: /business/par/${ctx.parId}`;

  await Promise.allSettled(
    recipients.map((userId) =>
      sendInApp({ tenantId: ctx.tenantId, recipientUserId: userId, body, parId: ctx.parId, kind: "par_update" })
    )
  );
}

/**
 * VF-101: On final approval → notify the requestor that their PAR cleared all approvals.
 * Complements notifyFullyApprovedToFinance (which targets finance). Best-effort.
 */
export async function notifyApprovedToRequestor(
  ctx: ParNotifyContext,
  requestorUserId: string
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body: `${outcomeLine(facts, ctx.requestNo, "a fost aprobată")} Link: /business/par/${ctx.parId}`,
    subject: subjectFor(facts, ctx.requestNo, "aprobată"),
    detailsBlock: facts ? summaryBlock(facts) : null,
  });
}

/**
 * On reject → notify the requestor with the rejection comment.
 */
export async function notifyRejected(
  ctx: ParNotifyContext,
  requestorUserId: string,
  comment: string,
  decidedByUserId?: string | null
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const who = await decidedByLabel(ctx.tenantId, decidedByUserId);
  const body = [
    outcomeLine(facts, ctx.requestNo, `a fost RESPINSĂ${who} pe ${nowLabel()}`),
    `Motiv: ${comment.slice(0, 500)}`,
    "Cererea nu se oprește aici: o poți revizui și retrimite din aplicație.",
    `Link: /business/par/${ctx.parId}`,
  ].join("\n");

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "respinsă"),
    detailsBlock: facts ? summaryBlock(facts) : null,
  });
}

/**
 * On request-changes → notify the requestor with the comment.
 */
export async function notifyChangesRequested(
  ctx: ParNotifyContext,
  requestorUserId: string,
  comment: string,
  decidedByUserId?: string | null
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const who = await decidedByLabel(ctx.tenantId, decidedByUserId);
  const body = [
    outcomeLine(facts, ctx.requestNo, `a fost trimisă înapoi pentru MODIFICĂRI${who} pe ${nowLabel()}`),
    `Ce trebuie modificat: ${comment.slice(0, 500)}`,
    `Link: /business/par/${ctx.parId}`,
  ].join("\n");

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "modificări cerute"),
    detailsBlock: facts ? summaryBlock(facts) : null,
  });
}

/**
 * On paid → notify the requestor.
 *
 * `actualAmountCents` vine din secțiunea de plată și poate diferi de estimare (regula de 10%);
 * când îl avem, notificarea spune suma chiar achitată, nu estimarea.
 */
export async function notifyPaid(
  ctx: ParNotifyContext,
  requestorUserId: string,
  paid?: { actualAmountCents?: number | null }
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const paidAmountLabel =
    paid?.actualAmountCents != null ? formatParAmount(paid.actualAmountCents, facts?.currency) : null;
  const body = `${outcomeLine(facts, ctx.requestNo, "a fost achitată", { amountLabel: paidAmountLabel ?? undefined })} Link: /business/par/${ctx.parId}`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "plată executată", paidAmountLabel ?? undefined),
    detailsBlock: facts ? summaryBlock(facts, { paidAmountLabel }) : null,
  });
}

/**
 * Suma achitată depășește estimarea cu peste 10% → cererea se întoarce la ultimul aprobator.
 *
 * Era singura notificare PAR fără email (doar in-app, în engleză, scrisă direct în ruta de
 * plată): omul care TREBUIE să decidă afla doar dacă intra în aplicație. Acum primește și
 * email, cu ambele sume și diferența — exact ce-i trebuie ca să știe dacă mai aprobă.
 */
export async function notifyReapprovalRequired(
  ctx: ParNotifyContext,
  approverUserId: string,
  amounts: { estimatedCents: number; actualAmountCents: number }
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const currency = facts?.currency ?? "MDL";
  const actualLabel = formatParAmount(amounts.actualAmountCents, currency);
  const overLabel = formatParAmount(amounts.actualAmountCents - amounts.estimatedCents, currency);
  const verb = `necesită re-aprobare: s-a achitat ${actualLabel}, cu ${overLabel} peste estimare`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: approverUserId,
    parId: ctx.parId,
    body: `${outcomeLine(facts, ctx.requestNo, verb)} Link: /business/par/${ctx.parId}`,
    subject: subjectFor(facts, ctx.requestNo, "re-aprobare necesară", actualLabel),
    detailsBlock: facts ? summaryBlock(facts, { paidAmountLabel: actualLabel }) : null,
  });
}

/**
 * VM4-01 — plata a fost anulată de finanțe (click greșit pe „plătit").
 * Solicitantul a primit deja „PAR plătit"; fără această a doua notificare ar rămâne
 * cu informația greșită în inbox.
 */
export async function notifyPaymentReverted(
  ctx: ParNotifyContext,
  requestorUserId: string,
  reason: string
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const body = `${outcomeLine(facts, ctx.requestNo, "a fost ANULATĂ de finanțe, iar cererea a revenit la plată")} Motiv: ${reason.slice(0, 500)}. Link: /business/par/${ctx.parId}`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "plata a fost anulată"),
    detailsBlock: facts ? summaryBlock(facts) : null,
  });
}

/**
 * VM4-02 — finanțele refuză plata și trimit cererea înapoi la solicitant pentru corectare.
 */
export async function notifyFinanceReturned(
  ctx: ParNotifyContext,
  requestorUserId: string,
  reason: string
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const body = `${outcomeLine(facts, ctx.requestNo, "a fost refuzată de finanțe, iar cererea s-a întors la tine pentru corectare")} Motiv: ${reason.slice(0, 500)}. Link: /business/par/${ctx.parId}`;

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "plată refuzată de finanțe"),
    detailsBlock: facts ? summaryBlock(facts) : null,
  });
}

/**
 * Verificatorul solicitantului a corectat cererea înainte de aprobatori → solicitantul află CE i
 * s-a schimbat și CINE a schimbat. Nu cere o reacție (cererea merge mai departe singură), deci
 * rămâne în aplicație, iar emailul îl face digestul — ca aprobările intermediare.
 */
export async function notifyVerifierAmended(
  ctx: ParNotifyContext,
  requestorUserId: string,
  verifierUserId: string,
  fieldLabels: readonly string[]
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const who = await decidedByLabel(ctx.tenantId, verifierUserId);
  const what = fieldLabels.length ? `: ${fieldLabels.join(", ")}` : "";
  const body = [
    outcomeLine(facts, ctx.requestNo, `a fost corectată la verificare${who} pe ${nowLabel()}${what}`),
    "Aprobatorii de după verificare o vor vedea în varianta corectată.",
    `Link: /business/par/${ctx.parId}`,
  ].join("\n");

  await notifyUser({
    tenantId: ctx.tenantId,
    userId: requestorUserId,
    parId: ctx.parId,
    body,
    subject: subjectFor(facts, ctx.requestNo, "corectată la verificare"),
    detailsBlock: facts ? summaryBlock(facts) : null,
    emailNow: false,
  });
}

// ─── PAR-EFP: e-Factura lipsă de la prestator ─────────────────────────────────

export interface EfacturaReminderInput {
  /** Prestatorul care trebuie să emită factura. */
  payeeName: string;
  /** Suma plătită, deja formatată („12.500,00 MDL"). */
  amountLabel: string;
  /** Ce s-a plătit — scopul din cerere, scurtat. */
  servicesLabel: string;
  /** Data plății, formatată. Null dacă nu e cunoscută. */
  paidAtLabel: string | null;
  /** Contactul prestatorului din registru (email / telefon), dacă îl avem. */
  vendorContact?: string | null;
}

/**
 * Prestatorul nu a emis e-Factura → i se scrie SOLICITANTULUI cererii, nu prestatorului.
 *
 * De ce solicitantului: el e cel care are relația cu prestatorul și îl poate suna. Un email plecat
 * automat către o adresă de prestator luată din registru ajunge des la cine nu trebuie și nu are
 * cine să răspundă la el. Textul îi dă omului tot ce trebuie ca să ceară factura într-un minut:
 * cine, pentru ce, ce sumă, când s-a plătit.
 */
export async function notifyEfacturaMissing(
  ctx: ParNotifyContext,
  requestorUserId: string,
  input: EfacturaReminderInput
): Promise<{ emailed: boolean; toAddress: string | null }> {
  const lines = [
    `Reamintire: prestatorul ${input.payeeName} nu a emis încă e-Factura pentru cererea ${ctx.requestNo}.`,
    `Servicii/bunuri: ${input.servicesLabel}`,
    `Sumă achitată: ${input.amountLabel}${input.paidAtLabel ? ` · plătită la ${input.paidAtLabel}` : ""}`,
    input.vendorContact ? `Contact prestator: ${input.vendorContact}` : null,
    "",
    `Te rugăm să-i amintești să emită e-Factura pentru suma și serviciile de mai sus.`,
  ].filter((l): l is string => l !== null);
  const body = lines.join("\n");
  const subject = `[PAR] ${ctx.requestNo} — lipsește e-Factura de la ${input.payeeName}`;

  await sendInApp({
    tenantId: ctx.tenantId,
    recipientUserId: requestorUserId,
    body: `${body}\n\nLink: /business/par/${ctx.parId}`,
    parId: ctx.parId,
  });

  const userRecord = await getUser(requestorUserId, ctx.tenantId);
  if (!userRecord?.email) return { emailed: false, toAddress: null };

  try {
    const message = await messagingService.sendMessage(ctx.tenantId, {
      channel: "email",
      toAddress: userRecord.email,
      subject,
      body:
        `${body}\n\nDeschide cererea: ${parDeepLink(ctx.parId)}` +
        (await accountFooter(ctx.tenantId, userRecord.email)),
    });
    return { emailed: message.status === "sent", toAddress: userRecord.email };
  } catch {
    return { emailed: false, toAddress: userRecord.email };
  }
}

/**
 * VM5-12: ceilalți aprobatori ai aceleiași cereri află că nu mai au ce decide.
 *
 * Întrebarea din ședință: „ce se întâmplă când unul respinge, iar altul aprobă". Regula aplicației
 * e că prima respingere oprește tot — corectă, dar până acum tăcută: cererea dispărea din inboxul
 * celorlalți fără o vorbă, iar cine semnase deja nu afla că decizia lui a fost anulată de altcineva.
 */
export async function notifyOthersRequestStopped(
  ctx: ParNotifyContext,
  recipientUserIds: readonly string[],
  decidedByUserId: string | null,
  comment: string
): Promise<void> {
  const facts = await loadParFacts(ctx.tenantId, ctx.parId);
  const who = await decidedByLabel(ctx.tenantId, decidedByUserId);
  const body = [
    `${outcomeLine(facts, ctx.requestNo, `a fost RESPINSĂ${who} pe ${nowLabel()}`)} Nu mai așteaptă decizia ta.`,
    `Motiv: ${comment.slice(0, 500)}`,
    "Prima respingere oprește cererea, chiar dacă alți aprobatori semnaseră deja. Solicitantul o poate revizui și retrimite — atunci lanțul de aprobare pornește din nou.",
    `Link: /business/par/${ctx.parId}`,
  ].join("\n");
  const subject = subjectFor(facts, ctx.requestNo, "respinsă de altcineva, nu mai așteaptă decizia ta");
  const detailsBlock = facts ? summaryBlock(facts) : null;

  await Promise.allSettled(
    [...new Set(recipientUserIds)].map((userId) =>
      notifyUser({ tenantId: ctx.tenantId, userId, parId: ctx.parId, body, subject, detailsBlock })
    )
  );
}
