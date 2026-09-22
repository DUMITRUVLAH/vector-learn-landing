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
import { EfacturaMdClient, EFACTURA_MD_ACTOR } from "../../lib/efacturaMoldova";
import {
  expectsEfactura,
  matchInvoiceForPar,
  parseSfsInvoiceDetail,
  invoiceKey,
  normalizeFiscalId,
  type SfsInvoiceDetail,
} from "../../lib/par/efacturaMatch";
import {
  syncBuyerInvoices,
  cachedInvoiceSummaries,
  listCachedInvoices,
  listSupplierFacets,
  cachedDateRange,
  getSyncProgress,
  type InvoiceFilters,
  type SupplierFacet,
  type SyncProgress,
} from "./efacturaCache";

// Erorile SFS se formatează într-un singur loc; re-exportat pentru apelanții vechi.
export { formatSfsErrors } from "./efacturaCache";

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

/**
 * Citirea din SFS nu se mai face la fiecare cerere: trăiește în `efacturaCache`, care ține o copie
 * locală a facturilor (`par_sfs_invoices`) și o completează în loturi mici. Aici rămâne doar
 * potrivirea cu plățile PAR — treaba propriu-zisă a modulului.
 *
 * De ce contează pentru scanare: înainte, fiecare scanare re-citea tot istoricul din SFS și se
 * oprea la primele 200 de facturi (plafonul de timp), deci o factură mai veche de atât nu putea fi
 * găsită NICIODATĂ. Acum scanarea se uită în copia locală completă.
 */

/** Cât timp are voie să consume un lot de sincronizare pornit din butonul „Scanează SFS". */
const SCAN_SYNC_BUDGET_MS = 6_000;
/** Câte ferestre de arhivă sapă o scanare (restul istoricului vine din bucla ecranului). */
const SCAN_ARCHIVE_WINDOWS = 4;


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

  // Un lot scurt de sincronizare: aduce facturile noi și continuă recuperarea istoricului acolo
  // unde a rămas. Restul potrivirii se face pe copia locală — completă, nu tăiată la 200.
  const sync = await syncBuyerInvoices(tenantId, {
    client,
    budgetMs: SCAN_SYNC_BUDGET_MS,
    force: true,
    ignoreLock: true,
    // Scanarea aduce noutățile și mai sapă puțin în istoric; recuperarea completă a arhivei e
    // treaba buclei din ecranul de facturi, nu a unui click pe „Scanează".
    maxArchiveWindows: SCAN_ARCHIVE_WINDOWS,
  });
  const invoices = await cachedInvoiceSummaries(tenantId);

  // SFS a refuzat TOATE apelurile (credențiale expirate, serviciu picat, drepturi retrase) ȘI nu
  // avem nici copie locală. A scrie acum „am verificat, nu există factură" ar fi o minciună care
  // produce remindere nedrepte.
  if (!sync.available && invoices.length === 0) {
    return {
      available: false,
      source: "sfs",
      checked: 0,
      found: 0,
      missing: 0,
      invoicesFetched: 0,
      message: `Nu am putut interoga SFS: ${sync.progress.lastError || "serviciul nu a răspuns"}.`,
    };
  }
  const partialNote = sync.progress.lastError;
  // Cât timp istoricul nu e recuperat complet, potrivirea se face pe o parte din facturi. Omul
  // trebuie să știe asta ÎNAINTE de a trimite un reminder unui prestator care și-a făcut treaba.
  const historyNote = sync.progress.archiveDone
    ? null
    : `Istoricul din SFS încă se recuperează (${sync.progress.total} facturi citite până acum) — deschide tabul „Toate e-Facturile" ca să continue.`;

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
      message: [
        "Nicio cerere în așteptare.",
        partialNote ? `SFS a răspuns parțial: ${partialNote}` : null,
        historyNote,
      ]
        .filter(Boolean)
        .join(" "),
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
  const base = `Am comparat cu ${invoices.length} facturi din arhiva locală; ${found} potrivire/potriviri, ${missing} cereri rămân fără factură.`;
  return {
    available: true,
    source: "sfs",
    checked: ordered.length,
    found,
    missing,
    invoicesFetched: invoices.length,
    message: [base, partialNote ? `SFS a răspuns parțial: ${partialNote}` : null, historyNote]
      .filter(Boolean)
      .join(" "),
  };
}

// ─── 3. Lista facturilor primite (ecranul „Toate e-Facturile") ───────────────

/** O factură din copia locală, așa cum e arătată în listă (independent de cereri). */
export interface BuyerInvoiceItem {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  supplierIdno: string | null;
  /** Denumirea furnizorului: din XML/QR dacă o au, altfel din registrul propriu sau cel fiscal. */
  supplierName: string | null;
  buyerIdno: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  /** Linkul către factura din portalul SFS (din codul QR), ca dovadă a provenienței. */
  portalUrl: string | null;
  /** false = știm doar că factura există; conținutul nu a fost încă citit din SFS. */
  detailsRead: boolean;
  /** Cererea PAR de care e legată factura, dacă a fost potrivită sau marcată manual. */
  linkedParId: string | null;
  linkedRequestNo: string | null;
}

export interface BuyerInvoiceListResult {
  /** false = nu putem spune ce facturi există (SFS neconfigurat, sau nimic citit încă). */
  available: boolean;
  source: "sfs" | "mock";
  /** true = copia locală e goală/neîncepută: ecranul trebuie să pornească sincronizarea. */
  needsSync: boolean;
  message: string;
  invoices: BuyerInvoiceItem[];
  /** Câte facturi corespund filtrului (lista e paginată). */
  total: number;
  totalCents: number;
  page: number;
  pageSize: number;
  /** Furnizorii din copia locală — alimentează filtrul „Furnizor". */
  suppliers: SupplierFacet[];
  /** Perioada acoperită de copia locală. */
  range: { oldest: string | null; newest: string | null };
  /** Unde a ajuns citirea din SFS (bara de progres + butonul „Continuă"). */
  sync: SyncProgress;
}

/**
 * Toate facturile în care organizația e cumpărător — nu doar cele legate de o plată PAR.
 *
 * Citește DOAR din copia locală (`par_sfs_invoices`): nicio cerere către SFS, deci ecranul se
 * deschide instant și se poate filtra/sorta oricât. Aducerea facturilor noi e o operație separată
 * și explicită (`syncBuyerInvoices`), fiindcă e scumpă și trebuie făcută în loturi.
 *
 * Onestitate: dacă nu s-a citit încă nimic, răspunsul NU e „nu există facturi", ci „încă nu le-am
 * citit" (`needsSync`) — iar dacă ultima sincronizare a eșuat, se vede eroarea ei.
 */
export async function listBuyerInvoicesForTenant(
  tenantId: string,
  filters: InvoiceFilters = {}
): Promise<BuyerInvoiceListResult> {
  const sfs = await loadSfsConfig(tenantId);
  const [page, suppliers, range, sync] = await Promise.all([
    listCachedInvoices(tenantId, filters),
    listSupplierFacets(tenantId),
    cachedDateRange(tenantId),
    getSyncProgress(tenantId),
  ]);

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

  const invoices: BuyerInvoiceItem[] = page.items.map((inv) => {
    const link = linkByKey.get(invoiceKey(inv));
    return {
      ...inv,
      linkedParId: link?.parId ?? null,
      linkedRequestNo: link?.requestNo ?? null,
    };
  });

  const configured = !!sfs && !sfs.config.mock;
  const nothingRead = sync.total === 0;

  // Copia locală goală: spunem DE CE e goală, nu că nu există facturi.
  if (nothingRead) {
    return {
      available: false,
      source: configured ? "sfs" : "mock",
      needsSync: configured,
      // Ordinea contează: dacă CHIAR s-a încercat o citire și a eșuat, aceea e cauza concretă și
      // se spune prima. „Nu e configurat" rămâne explicația când nu s-a încercat nimic.
      message: [
        sync.lastError
          ? `Nu am putut citi facturile din SFS: ${sync.lastError}`
          : configured
            ? "Facturile nu au fost încă citite din SFS — pornesc sincronizarea în loturi."
            : null,
        configured
          ? null
          : sfs
            ? "Integrarea e-Factura rulează în mod simulat (fără credențiale SFS) — nu putem citi facturile reale."
            : "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
      ]
        .filter(Boolean)
        .join(" "),
      invoices,
      total: page.total,
      totalCents: page.totalCents,
      page: page.page,
      pageSize: page.pageSize,
      suppliers,
      range,
      sync,
    };
  }

  const scope = page.total === sync.total ? `${sync.total} facturi` : `${page.total} din ${sync.total} facturi`;
  const base = `${scope} în arhiva locală${sync.pending > 0 ? `, ${sync.pending} încă fără detalii citite` : ""}.`;
  return {
    available: true,
    source: configured ? "sfs" : "mock",
    // Mai sunt facturi de adus? Ecranul continuă loturile în fundal, fără să blocheze citirea.
    needsSync: configured && !sync.done,
    message: sync.lastError ? `${base} Ultima citire a fost parțială: ${sync.lastError}` : base,
    invoices,
    total: page.total,
    totalCents: page.totalCents,
    page: page.page,
    pageSize: page.pageSize,
    suppliers,
    range,
    sync,
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
