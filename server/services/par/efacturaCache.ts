/**
 * PAR-EFP: copia locală a facturilor din SIA „e-Factura" (SFS) — citire incrementală, în loturi.
 *
 * ── Problema ─────────────────────────────────────────────────────────────────────────────────
 * Varianta de dinainte citea TOT istoricul la fiecare deschidere a ecranului: patru liste SFS +
 * paginile de arhivă + XML/QR pe loturi de 20, într-o singură cerere HTTP. Pe contul real (543 de
 * facturi) asta însemna ~40 de apeluri SOAP care nu încăpeau în plafonul de timp al serverului, de
 * unde mesajul „am citit detaliile doar pentru primele 200 din 543". Restul rămâneau necitite
 * pentru totdeauna, fiindcă runda următoare o lua de la capăt cu aceleași prime 200. O organizație
 * cu zece mii de facturi în istoric nu putea fi citită deloc.
 *
 * ── Soluția ──────────────────────────────────────────────────────────────────────────────────
 * Fiecare factură se citește O SINGURĂ DATĂ din SFS și se păstrează în `par_sfs_invoices`:
 *   • un apel de sincronizare = UN LOT mic, cu buget de timp (implicit ~8 s) — nu se blochează;
 *   • arhiva se recuperează mergând înapoi în timp, fereastră cu fereastră, cu cursor persistat
 *     (`archive_cursor_to`), deci lotul următor continuă de unde a rămas, nu de la zero;
 *   • după recuperarea istoricului se cere doar fereastra recentă — costul devine constant,
 *     indiferent de câte mii de facturi are organizația;
 *   • detaliile (furnizor, dată, sumă) se cer doar pentru rândurile care încă nu le au.
 * Ecranul citește din baza locală: instant, sortabil, filtrabil pe perioadă și pe furnizor.
 *
 * ── Ce NU face ───────────────────────────────────────────────────────────────────────────────
 * Nu inventează date: un rând fără detalii citite rămâne cu dată/sumă goale și se vede ca atare.
 * Nu declară „nu există facturi" când SFS n-a răspuns — necunoscutul rămâne necunoscut
 * (docs/solutions/architecture-patterns/unavailable-is-not-absent.md).
 *
 * REUSE: `EfacturaMdClient` (server/lib/efacturaMoldova.ts) + parsarea pură din
 * server/lib/par/efacturaMatch.ts. Nu se creează un al doilea client SOAP.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { parSfsInvoices, parSfsSyncState } from "../../db/schema/parSfsInvoices";
import { parVendors } from "../../db/schema/par";
import {
  EfacturaMdClient,
  EFACTURA_MD_ACTOR,
  EFACTURA_MD_STATUS,
  type InvoiceListItem,
} from "../../lib/efacturaMoldova";
import {
  invoiceKey,
  normalizeFiscalId,
  summarizeSfsInvoice,
  type SfsInvoiceSummary,
} from "../../lib/par/efacturaMatch";

// ─── Reglaje ──────────────────────────────────────────────────────────────────

/** Cât timp are voie să dureze un lot de sincronizare. Sub plafonul de timp al funcției server. */
export const SYNC_BUDGET_MS = 8_000;
/** Câte serii+numere intră într-un apel GetInvoicesBySeriaNumber (limita cererii SFS). */
const DETAIL_CHUNK = 20;
/** După atâtea încercări fără conținut, factura iese din coadă cu ce se știe din antet. */
const DETAIL_MAX_ATTEMPTS = 3;
/** Lățimea unei ferestre de arhivă. Prea mare → SFS paginează la nesfârșit; prea mică → multe apeluri. */
const ARCHIVE_WINDOW_DAYS = 90;
/** Plafon de pagini per fereastră — o buclă fără capăt ar putea rula la nesfârșit. */
const ARCHIVE_MAX_PAGES = 20;
/** Cât de departe în trecut merge recuperarea istoricului. */
const ARCHIVE_HISTORY_YEARS = 5;
/** După recuperarea istoricului, fiecare sincronizare re-citește doar ultimele atâtea zile. */
const RECENT_WINDOW_DAYS = 45;
/** Listele „vii" nu se re-citesc mai des de atât (fără `force`). */
const HEADS_MIN_INTERVAL_MS = 60_000;
/** Cât ține zăvorul de sincronizare înainte să fie considerat abandonat. */
const LOCK_TTL_MS = 2 * 60_000;
/**
 * Pauză între apelurile SOAP. SFS-ul real răspunde cu HTTP 500 la rafale (măsurat 2026-08-28):
 * mai bine încet și sigur decât repede și blocat câteva minute.
 */
const SOAP_PAUSE_MS = 150;
/** Câte coduri fiscale întrebăm odată registrul SFS pentru denumiri. */
const TAXPAYER_LOOKUP_MAX = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export interface SyncProgress {
  /** Câte facturi știm că există (antete citite din SFS). */
  total: number;
  /** Pentru câte am citit conținutul (furnizor, dată, sumă). */
  detailed: number;
  /** Câte mai așteaptă citirea detaliilor. */
  pending: number;
  /** Istoricul a fost parcurs până la capăt? */
  archiveDone: boolean;
  /** Câți ani în urmă merge recuperarea — ca interfața să nu promită „tot istoricul". */
  historyYears: number;
  /** Până unde a ajuns recuperarea istoricului (capătul ferestrei următoare). */
  archiveCursorTo: string | null;
  headsSyncedAt: string | null;
  lastBatchAt: string | null;
  lastMessage: string | null;
  lastError: string | null;
  /** true = nu mai e nimic de adus; ecranul poate opri bucla de loturi. */
  done: boolean;
}

export interface SyncOutcome {
  /** false = SFS neconfigurat sau nu a răspuns deloc: nu s-a citit nimic nou. */
  available: boolean;
  /** true = un alt lot rulează chiar acum (alt tab); nu s-a atins SFS. */
  busy: boolean;
  /** Câte facturi noi au apărut și pentru câte s-au citit detaliile în acest lot. */
  discovered: number;
  detailsRead: number;
  message: string;
  progress: SyncProgress;
}

// ─── Starea sincronizării ─────────────────────────────────────────────────────

async function loadState(tenantId: string) {
  const read = async () =>
    (
      await db
        .select()
        .from(parSfsSyncState)
        .where(eq(parSfsSyncState.tenantId, tenantId))
        .limit(1)
    )[0];

  const row = await read();
  if (row) return row;
  // Două cereri deodată (ecranul + o scanare) ar insera amândouă rândul de stare; `doNothing` face
  // din asta un no-op în loc de un 500 pe cheia unică.
  await db.insert(parSfsSyncState).values({ tenantId }).onConflictDoNothing();
  return (await read())!;
}

async function patchState(
  tenantId: string,
  patch: Partial<typeof parSfsSyncState.$inferInsert>
): Promise<void> {
  await db
    .update(parSfsSyncState)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(parSfsSyncState.tenantId, tenantId));
}

/** Numărătoarea care alimentează bara de progres: total / cu detalii / rămase. */
async function countInvoices(tenantId: string): Promise<{ total: number; detailed: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      detailed: sql<number>`count(${parSfsInvoices.detailsFetchedAt})::int`,
    })
    .from(parSfsInvoices)
    .where(eq(parSfsInvoices.tenantId, tenantId));
  return { total: Number(row?.total ?? 0), detailed: Number(row?.detailed ?? 0) };
}

export async function getSyncProgress(tenantId: string): Promise<SyncProgress> {
  const state = await loadState(tenantId);
  const { total, detailed } = await countInvoices(tenantId);
  const pending = total - detailed;
  const archiveDone = !!state.archiveDoneAt;
  return {
    total,
    detailed,
    pending,
    archiveDone,
    historyYears: ARCHIVE_HISTORY_YEARS,
    archiveCursorTo: state.archiveCursorTo?.toISOString() ?? null,
    headsSyncedAt: state.headsSyncedAt?.toISOString() ?? null,
    lastBatchAt: state.lastBatchAt?.toISOString() ?? null,
    lastMessage: state.lastMessage,
    lastError: state.lastError,
    done: archiveDone && pending === 0,
  };
}

// ─── Scrierea în copia locală ─────────────────────────────────────────────────

/**
 * Antetele din listele SFS (serie, număr, status) — atât cât se știe înainte de a citi conținutul.
 * Un antet deja cunoscut își actualizează doar statusul și `last_seen_at`; NU șterge detaliile deja
 * citite, altfel fiecare sincronizare ar arunca munca celei dinainte.
 */
async function upsertHeads(tenantId: string, heads: InvoiceListItem[]): Promise<number> {
  const unique = new Map<string, InvoiceListItem>();
  for (const h of heads) {
    if (h.seria || h.number) unique.set(invoiceKey(h), h);
  }
  if (unique.size === 0) return 0;

  const keys = [...unique.values()];
  const now = new Date();
  let discovered = 0;
  // Loturi mici la scriere ȘI la verificare: un singur INSERT (sau un IN) cu zece mii de valori ar
  // depăși limita de parametri a driverului — exact scara pentru care s-a făcut tabela.
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const existing = await db
      .select({ seria: parSfsInvoices.seria, number: parSfsInvoices.number })
      .from(parSfsInvoices)
      .where(
        and(
          eq(parSfsInvoices.tenantId, tenantId),
          inArray(
            parSfsInvoices.number,
            chunk.map((k) => k.number)
          )
        )
      );
    const known = new Set(existing.map((e) => invoiceKey(e)));
    await db
      .insert(parSfsInvoices)
      .values(
        chunk.map((h) => ({
          tenantId,
          seria: h.seria,
          number: h.number,
          invoiceStatus: h.invoiceStatus,
          firstSeenAt: now,
          lastSeenAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [parSfsInvoices.tenantId, parSfsInvoices.seria, parSfsInvoices.number],
        set: {
          invoiceStatus: sql`excluded.invoice_status`,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
    discovered += chunk.filter((h) => !known.has(invoiceKey(h))).length;
  }
  return discovered;
}

// ─── Citirea din SFS ──────────────────────────────────────────────────────────

/** Rezultatul unui grup de apeluri SFS: ce s-a citit, ce a eșuat, a mers măcar unul? */
interface FetchOutcome {
  heads: InvoiceListItem[];
  errors: string[];
  ok: boolean;
}

/**
 * Listele „vii": facturile de semnat (abia sosite), cele acceptate și cele respinse. Sunt mici și
 * se schimbă des — de aceea se citesc la fiecare sincronizare, spre deosebire de arhivă.
 */
async function fetchLiveLists(
  client: EfacturaMdClient,
  requestId: string,
  pauseMs: number
): Promise<FetchOutcome> {
  const sources: Array<readonly [string, () => Promise<InvoiceListItem[]>]> = [
    ["facturi de semnat", () => client.getInvoicesForSigning(`${requestId}-sign`, EFACTURA_MD_ACTOR.CUMPARATOR)],
    ["facturi acceptate", () => client.getAcceptedInvoices(`${requestId}-acc`, EFACTURA_MD_ACTOR.CUMPARATOR)],
    ["facturi respinse", () => client.getRejectedInvoices(`${requestId}-rej`, EFACTURA_MD_ACTOR.CUMPARATOR)],
  ];
  const heads: InvoiceListItem[] = [];
  const errors: string[] = [];
  let ok = false;
  for (const [label, call] of sources) {
    try {
      heads.push(...(await call()));
      ok = true;
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(pauseMs);
  }
  return { heads, errors, ok };
}

/** O fereastră de arhivă, paginată. Se oprește la buget, la pagină goală sau la plafon. */
async function fetchArchiveWindow(
  client: EfacturaMdClient,
  requestId: string,
  from: Date,
  to: Date,
  deadline: number,
  pauseMs: number
): Promise<FetchOutcome> {
  const heads: InvoiceListItem[] = [];
  const errors: string[] = [];
  let ok = false;
  for (let page = 1; page <= ARCHIVE_MAX_PAGES; page++) {
    if (Date.now() > deadline) break;
    try {
      const batch = await client.getArchivedInvoices(
        `${requestId}-arch-${page}`,
        EFACTURA_MD_ACTOR.CUMPARATOR,
        from,
        to,
        page
      );
      ok = true;
      if (batch.length === 0) break;
      heads.push(...batch);
    } catch (e) {
      errors.push(`facturi arhivate: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    await sleep(pauseMs);
  }
  return { heads, errors, ok };
}

/**
 * Detaliile unui lot de facturi: întâi XML-ul (sursa completă), apoi — pentru cele arhivate, unde
 * SFS întoarce XML gol — textul codului QR, singurul loc unde mai scriu furnizorul și suma.
 */
async function fetchDetailsFor(
  client: EfacturaMdClient,
  chunk: Array<{ seria: string; number: string }>,
  requestId: string,
  pauseMs: number
): Promise<{ summaries: Map<string, SfsInvoiceSummary>; errors: string[] }> {
  const errors: string[] = [];
  const xmlByKey = new Map<string, string>();
  const statusByKey = new Map<string, number>();

  try {
    const detailed = await client.getInvoicesBySeriaNumber(chunk, `${requestId}-xml`);
    for (const d of detailed) {
      if (d.xml && d.xml.trim()) xmlByKey.set(invoiceKey(d), d.xml);
      statusByKey.set(invoiceKey(d), d.invoiceStatus);
    }
  } catch (e) {
    errors.push(`detalii facturi: ${e instanceof Error ? e.message : String(e)}`);
  }
  await sleep(pauseMs);

  const missing = chunk.filter((c) => !xmlByKey.has(invoiceKey(c)));
  const qrByKey = new Map<string, string>();
  if (missing.length > 0) {
    try {
      const qrs = await client.getInvoiceQrTexts(missing, `${requestId}-qr`);
      for (const q of qrs) if (q.text) qrByKey.set(invoiceKey(q), q.text);
    } catch (e) {
      errors.push(`date din codul QR: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(pauseMs);
  }

  const summaries = new Map<string, SfsInvoiceSummary>();
  for (const c of chunk) {
    const key = invoiceKey(c);
    const xml = xmlByKey.get(key) ?? null;
    const qrText = qrByKey.get(key) ?? null;
    if (!xml && !qrText) continue;
    const status = statusByKey.get(key) ?? 0;
    summaries.set(
      key,
      summarizeSfsInvoice({
        seria: c.seria,
        number: c.number,
        invoiceStatus: status,
        invoiceStatusLabel: EFACTURA_MD_STATUS[status] ?? "",
        xml,
        qrText,
      })
    );
  }
  return { summaries, errors };
}

/** Scrie detaliile citite; rândurile fără conținut își cresc contorul de încercări. */
async function applyDetails(
  tenantId: string,
  chunk: Array<{ id: string; seria: string; number: string; detailAttempts: number }>,
  summaries: Map<string, SfsInvoiceSummary>
): Promise<number> {
  const now = new Date();
  let read = 0;
  for (const row of chunk) {
    const summary = summaries.get(invoiceKey(row));
    if (summary) {
      read++;
      await db
        .update(parSfsInvoices)
        .set({
          supplierIdno: summary.supplierIdno,
          supplierName: summary.supplierName ?? null,
          buyerIdno: summary.buyerIdno,
          invoiceDate: summary.invoiceDate,
          totalCents: summary.totalCents,
          portalUrl: summary.portalUrl ?? null,
          detailsFetchedAt: now,
          updatedAt: now,
        })
        .where(eq(parSfsInvoices.id, row.id));
      continue;
    }
    // Fără conținut: mai încercăm de câteva ori, apoi lăsăm factura cu ce se știe din antet —
    // altfel aceleași documente „mute" ar bloca la nesfârșit coada celorlalte.
    const attempts = row.detailAttempts + 1;
    await db
      .update(parSfsInvoices)
      .set({
        detailAttempts: attempts,
        detailsFetchedAt: attempts >= DETAIL_MAX_ATTEMPTS ? now : null,
        updatedAt: now,
      })
      .where(eq(parSfsInvoices.id, row.id));
  }
  return read;
}

/**
 * Denumirile furnizorilor: întâi din registrul propriu de prestatori, apoi din registrul fiscal
 * SFS, într-un singur apel. Un tabel cu 500 de coduri fiscale fără nume nu e de citit pentru om.
 */
async function fillSupplierNames(
  tenantId: string,
  client: EfacturaMdClient,
  requestId: string,
  pauseMs: number
): Promise<void> {
  const nameless = await db
    .select({ idno: parSfsInvoices.supplierIdno })
    .from(parSfsInvoices)
    .where(
      and(
        eq(parSfsInvoices.tenantId, tenantId),
        isNull(parSfsInvoices.supplierName),
        sql`${parSfsInvoices.supplierIdno} is not null and ${parSfsInvoices.supplierIdno} <> ''`
      )
    )
    .limit(500);
  const idnos = [...new Set(nameless.map((r) => normalizeFiscalId(r.idno)).filter(Boolean))];
  if (idnos.length === 0) return;

  const nameByIdno = new Map<string, string>();
  const vendors = await db
    .select({ name: parVendors.name, idnp: parVendors.idnp })
    .from(parVendors)
    .where(eq(parVendors.tenantId, tenantId));
  for (const v of vendors) {
    if (v.idnp && v.name) nameByIdno.set(normalizeFiscalId(v.idnp), v.name);
  }

  const unknown = idnos.filter((i) => !nameByIdno.has(i)).slice(0, TAXPAYER_LOOKUP_MAX);
  if (unknown.length > 0) {
    try {
      const taxpayers = await client.getTaxpayersInfo(unknown, `${requestId}-names`);
      for (const t of taxpayers) {
        if (t.idno && t.name) nameByIdno.set(normalizeFiscalId(t.idno), t.name);
      }
    } catch {
      // Denumirile sunt un lux: fără ele rămân codurile fiscale, tabelul tot funcționează.
    }
    await sleep(pauseMs);
  }

  const now = new Date();
  for (const idno of idnos) {
    const name = nameByIdno.get(idno);
    if (!name) continue;
    await db
      .update(parSfsInvoices)
      .set({ supplierName: name, updatedAt: now })
      .where(
        and(
          eq(parSfsInvoices.tenantId, tenantId),
          isNull(parSfsInvoices.supplierName),
          // Codurile din SFS pot veni cu spații; comparăm normalizat, la fel ca la potrivire.
          sql`regexp_replace(upper(${parSfsInvoices.supplierIdno}), '[^0-9A-Z]', '', 'g') = ${idno}`
        )
      );
  }
}

// ─── Un lot de sincronizare ───────────────────────────────────────────────────

export interface SyncOptions {
  client?: EfacturaMdClient;
  /** Bugetul de timp al lotului. */
  budgetMs?: number;
  /** Re-citește listele „vii" chiar dacă au fost citite adineauri (butonul „Reîncarcă"). */
  force?: boolean;
  /** Ignoră zăvorul (folosit de teste și de rulări secvențiale din același proces). */
  ignoreLock?: boolean;
  /** Pauza dintre apelurile SOAP. Implicit blândă cu SFS; testele o pun pe 0. */
  pauseMs?: number;
  /**
   * Câte ferestre de arhivă recuperăm într-un singur lot. Ecranul de facturi rulează bucla până
   * la capăt (fără plafon), dar scanarea unei plăți nu are voie să plimbe ani de istoric într-o
   * apăsare de buton — își ia câteva ferestre și lasă restul pe seama buclei.
   */
  maxArchiveWindows?: number;
  /** Ceasul, injectabil pentru teste. */
  now?: Date;
}

/**
 * Un singur lot: citește ce lipsește, în limita bugetului, și se oprește. Apelantul (ecranul) îl
 * cheamă din nou până când `progress.done` devine true — așa se recuperează un istoric de mii de
 * facturi fără ca vreo cerere să depășească plafonul de timp.
 */
export async function syncBuyerInvoices(
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncOutcome> {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? SYNC_BUDGET_MS);
  const pauseMs = options.pauseMs ?? SOAP_PAUSE_MS;
  const state = await loadState(tenantId);

  // Zăvorul: două taburi deschise nu au voie să tragă simultan de SFS.
  if (
    !options.ignoreLock &&
    state.runningSince &&
    now.getTime() - state.runningSince.getTime() < LOCK_TTL_MS
  ) {
    return {
      available: true,
      busy: true,
      discovered: 0,
      detailsRead: 0,
      message: "O sincronizare rulează deja — aștept lotul curent.",
      progress: await getSyncProgress(tenantId),
    };
  }

  const client = options.client;
  if (!client) {
    return {
      available: false,
      busy: false,
      discovered: 0,
      detailsRead: 0,
      message: "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
      progress: await getSyncProgress(tenantId),
    };
  }

  await patchState(tenantId, { runningSince: now });
  const requestId = `par-efp-sync-${now.getTime()}`;
  const errors: string[] = [];
  let discovered = 0;
  let detailsRead = 0;
  let anyCallOk = false;

  try {
    // 1. Listele „vii" — mici, se schimbă des.
    const headsStale =
      options.force ||
      !state.headsSyncedAt ||
      now.getTime() - state.headsSyncedAt.getTime() > HEADS_MIN_INTERVAL_MS;
    if (headsStale && Date.now() < deadline) {
      const live = await fetchLiveLists(client, requestId, pauseMs);
      errors.push(...live.errors);
      if (live.ok) {
        anyCallOk = true;
        discovered += await upsertHeads(tenantId, live.heads);
        await patchState(tenantId, { headsSyncedAt: now });
      }
    }

    // 2. Arhiva. Cât timp istoricul nu e recuperat, mergem înapoi fereastră cu fereastră; după
    //    aceea cerem doar ultimele săptămâni — acolo apar facturile noi.
    //
    // Bugetul se împarte: dacă există deja facturi fără detalii, săpatul în trecut primește doar
    // jumătate din lot. Altfel, pe un cont mare (2.700+ facturi, măsurat pe prod) recuperarea
    // istoricului ar consuma fiecare lot, iar tabelul ar rămâne minute în șir cu rânduri fără
    // furnizor, dată și sumă — adică inutil exact cât timp omul se uită la el.
    const { total: knownBefore, detailed: detailedBefore } = await countInvoices(tenantId);
    const archiveDeadline =
      knownBefore - detailedBefore > 0 ? Math.min(deadline, Date.now() + (options.budgetMs ?? SYNC_BUDGET_MS) / 2) : deadline;
    const floor = new Date(now.getTime() - ARCHIVE_HISTORY_YEARS * 365 * DAY_MS);
    if (!state.archiveDoneAt) {
      let cursor = state.archiveCursorTo ?? now;
      const maxWindows = options.maxArchiveWindows ?? Number.POSITIVE_INFINITY;
      let windows = 0;
      while (Date.now() < archiveDeadline && cursor > floor && windows < maxWindows) {
        windows++;
        const from = new Date(Math.max(cursor.getTime() - ARCHIVE_WINDOW_DAYS * DAY_MS, floor.getTime()));
        const win = await fetchArchiveWindow(client, requestId, from, cursor, archiveDeadline, pauseMs);
        errors.push(...win.errors);
        if (!win.ok) break; // SFS a refuzat: nu mutăm cursorul, reluăm fereastra data viitoare.
        anyCallOk = true;
        discovered += await upsertHeads(tenantId, win.heads);
        cursor = from;
        await patchState(tenantId, { archiveCursorTo: cursor });
      }
      if (cursor <= floor) {
        await patchState(tenantId, { archiveDoneAt: now, archiveCursorTo: cursor });
      }
    } else if (headsStale && Date.now() < archiveDeadline) {
      const from = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
      const win = await fetchArchiveWindow(client, requestId, from, now, archiveDeadline, pauseMs);
      errors.push(...win.errors);
      if (win.ok) {
        anyCallOk = true;
        discovered += await upsertHeads(tenantId, win.heads);
      }
    }

    // 3. Detaliile — doar pentru facturile care încă nu le au, cele mai noi întâi.
    //    La o cerere explicită („Verifică noutățile"), mai încercăm o dată și facturile pe care
    //    le-am lăsat fără conținut: dacă SFS a fost indisponibil atunci, acum poate răspunde.
    if (options.force) {
      await db
        .update(parSfsInvoices)
        .set({ detailsFetchedAt: null, detailAttempts: 0 })
        .where(
          and(
            eq(parSfsInvoices.tenantId, tenantId),
            sql`${parSfsInvoices.detailsFetchedAt} is not null`,
            isNull(parSfsInvoices.supplierIdno)
          )
        );
    }
    while (Date.now() < deadline) {
      const pending = await db
        .select({
          id: parSfsInvoices.id,
          seria: parSfsInvoices.seria,
          number: parSfsInvoices.number,
          detailAttempts: parSfsInvoices.detailAttempts,
        })
        .from(parSfsInvoices)
        .where(and(eq(parSfsInvoices.tenantId, tenantId), isNull(parSfsInvoices.detailsFetchedAt)))
        // Recuperarea arhivei merge înapoi în timp, deci rândurile descoperite PRIMELE sunt
        // facturile cele mai noi — exact cele de care are nevoie omul întâi. Ordinea inversă ar
        // completa mai întâi documentele de acum cinci ani.
        .orderBy(asc(parSfsInvoices.firstSeenAt), desc(parSfsInvoices.number))
        .limit(DETAIL_CHUNK);
      if (pending.length === 0) break;

      const { summaries, errors: detailErrors } = await fetchDetailsFor(
        client,
        pending.map((p) => ({ seria: p.seria, number: p.number })),
        requestId,
        pauseMs
      );
      errors.push(...detailErrors);
      // SFS a refuzat lotul întreg (serviciu picat, drepturi): ne oprim FĂRĂ să numărăm încercarea.
      // Altfel trei căderi temporare ale SFS-ului ar marca definitiv facturile ca „fără conținut".
      if (summaries.size === 0 && detailErrors.length > 0) break;
      if (summaries.size > 0) anyCallOk = true;
      detailsRead += await applyDetails(tenantId, pending, summaries);
    }

    // 4. Denumirile furnizorilor, dacă mai e timp.
    if (Date.now() < deadline) {
      await fillSupplierNames(tenantId, client, requestId, pauseMs);
    }
  } finally {
    await patchState(tenantId, { runningSince: null });
  }

  const progress = await getSyncProgress(tenantId);
  const parts: string[] = [];
  if (discovered > 0) parts.push(`${discovered} facturi noi`);
  if (detailsRead > 0) parts.push(`${detailsRead} citite în detaliu`);
  if (parts.length === 0) parts.push("nimic nou");
  const errorText = errors.length > 0 ? formatSfsErrors(errors) : null;
  const message = progress.done
    ? `Sincronizare completă: ${progress.total} facturi în arhiva locală.`
    : `Lot citit: ${parts.join(", ")}. Mai sunt ${progress.pending} de citit${
        progress.archiveDone ? "" : " (istoricul se recuperează)"
      }.`;

  await patchState(tenantId, {
    lastBatchAt: new Date(),
    lastMessage: message,
    lastError: errorText,
  });

  return {
    available: anyCallOk || errors.length === 0,
    busy: false,
    discovered,
    detailsRead,
    message: errorText ? `${message} SFS a răspuns parțial: ${errorText}` : message,
    progress: { ...progress, lastMessage: message, lastError: errorText },
  };
}

/**
 * Adună erorile parțiale într-o singură frază, grupând listele care au picat din ACELAȘI motiv.
 * (Mutat aici din efacturaScan: e util oriunde se citește din SFS.)
 */
export function formatSfsErrors(errors: string[]): string {
  const byCause = new Map<string, string[]>();
  for (const raw of errors) {
    const sep = raw.indexOf(": ");
    const label = sep > 0 ? raw.slice(0, sep) : "";
    const cause = (sep > 0 ? raw.slice(sep + 2) : raw).replace(/^e-Factura MD \w+: /, "");
    const labels = byCause.get(cause);
    if (labels) labels.push(label);
    else byCause.set(cause, [label]);
  }
  return [...byCause.entries()]
    .map(([cause, labels]) => {
      const named = [...new Set(labels.filter(Boolean))];
      return named.length > 0 ? `${named.join(", ")}: ${cause}` : cause;
    })
    .join("; ");
}

// ─── Citirea copiei locale ────────────────────────────────────────────────────

export type InvoiceSort = "date_desc" | "date_asc" | "supplier_asc" | "amount_desc" | "amount_asc";

export interface InvoiceFilters {
  /** Perioada facturii (după data din document). */
  from?: Date | null;
  to?: Date | null;
  /** Codul fiscal al furnizorului (exact, normalizat). */
  supplier?: string | null;
  /** Căutare liberă: denumire furnizor, cod fiscal, serie sau număr. */
  q?: string | null;
  sort?: InvoiceSort;
  page?: number;
  pageSize?: number;
}

export interface CachedInvoiceRow {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  supplierIdno: string | null;
  supplierName: string | null;
  buyerIdno: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  portalUrl: string | null;
  /** false = știm doar că factura există; conținutul nu a fost încă citit din SFS. */
  detailsRead: boolean;
}

export interface SupplierFacet {
  idno: string;
  name: string | null;
  count: number;
  totalCents: number;
}

const MAX_PAGE_SIZE = 200;

function orderFor(sort: InvoiceSort) {
  switch (sort) {
    case "date_asc":
      // Facturile fără dată citită stau la coadă în ambele sensuri: „necunoscut" nu e nici vechi,
      // nici nou, iar aruncarea lor în capul listei ar ascunde datele reale.
      return [sql`${parSfsInvoices.invoiceDate} asc nulls last`, asc(parSfsInvoices.number)];
    case "supplier_asc":
      return [
        sql`coalesce(${parSfsInvoices.supplierName}, ${parSfsInvoices.supplierIdno}) asc nulls last`,
        sql`${parSfsInvoices.invoiceDate} desc nulls last`,
      ];
    case "amount_desc":
      return [sql`${parSfsInvoices.totalCents} desc nulls last`, desc(parSfsInvoices.number)];
    case "amount_asc":
      return [sql`${parSfsInvoices.totalCents} asc nulls last`, asc(parSfsInvoices.number)];
    case "date_desc":
    default:
      return [sql`${parSfsInvoices.invoiceDate} desc nulls last`, desc(parSfsInvoices.number)];
  }
}

function whereFor(tenantId: string, f: InvoiceFilters) {
  const conditions = [eq(parSfsInvoices.tenantId, tenantId)];
  if (f.from) conditions.push(gte(parSfsInvoices.invoiceDate, f.from));
  if (f.to) conditions.push(lte(parSfsInvoices.invoiceDate, f.to));
  if (f.supplier) {
    conditions.push(
      sql`regexp_replace(upper(coalesce(${parSfsInvoices.supplierIdno}, '')), '[^0-9A-Z]', '', 'g') = ${normalizeFiscalId(
        f.supplier
      )}`
    );
  }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${parSfsInvoices.supplierName}, '')) like ${like}`,
        sql`lower(coalesce(${parSfsInvoices.supplierIdno}, '')) like ${like}`,
        sql`lower(${parSfsInvoices.seria}) like ${like}`,
        sql`lower(${parSfsInvoices.number}) like ${like}`
      )!
    );
  }
  return and(...conditions);
}

export interface CachedInvoicePage {
  items: CachedInvoiceRow[];
  /** Câte facturi corespund filtrului (nu doar pagina curentă). */
  total: number;
  /** Suma facturilor filtrate care au totalul citit. */
  totalCents: number;
  page: number;
  pageSize: number;
}

/** O pagină din copia locală, filtrată și sortată. Fără niciun apel la SFS. */
export async function listCachedInvoices(
  tenantId: string,
  filters: InvoiceFilters = {}
): Promise<CachedInvoicePage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 50));
  const where = whereFor(tenantId, filters);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalCents: sql<number>`coalesce(sum(${parSfsInvoices.totalCents}), 0)::bigint`,
    })
    .from(parSfsInvoices)
    .where(where);

  const rows = await db
    .select()
    .from(parSfsInvoices)
    .where(where)
    .orderBy(...orderFor(filters.sort ?? "date_desc"))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map(toRow),
    total: Number(totals?.total ?? 0),
    totalCents: Number(totals?.totalCents ?? 0),
    page,
    pageSize,
  };
}

function toRow(r: typeof parSfsInvoices.$inferSelect): CachedInvoiceRow {
  return {
    seria: r.seria,
    number: r.number,
    invoiceStatus: r.invoiceStatus,
    invoiceStatusLabel: EFACTURA_MD_STATUS[r.invoiceStatus] ?? `cod ${r.invoiceStatus}`,
    supplierIdno: r.supplierIdno,
    supplierName: r.supplierName,
    buyerIdno: r.buyerIdno,
    invoiceDate: r.invoiceDate?.toISOString() ?? null,
    totalCents: r.totalCents,
    portalUrl: r.portalUrl,
    detailsRead: !!r.detailsFetchedAt,
  };
}

/** Furnizorii din copia locală, cu câte facturi și ce sumă — alimentează filtrul „Furnizor". */
export async function listSupplierFacets(tenantId: string): Promise<SupplierFacet[]> {
  const rows = await db
    .select({
      idno: parSfsInvoices.supplierIdno,
      name: sql<string | null>`max(${parSfsInvoices.supplierName})`,
      count: sql<number>`count(*)::int`,
      totalCents: sql<number>`coalesce(sum(${parSfsInvoices.totalCents}), 0)::bigint`,
    })
    .from(parSfsInvoices)
    .where(
      and(
        eq(parSfsInvoices.tenantId, tenantId),
        sql`${parSfsInvoices.supplierIdno} is not null and ${parSfsInvoices.supplierIdno} <> ''`
      )
    )
    .groupBy(parSfsInvoices.supplierIdno)
    .orderBy(sql`count(*) desc`)
    .limit(300);

  return rows.map((r) => ({
    idno: r.idno ?? "",
    name: r.name,
    count: Number(r.count),
    totalCents: Number(r.totalCents),
  }));
}

/** Intervalul acoperit de copia locală — pentru textul „facturi din perioada …". */
export async function cachedDateRange(
  tenantId: string
): Promise<{ oldest: string | null; newest: string | null }> {
  const [row] = await db
    .select({
      oldest: sql<string | null>`min(${parSfsInvoices.invoiceDate})`,
      newest: sql<string | null>`max(${parSfsInvoices.invoiceDate})`,
    })
    .from(parSfsInvoices)
    .where(eq(parSfsInvoices.tenantId, tenantId));
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
  return { oldest: iso(row?.oldest ?? null), newest: iso(row?.newest ?? null) };
}

/**
 * Facturile din copia locală în forma folosită la potrivirea cu plățile PAR.
 *
 * Doar cele cu detalii citite: o factură din care nu știm nici furnizorul, nici data, nu poate
 * confirma nimic — a o trata ca potrivire ar însemna să inventăm.
 */
export async function cachedInvoiceSummaries(tenantId: string): Promise<SfsInvoiceSummary[]> {
  const rows = await db
    .select()
    .from(parSfsInvoices)
    .where(
      and(
        eq(parSfsInvoices.tenantId, tenantId),
        sql`${parSfsInvoices.detailsFetchedAt} is not null`,
        sql`${parSfsInvoices.supplierIdno} is not null`
      )
    );
  return rows.map((r) => ({
    seria: r.seria,
    number: r.number,
    invoiceStatus: r.invoiceStatus,
    invoiceStatusLabel: EFACTURA_MD_STATUS[r.invoiceStatus] ?? `cod ${r.invoiceStatus}`,
    supplierIdno: r.supplierIdno,
    supplierName: r.supplierName,
    buyerIdno: r.buyerIdno,
    invoiceDate: r.invoiceDate,
    totalCents: r.totalCents,
    portalUrl: r.portalUrl,
  }));
}

/** Șterge copia locală a unui workspace (folosit de „Citește din nou tot istoricul"). */
export async function resetInvoiceCache(tenantId: string): Promise<void> {
  await db.delete(parSfsInvoices).where(eq(parSfsInvoices.tenantId, tenantId));
  await patchState(tenantId, {
    headsSyncedAt: null,
    archiveCursorTo: null,
    archiveDoneAt: null,
    lastMessage: null,
    lastError: null,
    runningSince: null,
  });
}
