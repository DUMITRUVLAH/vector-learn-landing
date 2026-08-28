/**
 * PAR-EFP: scanarea SIA „e-Factura" (SFS) după facturile pe care prestatorii trebuie să le emită
 * pentru cererile PAR deja achitate.
 *
 * Două operații distincte, intenționat separate:
 *   1. `syncEfacturaCandidates` — care cereri AȘTEAPTĂ o factură. Nu are nevoie de SFS: se decide
 *      din datele cererii (plătită + beneficiar persoană juridică cu cod fiscal). Așa coada de
 *      urmărire și butonul de reminder funcționează și fără integrare SFS configurată.
 *   2. `scanEfacturasForTenant` — interoghează SFS ca CUMPĂRĂTOR și potrivește facturile primite
 *      cu cererile care așteaptă.
 *
 * Regula de onestitate: dacă SFS nu e configurat (sau rulăm pe mock), scanarea NU declară „nu s-a
 * găsit". Întoarce `available: false` și nu atinge starea — altfel ai trimite un reminder unui
 * prestator care și-a făcut treaba, doar pentru că noi nu aveam credențiale.
 *
 * REUSE: `EfacturaMdClient` (server/lib/efacturaMoldova.ts) + `loadSfsConfig` (server/lib/fin/
 * sfsConfig.ts) + potrivirea pură din server/lib/par/efacturaMatch.ts.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { parRequests, parPayments, parVendors, parPayers } from "../../db/schema/par";
import { parEinvoices } from "../../db/schema/parEinvoices";
import { loadSfsConfig } from "../../lib/fin/sfsConfig";
import {
  EfacturaMdClient,
  EFACTURA_MD_ACTOR,
  type InvoiceListItem,
} from "../../lib/efacturaMoldova";
import {
  expectsEfactura,
  matchInvoiceForPar,
  summarizeSfsInvoice,
  invoiceKey,
  normalizeFiscalId,
  type SfsInvoiceSummary,
} from "../../lib/par/efacturaMatch";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export interface EfacturaScanResult {
  /** false = SFS neconfigurat / mod simulat: starea NU a fost modificată. */
  available: boolean;
  source: "sfs" | "mock";
  /** Câte cereri au fost evaluate. */
  checked: number;
  /** Câte facturi au fost găsite ACUM (tranziții expected → found). */
  found: number;
  /** Câte cereri rămân fără factură după scanare. */
  missing: number;
  /** Câte facturi au fost citite din SFS. */
  invoicesFetched: number;
  /** Mesaj pentru om (inclusiv erorile parțiale de la SFS). */
  message: string;
}

/** Rândul de cerere de care are nevoie sincronizarea (subset din par_requests). */
interface CandidateRow {
  id: string;
  status: string;
  purpose: string;
  payeeType: string | null;
  payeeIdnp: string | null;
  vendorId: string | null;
  payerId: string | null;
  paidAt: Date | null;
  totalEstimatedCents: number;
  totalMdlCents: number | null;
  currency: string;
}

// ─── 1. Ce cereri așteaptă o factură ──────────────────────────────────────────

async function loadCandidates(tenantId: string, parIds?: string[]): Promise<CandidateRow[]> {
  const where = parIds?.length
    ? and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds))
    : and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "paid"));

  const rows = await db
    .select({
      id: parRequests.id,
      status: parRequests.status,
      purpose: parRequests.purpose,
      payeeType: parRequests.payeeType,
      payeeIdnp: parRequests.payeeIdnp,
      vendorId: parRequests.vendorId,
      payerId: parRequests.payerId,
      paidAt: parRequests.paidAt,
      totalEstimatedCents: parRequests.totalEstimatedCents,
      totalMdlCents: parRequests.totalMdlCents,
      currency: parRequests.currency,
    })
    .from(parRequests)
    .where(where);

  return rows as CandidateRow[];
}

/** Codul fiscal + tipul beneficiarului, completate din registrul de prestatori când cererea tace. */
async function resolvePayeeIdentity(
  tenantId: string,
  rows: CandidateRow[]
): Promise<Map<string, { idno: string | null; kind: string | null; name: string | null }>> {
  const vendorIds = [...new Set(rows.map((r) => r.vendorId).filter((v): v is string => !!v))];
  const vendors = vendorIds.length
    ? await db
        .select({ id: parVendors.id, idnp: parVendors.idnp, kind: parVendors.kind, name: parVendors.name })
        .from(parVendors)
        .where(and(eq(parVendors.tenantId, tenantId), inArray(parVendors.id, vendorIds)))
    : [];
  const byVendor = new Map(vendors.map((v) => [v.id, v]));

  const out = new Map<string, { idno: string | null; kind: string | null; name: string | null }>();
  for (const row of rows) {
    const vendor = row.vendorId ? byVendor.get(row.vendorId) : undefined;
    out.set(row.id, {
      idno: row.payeeIdnp?.trim() || vendor?.idnp?.trim() || null,
      kind: vendor?.kind ?? null,
      name: vendor?.name ?? null,
    });
  }
  return out;
}

/**
 * Creează/actualizează rândul de urmărire pentru fiecare cerere dată (implicit: toate cele plătite).
 * Nu retrogradează niciodată o factură deja găsită sau marcată manual.
 */
export async function syncEfacturaCandidates(
  tenantId: string,
  parIds?: string[]
): Promise<{ expected: number; notApplicable: number }> {
  const rows = await loadCandidates(tenantId, parIds);
  if (rows.length === 0) return { expected: 0, notApplicable: 0 };

  const identity = await resolvePayeeIdentity(tenantId, rows);
  const existing = await db
    .select()
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, tenantId), inArray(parEinvoices.parId, rows.map((r) => r.id))));
  const byPar = new Map(existing.map((e) => [e.parId, e]));

  let expected = 0;
  let notApplicable = 0;

  for (const row of rows) {
    const who = identity.get(row.id)!;
    const verdict = expectsEfactura({
      status: row.status,
      purpose: row.purpose,
      payeeType: row.payeeType,
      payeeIdnp: who.idno,
      vendorKind: who.kind,
    });
    const nextStatus = verdict.expected ? "expected" : "not_applicable";
    if (verdict.expected) expected++;
    else notApplicable++;

    const current = byPar.get(row.id);
    if (!current) {
      await db.insert(parEinvoices).values({
        tenantId,
        parId: row.id,
        status: nextStatus,
        supplierIdno: who.idno ? normalizeFiscalId(who.idno) : null,
        lastScanMessage: verdict.reason,
      });
      continue;
    }
    // O factură găsită sau marcată manual rămâne așa: sincronizarea descrie AȘTEPTAREA, nu rezultatul.
    if (current.status === "found" || current.status === "received_manual") continue;
    if (current.status === nextStatus && current.supplierIdno === (who.idno ? normalizeFiscalId(who.idno) : null)) {
      continue;
    }
    await db
      .update(parEinvoices)
      .set({
        status: nextStatus,
        supplierIdno: who.idno ? normalizeFiscalId(who.idno) : null,
        updatedAt: new Date(),
      })
      .where(eq(parEinvoices.id, current.id));
  }

  return { expected, notApplicable };
}

// ─── 2. Interogarea SFS ───────────────────────────────────────────────────────

/** Câte serii+numere cerem odată la GetInvoicesBySeriaNumber (SFS limitează dimensiunea cererii). */
const DETAIL_CHUNK = 20;

/**
 * Lista facturilor în care organizația e CUMPĂRĂTOR: cele nesemnate încă (venite de la furnizori)
 * plus cele deja acceptate. Fiecare apel e izolat — dacă SFS refuză o metodă (drepturi lipsă),
 * scanarea continuă cu ce a obținut și raportează diferența.
 */
async function fetchBuyerInvoices(
  client: EfacturaMdClient,
  requestId: string
): Promise<{ invoices: SfsInvoiceSummary[]; errors: string[] }> {
  const errors: string[] = [];
  const heads: InvoiceListItem[] = [];

  for (const [label, call] of [
    ["facturi de semnat", () => client.getInvoicesForSigning(`${requestId}-sign`, EFACTURA_MD_ACTOR.CUMPARATOR)],
    ["facturi acceptate", () => client.getAcceptedInvoices(`${requestId}-acc`, EFACTURA_MD_ACTOR.CUMPARATOR)],
  ] as const) {
    try {
      heads.push(...(await call()));
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deduplicare pe serie+număr (o factură poate apărea în ambele liste).
  const uniqueHeads = new Map<string, InvoiceListItem>();
  for (const h of heads) {
    if (h.seria || h.number) uniqueHeads.set(invoiceKey(h), h);
  }

  // Detaliile (furnizor, cumpărător, dată, sumă) vin doar cu XML-ul facturii.
  const identifiers = [...uniqueHeads.values()].map((h) => ({ seria: h.seria, number: h.number }));
  const xmlByKey = new Map<string, string>();
  for (let i = 0; i < identifiers.length; i += DETAIL_CHUNK) {
    const chunk = identifiers.slice(i, i + DETAIL_CHUNK);
    try {
      const detailed = await client.getInvoicesBySeriaNumber(chunk, `${requestId}-xml-${i}`);
      for (const d of detailed) if (d.xml) xmlByKey.set(invoiceKey(d), d.xml);
    } catch (e) {
      errors.push(`detalii facturi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const invoices = [...uniqueHeads.values()].map((h) =>
    summarizeSfsInvoice({ ...h, xml: xmlByKey.get(invoiceKey(h)) ?? h.xml ?? null })
  );
  return { invoices, errors };
}

/** IDNO-ul organizației plătitoare a cererii (noi, cumpărătorul), cu rezervă pe setările SFS. */
async function resolveBuyerIdnos(
  tenantId: string,
  payerIds: string[],
  fallbackIdno: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (payerIds.length > 0) {
    const payers = await db
      .select({ id: parPayers.id, idno: parPayers.idno })
      .from(parPayers)
      .where(and(eq(parPayers.tenantId, tenantId), inArray(parPayers.id, payerIds)));
    for (const p of payers) if (p.idno) out.set(p.id, p.idno);
  }
  out.set("__default__", fallbackIdno);
  return out;
}

/**
 * Scanează SFS și actualizează starea cererilor care așteaptă factură.
 *
 * @param parIds — limitează scanarea la anumite cereri (butonul „Verifică" din pagina cererii).
 */
export async function scanEfacturasForTenant(
  tenantId: string,
  parIds?: string[],
  clientOverride?: EfacturaMdClient
): Promise<EfacturaScanResult> {
  await syncEfacturaCandidates(tenantId, parIds);

  const sfs = clientOverride ? null : await loadSfsConfig(tenantId);
  if (!clientOverride && (!sfs || sfs.config.mock)) {
    return {
      available: false,
      source: "mock",
      checked: 0,
      found: 0,
      missing: 0,
      invoicesFetched: 0,
      message: sfs
        ? "Integrarea e-Factura rulează în mod simulat (fără credențiale SFS) — verificarea reală nu s-a făcut."
        : "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
    };
  }

  const client = clientOverride ?? new EfacturaMdClient(sfs!.config);
  const requestId = `par-efp-${Date.now()}`;
  const { invoices, errors } = await fetchBuyerInvoices(client, requestId);

  // Cererile care așteaptă factură (după sincronizarea de mai sus).
  const trackedWhere = parIds?.length
    ? and(
        eq(parEinvoices.tenantId, tenantId),
        eq(parEinvoices.status, "expected"),
        inArray(parEinvoices.parId, parIds)
      )
    : and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.status, "expected"));
  const tracked = await db.select().from(parEinvoices).where(trackedWhere);

  if (tracked.length === 0) {
    return {
      available: true,
      source: "sfs",
      checked: 0,
      found: 0,
      missing: 0,
      invoicesFetched: invoices.length,
      message: errors.length ? `SFS a răspuns parțial: ${errors.join("; ")}` : "Nicio cerere în așteptare.",
    };
  }

  const pars = await loadCandidates(tenantId, tracked.map((t) => t.parId));
  const parById = new Map(pars.map((p) => [p.id, p]));
  const payments = await db
    .select({ parId: parPayments.parId, actualAmountCents: parPayments.actualAmountCents, paymentDate: parPayments.paymentDate })
    .from(parPayments)
    .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, tracked.map((t) => t.parId))));
  const paymentByPar = new Map(payments.map((p) => [p.parId, p]));
  const buyerIdnos = await resolveBuyerIdnos(
    tenantId,
    [...new Set(pars.map((p) => p.payerId).filter((v): v is string => !!v))],
    sfs?.settings.idno ?? ""
  );

  // Facturile deja atribuite altor cereri nu se refolosesc — nici în această rulare, nici din trecut.
  const alreadyUsed = await db
    .select({ seria: parEinvoices.sfsSeria, number: parEinvoices.sfsNumber })
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.status, "found")));
  const usedKeys = new Set(
    alreadyUsed
      .filter((u) => u.seria && u.number)
      .map((u) => invoiceKey({ seria: u.seria!, number: u.number! }))
  );

  const now = new Date();
  let found = 0;

  // Ordine deterministă: cererile plătite cel mai devreme își aleg factura primele.
  const ordered = [...tracked].sort((a, b) => {
    const pa = parById.get(a.parId)?.paidAt?.getTime() ?? 0;
    const pb = parById.get(b.parId)?.paidAt?.getTime() ?? 0;
    return pa - pb;
  });

  for (const row of ordered) {
    const par = parById.get(row.parId);
    if (!par) continue;
    const payment = paymentByPar.get(row.parId);
    const amountCents =
      payment?.actualAmountCents ??
      (par.currency === "MDL" ? par.totalEstimatedCents : par.totalMdlCents ?? par.totalEstimatedCents);

    const match = matchInvoiceForPar(
      {
        supplierIdno: row.supplierIdno,
        buyerIdno: (par.payerId ? buyerIdnos.get(par.payerId) : null) ?? buyerIdnos.get("__default__") ?? null,
        paidAt: payment?.paymentDate ?? par.paidAt ?? null,
        amountCents,
      },
      invoices,
      { usedKeys, now }
    );

    if (match) {
      usedKeys.add(invoiceKey(match.invoice));
      found++;
      await db
        .update(parEinvoices)
        .set({
          status: "found",
          sfsSeria: match.invoice.seria,
          sfsNumber: match.invoice.number,
          sfsInvoiceStatus: match.invoice.invoiceStatus,
          invoiceDate: match.invoice.invoiceDate,
          invoiceTotalCents: match.invoice.totalCents,
          lastScanAt: now,
          lastScanSource: "sfs",
          lastScanMessage: `Găsită în SFS: ${match.invoice.seria} ${match.invoice.number} · ${match.note}`,
          updatedAt: now,
        })
        .where(eq(parEinvoices.id, row.id));
    } else {
      await db
        .update(parEinvoices)
        .set({
          lastScanAt: now,
          lastScanSource: "sfs",
          lastScanMessage: row.supplierIdno
            ? `Nicio factură de la ${row.supplierIdno} în SFS pentru această plată.`
            : "Beneficiarul nu are cod fiscal — nu avem după ce căuta.",
          updatedAt: now,
        })
        .where(eq(parEinvoices.id, row.id));
    }
  }

  const missing = ordered.length - found;
  const base = `Am citit ${invoices.length} facturi din SFS; ${found} potrivire/potriviri, ${missing} cereri rămân fără factură.`;
  return {
    available: true,
    source: "sfs",
    checked: ordered.length,
    found,
    missing,
    invoicesFetched: invoices.length,
    message: errors.length ? `${base} SFS a răspuns parțial: ${errors.join("; ")}` : base,
  };
}
