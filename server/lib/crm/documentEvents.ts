/**
 * CRM-D05 — actul în viața leadului.
 *
 * Înainte, un act era o insulă: oferta se trimitea, clientul o deschidea, contractul se semna — și
 * leadul rămânea în „Lead nou", fără nicio urmă în istoric. Vânzătorul muta cartonașul de mână
 * (sau uita), iar rapoartele, care numără câștigurile din mutările de etapă, nu vedeau vânzarea.
 *
 * Aici fiecare pas al actului lasă o urmă pe lead și, unde are sens, îl mută:
 *   created  → rând în istoric
 *   sent     → rând în istoric; o OFERTĂ mută leadul în etapa de ofertă, dacă e încă înaintea ei
 *   viewed   → rând în istoric + notificare către responsabilul leadului
 *   signed   → rând în istoric; un CONTRACT semnat mută leadul în etapa câștigată
 *   rejected → rând în istoric (fără mutare: „pierdut" cere un motiv ales de om)
 *
 * Reguli de siguranță: leadul NU e mutat înapoi niciodată, NU e scos dintr-o etapă finală
 * (câștigat/pierdut), iar orice eroare de aici e înghițită și logată — trimiterea unui act nu are
 * voie să pice pentru că CRM-ul n-a reușit să mute un cartonaș.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions } from "../../db/schema/leads";
import { createNotification } from "../createNotification";
import { applyLeadStageChange, resolveLeadPipeline, stagesOfPipeline, type PipelineStageRow } from "./changeStage";

export type LeadDocumentEvent = "created" | "sent" | "viewed" | "signed" | "rejected";

export interface LeadDocumentRef {
  id: string;
  tenantId: string;
  kind: string;
  title: string;
  docNumber: string | null;
  counterpartyKind: string | null;
  counterpartyId: string | null;
}

const KIND_NOUN: Record<string, string> = {
  oferta_comerciala: "Oferta",
  contract_servicii: "Contractul",
  act_primire_predare: "Actul de primire-predare",
};

function docName(doc: LeadDocumentRef): string {
  const noun = KIND_NOUN[doc.kind] ?? "Actul";
  return doc.docNumber ? `${noun} ${doc.docNumber}` : `${noun} „${doc.title}"`;
}

function sentence(doc: LeadDocumentRef, event: LeadDocumentEvent, detail?: string | null): string {
  const name = docName(doc);
  switch (event) {
    case "created":
      return `${name} a fost creat ca ciornă.`;
    case "sent":
      return detail ? `${name} a fost trimis la ${detail}.` : `${name} a fost trimis clientului.`;
    case "viewed":
      return `Clientul a deschis ${name.charAt(0).toLowerCase()}${name.slice(1)}.`;
    case "signed":
      return `${name} a fost semnat.`;
    case "rejected":
      return detail ? `${name} a fost refuzat: ${detail}` : `${name} a fost refuzat.`;
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Etapa în care intră leadul, sau `null` dacă nu se mută. Pură — testabilă fără bază.
 *
 * Etapa de ofertă se recunoaște după nume („Ofertă trimisă", „Propunere / ofertă") — pâlniile sunt
 * configurabile și n-au un flag dedicat; aceeași regulă ca raportul „oferte trimise".
 */
export function targetStageFor(
  doc: Pick<LeadDocumentRef, "kind">,
  event: LeadDocumentEvent,
  currentKey: string,
  stages: readonly PipelineStageRow[]
): PipelineStageRow | null {
  const current = stages.find((s) => s.key === currentKey);
  // O etapă finală rămâne finală: un contract semnat pe un lead marcat „pierdut" e o decizie de om.
  if (current && (current.isWon || current.isLost)) return null;
  const open = stages.filter((s) => !s.isWon && !s.isLost);

  let target: PipelineStageRow | undefined;
  if (event === "sent" && doc.kind === "oferta_comerciala") {
    target = open.find((s) => norm(s.label).includes("ofert") || norm(s.label).includes("propunere"));
  } else if (event === "signed" && doc.kind === "contract_servicii") {
    target = stages.find((s) => s.isWon);
  }
  if (!target || target.key === currentKey) return null;
  // Niciodată înapoi: un lead deja în „Negociere" nu coboară în „Ofertă" la o retrimitere.
  if (current && target.orderIndex <= current.orderIndex && !target.isWon) return null;
  return target;
}

export async function recordLeadDocumentEvent(opts: {
  doc: LeadDocumentRef;
  event: LeadDocumentEvent;
  /** Cine a făcut pasul; `null` = clientul (vizualizare pe linkul public). */
  userId: string | null;
  /** Adresa de trimitere / motivul refuzului. */
  detail?: string | null;
}): Promise<{ movedTo: string | null }> {
  const { doc, event, userId, detail = null } = opts;
  if (doc.counterpartyKind !== "crm_lead" || !doc.counterpartyId) return { movedTo: null };
  try {
    const [lead] = await db
      .select({ id: leads.id, stage: leads.stage, pipelineId: leads.pipelineId, assignedTo: leads.assignedTo, fullName: leads.fullName, company: leads.company })
      .from(leads)
      .where(and(eq(leads.id, doc.counterpartyId), eq(leads.tenantId, doc.tenantId)));
    if (!lead) return { movedTo: null };

    await db.insert(leadInteractions).values({
      tenantId: doc.tenantId,
      leadId: lead.id,
      type: "system",
      direction: event === "viewed" ? "inbound" : "internal",
      body: sentence(doc, event, detail),
      metadata: { documentId: doc.id, documentKind: doc.kind, docNumber: doc.docNumber, event },
      userId,
    });

    if (event === "viewed" && lead.assignedTo) {
      await createNotification({
        tenantId: doc.tenantId,
        userId: lead.assignedTo,
        type: "crm_document_viewed",
        title: `${lead.company || lead.fullName} a deschis ${docName(doc).toLowerCase()}`,
        body: "Momentul potrivit pentru un telefon — oferta e proaspătă în mintea clientului.",
        link: `/business/crm/pipeline?lead=${lead.id}`,
        metadata: { leadId: lead.id, documentId: doc.id },
      });
    }

    // Mutarea o face cine a declanșat pasul; la vizualizare (client) nu se mută nimic.
    if (!userId) return { movedTo: null };
    const pipeline = await resolveLeadPipeline(doc.tenantId, lead.pipelineId);
    const stages = await stagesOfPipeline(doc.tenantId, pipeline?.id ?? null);
    const target = targetStageFor(doc, event, lead.stage, stages);
    if (!target) return { movedTo: null };
    await applyLeadStageChange({
      tenantId: doc.tenantId,
      userId,
      leadId: lead.id,
      fromStage: lead.stage,
      toStage: target.key,
      isLost: false,
      cause: sentence(doc, event, event === "rejected" ? detail : null),
    });
    return { movedTo: target.key };
  } catch (err) {
    console.error("[crm/documentEvents]", event, doc.id, err instanceof Error ? err.message : err);
    return { movedTo: null };
  }
}
