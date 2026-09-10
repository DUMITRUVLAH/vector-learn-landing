/**
 * Datele formularului PAR, pregătite pentru tipar.
 *
 * De ce există: formularul oficial (16 secțiuni) se scria DOAR în browser — html2canvas fotografia
 * o pagină ascunsă, deci ieșea o imagine: text neselectabil, tăiat la marginea foii, generat numai
 * pentru cel care apăsa butonul. Consecința practică: dosarul de audit avea formularul doar dacă
 * cineva își amintea să-l descarce în prealabil. Aici încărcăm o singură dată tot ce tipărește
 * formularul, ca serverul să-l poată scrie oricând — la descărcare, în dosar, într-un export.
 *
 * Nu e o a doua sursă de adevăr: citește ACELEAȘI tabele ca ruta de detaliu, doar că întoarce
 * exact câmpurile tipărite, fără drepturi de vizualizare, fără decizii de aprobare (le rezolvă
 * apelantul, ca la dosar).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parRequests,
  parLineItems,
  parApprovals,
  parPayments,
  parDepartments,
  parProjects,
  parEvents,
  parBudgetCodes,
  parMemberProfiles,
} from "../../db/schema/par";
import { users } from "../../db/schema/users";

export interface ParFormLineItem {
  description: string;
  quantity: number | string;
  unit: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface ParFormSignature {
  step: number;
  name: string | null;
  title: string | null;
  decision: string;
  decidedAt: Date | string | null;
}

export interface ParFormData {
  requestNo: string | null;
  dateOfRequest: Date | string | null;
  requestedByName: string | null;
  requestorTitle: string | null;
  requestorCode: string | null;
  departmentName: string | null;
  dateNeeded: Date | string | null;
  projectName: string | null;
  eventName: string | null;
  budgetCodeLabel: string | null;
  purpose: string;
  chargeTo: string;
  chargeBillingCode: string | null;
  currency: string;
  totalEstimatedCents: number;
  totalMdlCents: number | null;
  exchangeRate: string | number | null;
  endUse: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  attachmentsPresent: boolean | null;
  attachmentsNote: string | null;
  lineItems: ParFormLineItem[];
  signatures: ParFormSignature[];
  payment: {
    parBl: string | null;
    receivedAt: Date | string | null;
    receivedByName: string | null;
    assignedToName: string | null;
    paymentDate: Date | string | null;
    paymentRef: string | null;
    actualAmountCents: number | null;
  } | null;
}

/**
 * Încarcă datele pentru o cerere. Întoarce null când cererea nu există în workspace-ul dat;
 * DREPTUL de a o vedea se verifică de apelant (ruta), ca la dosar.
 */
export async function loadParFormData(parId: string, tenantId: string): Promise<ParFormData | null> {
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return null;

  const [items, approvals, paymentRows] = await Promise.all([
    db.select().from(parLineItems)
      .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)))
      .orderBy(asc(parLineItems.position)),
    db.select().from(parApprovals)
      .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
      .orderBy(asc(parApprovals.step)),
    db.select().from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId))),
  ]);
  const payment = paymentRows[0] ?? null;

  const userIds = [
    ...new Set(
      [
        par.requestedByUserId,
        payment?.receivedByUserId ?? null,
        payment?.assignedToUserId ?? null,
        ...approvals.map((a) => a.approverUserId),
      ].filter((v): v is string => !!v)
    ),
  ];

  const [userRows, profileRows, deptRows, projRows, evtRows, bcRows] = await Promise.all([
    userIds.length
      ? db.select({ id: users.id, name: users.name }).from(users)
          .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)))
      : Promise.resolve([] as Array<{ id: string; name: string | null }>),
    userIds.length
      ? db.select({ userId: parMemberProfiles.userId, jobTitle: parMemberProfiles.jobTitle })
          .from(parMemberProfiles)
          .where(and(eq(parMemberProfiles.tenantId, tenantId), inArray(parMemberProfiles.userId, userIds)))
      : Promise.resolve([] as Array<{ userId: string; jobTitle: string | null }>),
    par.departmentId
      ? db.select({ name: parDepartments.name }).from(parDepartments)
          .where(and(eq(parDepartments.tenantId, tenantId), eq(parDepartments.id, par.departmentId)))
      : Promise.resolve([] as Array<{ name: string }>),
    par.projectId
      ? db.select({ name: parProjects.name }).from(parProjects)
          .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.id, par.projectId)))
      : Promise.resolve([] as Array<{ name: string }>),
    (par as { eventId?: string | null }).eventId
      ? db.select({ name: parEvents.name }).from(parEvents)
          .where(and(eq(parEvents.tenantId, tenantId), eq(parEvents.id, (par as { eventId: string }).eventId)))
      : Promise.resolve([] as Array<{ name: string }>),
    par.budgetCodeId
      ? db.select({ code: parBudgetCodes.code, name: parBudgetCodes.name }).from(parBudgetCodes)
          .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.id, par.budgetCodeId)))
      : Promise.resolve([] as Array<{ code: string; name: string }>),
  ]);

  const userName = (id: string | null | undefined) =>
    (id && userRows.find((u) => u.id === id)?.name) || null;
  const jobTitle = (id: string | null | undefined) =>
    (id && profileRows.find((p) => p.userId === id)?.jobTitle) || null;

  return {
    requestNo: par.requestNo,
    dateOfRequest: par.dateOfRequest,
    requestedByName: userName(par.requestedByUserId),
    requestorTitle: par.requestorTitle ?? null,
    requestorCode: par.requestorCode ?? null,
    departmentName: deptRows[0]?.name ?? null,
    dateNeeded: par.dateNeeded,
    projectName: projRows[0]?.name ?? null,
    eventName: evtRows[0]?.name ?? null,
    budgetCodeLabel: bcRows[0]
      ? [bcRows[0].code, bcRows[0].name].filter(Boolean).join(" — ")
      : par.budgetCodeNote ?? null,
    purpose: par.purpose,
    chargeTo: par.chargeTo,
    chargeBillingCode: par.chargeBillingCode ?? null,
    currency: par.currency ?? "MDL",
    totalEstimatedCents: par.totalEstimatedCents,
    totalMdlCents: (par as { totalMdlCents?: number | null }).totalMdlCents ?? null,
    exchangeRate: (par as { exchangeRate?: string | number | null }).exchangeRate ?? null,
    endUse: par.endUse,
    payeeName: par.payeeName,
    payeeIdnp: par.payeeIdnp,
    payeeIban: par.payeeIban,
    payeeBank: par.payeeBank,
    attachmentsPresent: par.attachmentsPresent ?? null,
    attachmentsNote: par.attachmentsNote ?? null,
    lineItems: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit ?? null,
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.lineTotalCents,
    })),
    // Aceeași regulă ca pe ecran: la pasul 0 numele vine din cont (caseta de semnătură a purtat
    // funcția solicitantului până pe 10.09.2026), la pașii de aprobare din caseta semnată.
    signatures: approvals.map((a) => ({
      step: a.step,
      name: a.step === 0
        ? userName(a.approverUserId) ?? a.signatureName ?? null
        : a.signatureName ?? userName(a.approverUserId) ?? null,
      title: a.step === 0
        ? par.requestorTitle ?? a.signatureTitle ?? null
        : a.signatureTitle ?? jobTitle(a.approverUserId) ?? a.approverRoleLabel ?? null,
      decision: a.decision,
      decidedAt: a.decidedAt,
    })),
    payment: payment
      ? {
          parBl: payment.parBl ?? null,
          receivedAt: payment.receivedAt,
          receivedByName: userName(payment.receivedByUserId),
          assignedToName: userName(payment.assignedToUserId),
          paymentDate: payment.paymentDate,
          paymentRef: payment.paymentRef ?? null,
          actualAmountCents: payment.actualAmountCents ?? null,
        }
      : null,
  };
}
