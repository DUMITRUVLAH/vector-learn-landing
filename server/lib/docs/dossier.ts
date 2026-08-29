/**
 * DG-120/121 — dosarele: toate actele unui proiect, respectiv ale unei contrapărți.
 *
 * Întrebările cărora le răspund, azi puse pe chat sau amânate până „caut prin foldere":
 *  - „ce am contractat pe proiectul X și cât din bani au ieșit deja?" (donatorul, în ședință);
 *  - „ce acte avem cu furnizorul Y și și-a schimbat rechizitele de la ultimul?" (înainte de o plată).
 *
 * „Plătit" se citește din PAR-urile legate de acte, nu dintr-un câmp scris de mână: singura sursă
 * onestă e cererea de plată care chiar a fost executată.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { docDocuments, docDocumentLinks } from "../../db/schema/docs";
import { parRequests, parVendors } from "../../db/schema/par";

export interface DossierDocument {
  id: string;
  kind: string;
  docNumber: string | null;
  title: string;
  status: string;
  docDate: Date;
  totalCents: number;
  currency: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  projectId: string | null;
  /** Cererile de plată născute din act, cu starea lor. */
  paymentRequests: {
    id: string;
    requestNo: string;
    status: string;
    totalEstimatedCents: number;
    paidAt: Date | null;
  }[];
}

/** Sumele nu se adună între valute — ar produce un total fals, care sună convingător. */
export interface CurrencyTotals {
  [currency: string]: { contractedCents: number; paidCents: number };
}

async function loadDocuments(
  tenantId: string,
  where: ReturnType<typeof and>
): Promise<DossierDocument[]> {
  const docs = await db.select().from(docDocuments).where(where);
  if (docs.length === 0) return [];

  const links = await db
    .select()
    .from(docDocumentLinks)
    .where(
      and(
        eq(docDocumentLinks.tenantId, tenantId),
        inArray(
          docDocumentLinks.fromDocumentId,
          docs.map((d) => d.id)
        ),
        eq(docDocumentLinks.toKind, "par")
      )
    );
  const parIds = links.map((l) => l.toParId).filter((x): x is string => !!x);
  const pars = parIds.length
    ? await db
        .select({
          id: parRequests.id,
          requestNo: parRequests.requestNo,
          status: parRequests.status,
          totalEstimatedCents: parRequests.totalEstimatedCents,
          paidAt: parRequests.paidAt,
        })
        .from(parRequests)
        .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds)))
    : [];

  return docs.map((d) => ({
    id: d.id,
    kind: d.kind,
    docNumber: d.docNumber,
    title: d.title,
    status: d.status,
    docDate: d.docDate,
    totalCents: d.totalCents,
    currency: d.currency,
    counterpartyId: d.counterpartyId,
    counterpartyName: d.counterpartyName,
    projectId: d.projectId,
    paymentRequests: links
      .filter((l) => l.fromDocumentId === d.id)
      .map((l) => pars.find((p) => p.id === l.toParId))
      .filter((p): p is NonNullable<typeof p> => !!p),
  }));
}

export function totalsByCurrency(docs: DossierDocument[]): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const d of docs) {
    if (d.status === "cancelled") continue;
    const bucket = (totals[d.currency] ??= { contractedCents: 0, paidCents: 0 });
    bucket.contractedCents += d.totalCents;
    // Plătit = doar cererile care chiar au fost executate.
    bucket.paidCents += d.paymentRequests
      .filter((p) => !!p.paidAt || p.status === "paid")
      .reduce((s, p) => s + p.totalEstimatedCents, 0);
  }
  return totals;
}

export interface ProjectDossier {
  documents: DossierDocument[];
  totals: CurrencyTotals;
  /** Gruparea pe contraparte — așa se citește un dosar de proiect. */
  byCounterparty: {
    counterpartyId: string | null;
    counterpartyName: string;
    documents: DossierDocument[];
    totals: CurrencyTotals;
  }[];
}

export async function buildProjectDossier(
  tenantId: string,
  projectId: string
): Promise<ProjectDossier> {
  const documents = await loadDocuments(
    tenantId,
    and(eq(docDocuments.tenantId, tenantId), eq(docDocuments.projectId, projectId))
  );

  const groups = new Map<string, DossierDocument[]>();
  for (const d of documents) {
    const key = d.counterpartyId ?? d.counterpartyName ?? "—";
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }

  return {
    documents,
    totals: totalsByCurrency(documents),
    byCounterparty: [...groups.entries()].map(([, docs]) => ({
      counterpartyId: docs[0].counterpartyId,
      counterpartyName: docs[0].counterpartyName ?? "Fără contraparte",
      documents: docs,
      totals: totalsByCurrency(docs),
    })),
  };
}

export interface RequisiteChange {
  field: string;
  label: string;
  onLastAct: string | null;
  inRegistry: string | null;
}

export interface CounterpartyDossier {
  documents: DossierDocument[];
  totals: CurrencyTotals;
  /** Diferențele dintre rechizitele din ultimul act semnat și cele curente din registru. */
  requisiteChanges: RequisiteChange[];
}

const REQUISITE_FIELDS: { snapshot: string; label: string; vendor: keyof typeof VENDOR_KEYS }[] = [
  { snapshot: "iban", label: "IBAN", vendor: "iban" },
  { snapshot: "idno", label: "Cod fiscal", vendor: "idnp" },
  { snapshot: "banca", label: "Banca", vendor: "bank" },
];
const VENDOR_KEYS = { iban: "iban", idnp: "idnp", bank: "bank" } as const;

export async function buildCounterpartyDossier(
  tenantId: string,
  counterpartyId: string
): Promise<CounterpartyDossier> {
  const documents = await loadDocuments(
    tenantId,
    and(eq(docDocuments.tenantId, tenantId), eq(docDocuments.counterpartyId, counterpartyId))
  );

  // Rechizitele din ultimul act SEMNAT sunt martorul: ele au fost bune la momentul semnării.
  const lastFinal = [...documents]
    .filter((d) => d.status === "final")
    .sort((a, b) => b.docDate.getTime() - a.docDate.getTime())[0];

  const requisiteChanges: RequisiteChange[] = [];
  if (lastFinal) {
    const [row] = await db
      .select()
      .from(docDocuments)
      .where(and(eq(docDocuments.id, lastFinal.id), eq(docDocuments.tenantId, tenantId)));
    const [vendor] = await db
      .select()
      .from(parVendors)
      .where(and(eq(parVendors.id, counterpartyId), eq(parVendors.tenantId, tenantId)));
    if (row && vendor) {
      let snapshot: Record<string, string> = {};
      try {
        snapshot = JSON.parse(row.counterpartySnapshot ?? "{}") as Record<string, string>;
      } catch {
        snapshot = {};
      }
      for (const f of REQUISITE_FIELDS) {
        const onAct = snapshot[f.snapshot] ?? null;
        const current = (vendor as unknown as Record<string, string | null>)[VENDOR_KEYS[f.vendor]] ?? null;
        if (onAct && current && onAct !== current) {
          requisiteChanges.push({ field: f.snapshot, label: f.label, onLastAct: onAct, inRegistry: current });
        }
      }
    }
  }

  return { documents, totals: totalsByCurrency(documents), requisiteChanges };
}
