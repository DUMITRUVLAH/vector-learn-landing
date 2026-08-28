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
  parseSfsInvoiceDetail,
  invoiceKey,
  normalizeFiscalId,
  type SfsInvoiceSummary,
  type SfsInvoiceDetail,
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
 * Plafon de facturi pentru care mai cerem XML-ul detaliat.
 *
 * Detaliile (furnizor, dată, sumă) vin cu un apel SOAP la fiecare 20 de facturi, iar serverul taie
 * orice GET la 20 s. Un cont SFS cu istoric mare ar transforma pagina într-un timeout — mai bine
 * arătăm primele N complet și spunem explicit că restul au rămas fără detalii.
 */
const DETAIL_MAX = 200;

/**
 * Lista facturilor în care organizația e CUMPĂRĂTOR: cele nesemnate încă (venite de la furnizori)
 * plus cele deja acceptate. Fiecare apel e izolat — dacă SFS refuză o metodă (drepturi lipsă),
 * scanarea continuă cu ce a obținut și raportează diferența.
 */
/**
 * Cache scurt al listei de facturi, per workspace.
 *
 * De ce: o citire completă înseamnă 4 liste + paginile de arhivă + XML/QR pe loturi — vreo zece
 * apeluri SOAP. SFS-ul REAL se supără la rafale: după o serie de cereri, aceleași credențiale care
 * funcționau primesc HTTP 500 la orice metodă timp de câteva minute (măsurat 2026-08-28). Deschiderea
 * repetată a tabului nu are voie să consume acest buget. TTL mic: datele oricum se schimbă lent.
 */
const INVOICE_CACHE_TTL_MS = 5 * 60_000;
/** Câte coduri fiscale cerem odată la registrul SFS pentru denumiri (un singur apel). */
const TAXPAYER_LOOKUP_MAX = 60;
const invoiceCache = new Map<string, { at: number; value: { invoices: SfsInvoiceSummary[]; errors: string[]; ok: boolean } }>();

/** Golește cache-ul (folosit de teste și de reîncărcarea explicită). */
export function clearBuyerInvoiceCache(tenantId?: string): void {
  if (tenantId) invoiceCache.delete(tenantId);
  else invoiceCache.clear();
}

/** Cât de departe în trecut cerem istoricul de facturi arhivate (SFS cere un interval explicit). */
const ARCHIVE_MONTHS = 24;
/** Plafon de pagini la istoric — SFS paginează, iar o buclă fără capăt ar putea rula la nesfârșit. */
const ARCHIVE_MAX_PAGES = 10;

/**
 * Toate facturile în care organizația e CUMPĂRĂTOR, din întreg ciclul de viață:
 *   • de semnat  — abia sosite de la furnizor;
 *   • acceptate  — semnate de noi;
 *   • respinse   — refuzate (doar pentru lista brută, nu contează ca dovadă);
 *   • ARHIVATE   — istoricul; pe un cont real, aici stă aproape tot.
 *
 * De ce arhivele sunt obligatorii: contul VECTOR ACADEMY avea 0 facturi în primele două liste și 45
 * în arhivă (verificat live 2026-08-28). Fără ele, ecranul „Toate e-Facturile" arăta gol pe un cont
 * plin, iar scanarea n-ar fi găsit niciodată factura unui prestator.
 *
 * Fiecare apel e izolat: dacă SFS refuză o metodă, restul continuă și diferența e raportată. Dacă
 * pică TOATE, `ok` devine false — atunci nu avem voie să spunem „nu există facturi".
 */
async function fetchBuyerInvoices(
  client: EfacturaMdClient,
  requestId: string,
  options: { includeRejected?: boolean; now?: Date } = {}
): Promise<{ invoices: SfsInvoiceSummary[]; errors: string[]; ok: boolean }> {
  const errors: string[] = [];
  const heads: InvoiceListItem[] = [];
  let anySucceeded = false;

  const now = options.now ?? new Date();
  const from = new Date(now.getTime());
  from.setMonth(from.getMonth() - ARCHIVE_MONTHS);

  const sources: Array<readonly [string, () => Promise<InvoiceListItem[]>]> = [
    ["facturi de semnat", () => client.getInvoicesForSigning(`${requestId}-sign`, EFACTURA_MD_ACTOR.CUMPARATOR)],
    ["facturi acceptate", () => client.getAcceptedInvoices(`${requestId}-acc`, EFACTURA_MD_ACTOR.CUMPARATOR)],
    [
      "facturi arhivate",
      async () => {
        const all: InvoiceListItem[] = [];
        for (let page = 1; page <= ARCHIVE_MAX_PAGES; page++) {
          const batch = await client.getArchivedInvoices(
            `${requestId}-arch-${page}`,
            EFACTURA_MD_ACTOR.CUMPARATOR,
            from,
            now,
            page
          );
          if (batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      },
    ],
  ];
  if (options.includeRejected) {
    sources.push([
      "facturi respinse",
      () => client.getRejectedInvoices(`${requestId}-rej`, EFACTURA_MD_ACTOR.CUMPARATOR),
    ]);
  }

  for (const [label, call] of sources) {
    try {
      heads.push(...(await call()));
      anySucceeded = true;
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deduplicare pe serie+număr (o factură poate apărea în mai multe liste).
  const uniqueHeads = new Map<string, InvoiceListItem>();
  for (const h of heads) {
    if (h.seria || h.number) uniqueHeads.set(invoiceKey(h), h);
  }

  // Detaliile (furnizor, cumpărător, dată, sumă) vin din XML-ul facturii — iar pentru facturile
  // arhivate, unde XML-ul vine gol, din textul QR (furnizor + cumpărător + sumă + link în portal).
  const allIdentifiers = [...uniqueHeads.values()].map((h) => ({ seria: h.seria, number: h.number }));
  const identifiers = allIdentifiers.slice(0, DETAIL_MAX);
  if (allIdentifiers.length > identifiers.length) {
    errors.push(
      `am citit detaliile doar pentru primele ${DETAIL_MAX} din ${allIdentifiers.length} facturi (limită de timp)`
    );
  }

  const xmlByKey = new Map<string, string>();
  for (let i = 0; i < identifiers.length; i += DETAIL_CHUNK) {
    const chunk = identifiers.slice(i, i + DETAIL_CHUNK);
    try {
      const detailed = await client.getInvoicesBySeriaNumber(chunk, `${requestId}-xml-${i}`);
      for (const d of detailed) if (d.xml && d.xml.trim()) xmlByKey.set(invoiceKey(d), d.xml);
    } catch (e) {
      errors.push(`detalii facturi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const missingDetails = identifiers.filter((id) => !xmlByKey.has(invoiceKey(id)));
  const qrByKey = new Map<string, string>();
  for (let i = 0; i < missingDetails.length; i += DETAIL_CHUNK) {
    const chunk = missingDetails.slice(i, i + DETAIL_CHUNK);
    try {
      const qrs = await client.getInvoiceQrTexts(chunk, `${requestId}-qr-${i}`);
      for (const q of qrs) if (q.text) qrByKey.set(invoiceKey(q), q.text);
    } catch (e) {
      errors.push(`date din codul QR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const invoices = [...uniqueHeads.values()].map((h) =>
    summarizeSfsInvoice({
      ...h,
      xml: xmlByKey.get(invoiceKey(h)) ?? null,
      qrText: qrByKey.get(invoiceKey(h)) ?? null,
    })
  );
  return { invoices, errors, ok: anySucceeded };
}

/**
 * `fetchBuyerInvoices` + cache per workspace. `force` ocolește cache-ul (butonul „Reîncarcă din SFS"
 * și scanarea explicită), dar un rezultat NEREUȘIT nu se pune niciodată în cache — altfel o eroare
 * temporară ar îngheța ecranul pe „nu am putut citi" timp de cinci minute.
 */
async function fetchBuyerInvoicesCached(
  tenantId: string,
  client: EfacturaMdClient,
  requestId: string,
  options: { includeRejected?: boolean; force?: boolean } = {}
): Promise<{ invoices: SfsInvoiceSummary[]; errors: string[]; ok: boolean }> {
  const cached = invoiceCache.get(tenantId);
  if (!options.force && cached && Date.now() - cached.at < INVOICE_CACHE_TTL_MS) return cached.value;

  const value = await fetchBuyerInvoices(client, requestId, { includeRejected: options.includeRejected });
  if (value.ok) invoiceCache.set(tenantId, { at: Date.now(), value });
  return value;
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
  const { invoices, errors, ok } = await fetchBuyerInvoicesCached(tenantId, client, requestId, {
    includeRejected: true,
    force: true,
  });

  // SFS a refuzat TOATE listele (credențiale expirate, serviciu picat, drepturi retrase). A scrie
  // acum „am verificat, nu există factură" ar fi o minciună care produce remindere nedrepte.
  if (!ok) {
    return {
      available: false,
      source: "sfs",
      checked: 0,
      found: 0,
      missing: 0,
      invoicesFetched: 0,
      message: `Nu am putut interoga SFS: ${errors.join("; ") || "serviciul nu a răspuns"}.`,
    };
  }

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

// ─── 3. Lista brută a facturilor primite (ecranul „Toate e-Facturile") ────────

/** O factură din SFS, așa cum e arătată în lista brută (independent de cereri). */
export interface BuyerInvoiceItem {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  supplierIdno: string | null;
  /** Denumirea furnizorului: din XML dacă o are, altfel din registrul propriu de prestatori. */
  supplierName: string | null;
  buyerIdno: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  /** Linkul către factura din portalul SFS (din codul QR), ca omul să o poată deschide. */
  portalUrl: string | null;
  /** Cererea PAR de care e legată factura, dacă a fost potrivită sau marcată manual. */
  linkedParId: string | null;
  linkedRequestNo: string | null;
}

export interface BuyerInvoiceListResult {
  available: boolean;
  source: "sfs" | "mock";
  message: string;
  invoices: BuyerInvoiceItem[];
}

/**
 * Toate facturile în care organizația e cumpărător — nu doar cele legate de o plată PAR.
 *
 * De ce există separat de scanare: scanarea răspunde la „cererea asta are factură?", ecranul acesta
 * la „ce facturi am primit, de la cine, în ce stare?" — inclusiv cele pe care nu le așteptam
 * (abonamente, livrări fără PAR) și cele respinse. Nu scrie nimic: e o citire.
 */
export async function listBuyerInvoicesForTenant(
  tenantId: string,
  clientOverride?: EfacturaMdClient,
  force = false
): Promise<BuyerInvoiceListResult> {
  const sfs = clientOverride ? null : await loadSfsConfig(tenantId);
  if (!clientOverride && (!sfs || sfs.config.mock)) {
    return {
      available: false,
      source: "mock",
      message: sfs
        ? "Integrarea e-Factura rulează în mod simulat (fără credențiale SFS) — nu putem citi facturile reale."
        : "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
      invoices: [],
    };
  }

  const client = clientOverride ?? new EfacturaMdClient(sfs!.config);
  const { invoices, errors, ok } = await fetchBuyerInvoicesCached(
    tenantId,
    client,
    `par-efp-list-${Date.now()}`,
    { includeRejected: true, force }
  );

  // Toate listele au picat → lista goală NU e un răspuns; e o necunoscută (vezi
  // docs/solutions/architecture-patterns/unavailable-is-not-absent.md).
  if (!ok) {
    return {
      available: false,
      source: "sfs",
      message: `Nu am putut citi facturile din SFS: ${errors.join("; ") || "serviciul nu a răspuns"}.`,
      invoices: [],
    };
  }

  // Legătura cu cererile: rândurile de urmărire care poartă deja seria+numărul facturii.
  const tracked = await db
    .select({
      parId: parEinvoices.parId,
      seria: parEinvoices.sfsSeria,
      number: parEinvoices.sfsNumber,
      requestNo: parRequests.requestNo,
    })
    .from(parEinvoices)
    .innerJoin(parRequests, eq(parRequests.id, parEinvoices.parId))
    .where(eq(parEinvoices.tenantId, tenantId));
  const linkByKey = new Map(
    tracked
      .filter((t) => t.seria && t.number)
      .map((t) => [invoiceKey({ seria: t.seria!, number: t.number! }), t])
  );

  // Denumirea furnizorului, când XML-ul nu o dă: întâi din registrul propriu de prestatori…
  const vendors = await db
    .select({ name: parVendors.name, idnp: parVendors.idnp })
    .from(parVendors)
    .where(eq(parVendors.tenantId, tenantId));
  const nameByIdno = new Map(
    vendors.filter((v) => v.idnp).map((v) => [normalizeFiscalId(v.idnp), v.name])
  );

  // …iar pentru restul, din registrul fiscal, într-un SINGUR apel. Fără el, tabelul ar arăta doar
  // coduri fiscale — corect, dar de necitit pentru omul de la finanțe.
  const unknownIdnos = [
    ...new Set(
      invoices
        .map((inv) => normalizeFiscalId(inv.supplierIdno))
        .filter((idno) => idno && !nameByIdno.has(idno))
    ),
  ].slice(0, TAXPAYER_LOOKUP_MAX);
  if (unknownIdnos.length > 0) {
    try {
      const taxpayers = await client.getTaxpayersInfo(unknownIdnos, `par-efp-names-${Date.now()}`);
      for (const t of taxpayers) {
        if (t.idno && t.name) nameByIdno.set(normalizeFiscalId(t.idno), t.name);
      }
    } catch {
      // Denumirile sunt un lux: fără ele rămân codurile fiscale, lista tot funcționează.
    }
  }

  const items: BuyerInvoiceItem[] = invoices
    .map((inv) => {
      const link = linkByKey.get(invoiceKey(inv));
      return {
        seria: inv.seria,
        number: inv.number,
        invoiceStatus: inv.invoiceStatus,
        invoiceStatusLabel: inv.invoiceStatusLabel,
        supplierIdno: inv.supplierIdno,
        supplierName: inv.supplierName ?? nameByIdno.get(normalizeFiscalId(inv.supplierIdno)) ?? null,
        buyerIdno: inv.buyerIdno,
        invoiceDate: inv.invoiceDate?.toISOString() ?? null,
        totalCents: inv.totalCents,
        portalUrl: inv.portalUrl ?? null,
        linkedParId: link?.parId ?? null,
        linkedRequestNo: link?.requestNo ?? null,
      };
    })
    // Cele mai noi primele; facturile fără dată în XML cad la coadă.
    .sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? ""));

  const base = `${items.length} facturi primite găsite în SFS.`;
  return {
    available: true,
    source: "sfs",
    message: errors.length ? `${base} SFS a răspuns parțial: ${errors.join("; ")}` : base,
    invoices: items,
  };
}

// ─── 4. O singură factură: toate câmpurile + documentul PDF ──────────────────

export interface BuyerInvoiceDetailResult {
  available: boolean;
  message: string;
  seria: string;
  number: string;
  invoiceStatus: number | null;
  invoiceStatusLabel: string | null;
  detail: SfsInvoiceDetail | null;
}

/** Clientul SFS al workspace-ului, sau null când integrarea nu e configurată. */
async function clientFor(
  tenantId: string,
  clientOverride?: EfacturaMdClient
): Promise<{ client: EfacturaMdClient | null; message: string }> {
  if (clientOverride) return { client: clientOverride, message: "" };
  const sfs = await loadSfsConfig(tenantId);
  if (!sfs || sfs.config.mock) {
    return {
      client: null,
      message: sfs
        ? "Integrarea e-Factura rulează în mod simulat (fără credențiale SFS)."
        : "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
    };
  }
  return { client: new EfacturaMdClient(sfs.config), message: "" };
}

/**
 * Conținutul unei facturi primite: furnizor, cumpărător, date, puncte de încărcare/descărcare,
 * totaluri și liniile de marfă/serviciu — adică tot ce scrie în document.
 */
export async function getBuyerInvoiceDetail(
  tenantId: string,
  seria: string,
  number: string,
  clientOverride?: EfacturaMdClient
): Promise<BuyerInvoiceDetailResult> {
  const base = { seria, number, invoiceStatus: null, invoiceStatusLabel: null, detail: null };
  const { client, message } = await clientFor(tenantId, clientOverride);
  if (!client) return { ...base, available: false, message };

  try {
    const [item] = await client.getInvoicesBySeriaNumber([{ seria, number }], `par-efp-one-${Date.now()}`);
    if (!item) {
      return { ...base, available: true, message: "Factura nu a fost găsită în SFS." };
    }
    const detail = parseSfsInvoiceDetail(item.xml);
    return {
      available: true,
      message: detail ? "" : "SFS nu a returnat conținutul facturii.",
      seria: item.seria || seria,
      number: item.number || number,
      invoiceStatus: item.invoiceStatus,
      invoiceStatusLabel: item.invoiceStatusLabel,
      detail,
    };
  } catch (e) {
    return {
      ...base,
      available: false,
      message: `Nu am putut citi factura din SFS: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Documentul PDF oficial al facturii, așa cum îl tipărește SFS. Întoarce null când integrarea nu e
 * configurată sau SFS nu dă conținutul — apelantul decide ce mesaj arată.
 */
export async function getBuyerInvoicePdf(
  tenantId: string,
  seria: string,
  number: string,
  clientOverride?: EfacturaMdClient
): Promise<{ pdf: Buffer } | { error: string }> {
  const { client, message } = await clientFor(tenantId, clientOverride);
  if (!client) return { error: message };
  try {
    const res = await client.getInvoicePdf(seria, number, `par-efp-pdf-${Date.now()}`, 0, EFACTURA_MD_ACTOR.CUMPARATOR);
    if (!res) return { error: "SFS nu a returnat documentul pentru această factură." };
    return { pdf: res.pdf };
  } catch (e) {
    return { error: `Nu am putut descărca factura din SFS: ${e instanceof Error ? e.message : String(e)}` };
  }
}
