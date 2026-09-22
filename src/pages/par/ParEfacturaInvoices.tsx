/**
 * PAR-EFP — tabul „Toate e-Facturile" din /business/par/efactura.
 *
 * Ce s-a schimbat și de ce (2026-09-22):
 *   Înainte, tabul cerea la fiecare deschidere întreg istoricul din SFS, într-o singură cerere:
 *   pe un cont cu 543 de facturi se termina timpul serverului și scria „am citit detaliile doar
 *   pentru primele 200 din 543" — iar următoarea deschidere o lua de la capăt cu aceleași 200.
 *   Acum facturile se citesc O DATĂ, în loturi mici, și rămân salvate; ecranul citește din baza
 *   locală, deci se deschide instant și poate fi filtrat pe perioadă sau furnizor și sortat.
 *
 * Bucla de loturi: cât timp mai e ceva de adus, pagina cheamă `sync` la câteva secunde, arată
 * progresul și poate fi oprită oricând. Se oprește singură la eroare, la plecarea de pe tab sau
 * când altcineva sincronizează deja (zăvorul din server) — SFS-ul real refuză rafalele de cereri.
 *
 * Design system: doar tokeni HR365, light + dark, ținte de click ≥ 44px.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  ReceiptText,
  RefreshCcw,
  Search,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Progress,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";
import {
  getParEfacturaInvoices,
  syncParEfacturaInvoices,
  type BuyerInvoiceList,
  type InvoiceQuery,
  type InvoiceSort,
} from "@/lib/api/parEfactura";

const PAGE_SIZE = 50;
/** Pauză între loturi: lasă SFS-ul să respire și ține interfața reactivă. */
const BATCH_PAUSE_MS = 1_200;
/** Când serverul spune „sincronizează deja altcineva", așteptăm mai mult înainte să reîncercăm. */
const BUSY_PAUSE_MS = 5_000;
/** Câte loturi la rând acceptăm fără nicio achiziție înainte să oprim bucla (blocaj tăcut). */
const MAX_IDLE_BATCHES = 3;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(cents: number): string {
  return `${(cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "niciodată";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "niciodată";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "acum câteva secunde";
  if (mins < 60) return `acum ${mins} min`;
  return d.toLocaleString("ro-MD", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** `YYYY-MM-DD` în ora locală — ce așteaptă `<input type="date">`. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Perioadele uzuale de la finanțe: luna în curs, luna trecută, anul, anul trecut. */
const PERIODS: { key: string; label: string; range: () => { from: string; to: string } }[] = [
  {
    key: "month",
    label: "Luna aceasta",
    range: () => {
      const n = new Date();
      return { from: isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoDay(n) };
    },
  },
  {
    key: "prev-month",
    label: "Luna trecută",
    range: () => {
      const n = new Date();
      return {
        from: isoDay(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        to: isoDay(new Date(n.getFullYear(), n.getMonth(), 0)),
      };
    },
  },
  {
    key: "year",
    label: "Anul acesta",
    range: () => {
      const n = new Date();
      return { from: isoDay(new Date(n.getFullYear(), 0, 1)), to: isoDay(n) };
    },
  },
  {
    key: "prev-year",
    label: "Anul trecut",
    range: () => {
      const y = new Date().getFullYear() - 1;
      return { from: isoDay(new Date(y, 0, 1)), to: isoDay(new Date(y, 11, 31)) };
    },
  },
];

const SORT_OPTIONS: { value: InvoiceSort; label: string }[] = [
  { value: "date_desc", label: "Data — cele mai noi întâi" },
  { value: "date_asc", label: "Data — cele mai vechi întâi" },
  { value: "supplier_asc", label: "Furnizor (A→Z)" },
  { value: "amount_desc", label: "Sumă — descrescător" },
  { value: "amount_asc", label: "Sumă — crescător" },
];

// ─── Bara de sincronizare ─────────────────────────────────────────────────────

function SyncBar({
  data,
  running,
  busy,
  note,
  onStart,
  onStop,
  onRefresh,
}: {
  data: BuyerInvoiceList;
  running: boolean;
  busy: boolean;
  note: string | null;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  const { sync } = data;
  const pct = sync.total > 0 ? Math.round((sync.detailed / sync.total) * 100) : 0;
  // Cât timp istoricul nu e parcurs, nici măcar numitorul nu e cunoscut — nu promitem un procent
  // care s-ar da înapoi la lotul următor.
  const showPct = sync.archiveDone;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-medium text-foreground">
            {sync.total > 0
              ? `${sync.total.toLocaleString("ro-MD")} facturi salvate local · ${sync.detailed.toLocaleString("ro-MD")} cu detalii citite`
              : "Nicio factură citită încă din SFS"}
          </p>
          <p className="text-xs text-muted-foreground">
            {sync.archiveDone
              ? `Istoric citit (ultimii ${sync.historyYears} ani) · ultima verificare ${fmtWhen(sync.lastBatchAt)}`
              : "Se recuperează istoricul din SFS, lot cu lot — poți pleca de pe pagină, progresul se păstrează."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="outline" size="sm" onClick={onStop} aria-label="Oprește citirea în loturi">
              <Pause className="h-4 w-4" aria-hidden />
              Oprește
            </Button>
          ) : (
            !sync.done && (
              <Button size="sm" onClick={onStart} aria-label="Continuă citirea din SFS">
                <Play className="h-4 w-4" aria-hidden />
                {sync.total > 0 ? "Continuă citirea" : "Citește din SFS"}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={running}
            aria-label="Verifică dacă au apărut facturi noi în SFS"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Verifică noutățile
          </Button>
        </div>
      </div>

      {(running || sync.pending > 0 || !sync.archiveDone) && (
        <div className="space-y-1">
          <Progress value={showPct ? pct : 100} tone={running ? "primary" : "warning"} height={6} />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {running && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {busy
              ? "Altcineva sincronizează acum — aștept să termine lotul curent."
              : sync.pending > 0
                ? `${sync.pending.toLocaleString("ro-MD")} facturi mai așteaptă citirea detaliilor${showPct ? ` · ${pct}% gata` : ""}`
                : "Se caută facturi mai vechi în arhiva SFS…"}
          </p>
        </div>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {sync.lastError && (
        <Alert variant="warning" icon={<AlertTriangle className="h-4 w-4" />}>
          Ultima citire a fost parțială: {sync.lastError}
        </Alert>
      )}
    </Card>
  );
}

// ─── Tabul ────────────────────────────────────────────────────────────────────

export function ParEfacturaInvoices({
  sfsConfigured,
  onOpenInvoice,
}: {
  sfsConfigured: boolean;
  /** Deschide conținutul facturii în dialogul paginii-părinte. */
  onOpenInvoice: (invoice: { seria: string; number: string }) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<BuyerInvoiceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<InvoiceSort>("date_desc");
  const [page, setPage] = useState(1);

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Bucla trăiește în afara randării: un `useState` citit dintr-un `while` ar rămâne pe valoarea
  // veche, iar butonul „Oprește" n-ar opri nimic.
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const query: InvoiceQuery = useMemo(
    () => ({ from: from || null, to: to || null, supplier: supplier || null, q: q || null, sort, page, pageSize: PAGE_SIZE }),
    [from, to, supplier, q, sort, page]
  );

  // Filtrele curente, citite dintr-un ref: bucla de loturi pornită înainte de o schimbare de
  // filtru nu are voie să reîncarce lista cu filtrele vechi peste ce vede omul acum.
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await getParEfacturaInvoices(queryRef.current);
        if (!mountedRef.current) return res;
        setData(res);
        setError(null);
        return res;
      } catch (e) {
        if (mountedRef.current) {
          setError(
            e instanceof ApiError && e.status === 403
              ? "Ai nevoie de rolul finanțe sau administrator PAR."
              : "Nu am putut citi facturile salvate."
          );
        }
        return null;
      } finally {
        if (!silent && mountedRef.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runningRef.current = false;
    };
  }, []);

  useEffect(() => {
    void load();
  }, [query, load]);

  /** Căutarea liberă așteaptă o pauză de tastare — altfel ar interoga la fiecare literă. */
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  /**
   * Bucla de loturi. Fiecare tură = un apel scurt la server, care citește ce poate și se oprește;
   * pagina se actualizează între ture, deci progresul se vede în timp real.
   */
  const runBatches = useCallback(
    async (refreshFirst = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setNote(null);
      let idle = 0;
      try {
        while (runningRef.current && mountedRef.current) {
          const res = await syncParEfacturaInvoices(refreshFirst);
          refreshFirst = false;
          if (!mountedRef.current) break;

          setBusy(res.busy);
          if (!res.available) {
            setNote(res.message);
            break;
          }
          if (res.busy) {
            await new Promise((r) => setTimeout(r, BUSY_PAUSE_MS));
            continue;
          }

          setNote(res.message);
          const advanced = res.discovered > 0 || res.detailsRead > 0;
          if (advanced) {
            idle = 0;
            await load(true);
          } else if (++idle >= MAX_IDLE_BATCHES) {
            // Nimic nou de trei loturi la rând: ori SFS refuză tăcut, ori chiar nu mai e nimic.
            // Oricum, o buclă care nu avansează nu are voie să macine cereri la nesfârșit.
            break;
          }
          if (res.progress.done) {
            if (!advanced) await load(true);
            break;
          }
          await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
        }
      } catch {
        if (mountedRef.current) setNote("Sincronizarea cu SFS a eșuat — poți relua cu butonul de continuare.");
      } finally {
        runningRef.current = false;
        if (mountedRef.current) {
          setRunning(false);
          setBusy(false);
          await load(true);
        }
      }
    },
    [load]
  );

  // Prima vizită pe un workspace nesincronizat: pornim singuri. Omul n-are de unde ști că trebuie
  // apăsat un buton ca să vadă facturi, iar costul e deja împărțit în loturi.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!data || autoStarted.current || !sfsConfigured) return;
    if (data.sync.total === 0 && !data.sync.lastError && !data.sync.lastBatchAt) {
      autoStarted.current = true;
      void runBatches();
    }
  }, [data, sfsConfigured, runBatches]);

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
  };

  const resetFilters = () => {
    setFrom("");
    setTo("");
    setSupplier("");
    setSearch("");
    setQ("");
    setPage(1);
  };

  const applyPeriod = (key: string) => {
    const p = PERIODS.find((x) => x.key === key);
    if (!p) {
      setFrom("");
      setTo("");
    } else {
      const r = p.range();
      setFrom(r.from);
      setTo(r.to);
    }
    setPage(1);
  };

  const activePeriod = PERIODS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.pageSize || PAGE_SIZE))) : 1;
  const hasFilters = !!(from || to || supplier || q);

  /** Click pe capul de coloană: aceeași coloană → inversează sensul. */
  const sortBy = (asc: InvoiceSort, desc: InvoiceSort) => {
    setSort((current) => (current === desc ? asc : desc));
    setPage(1);
  };
  const sortIcon = (asc: InvoiceSort, desc: InvoiceSort) =>
    sort === desc ? (
      <ArrowDown className="h-3 w-3" aria-hidden />
    ) : sort === asc ? (
      <ArrowUp className="h-3 w-3" aria-hidden />
    ) : null;

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
          {error}
        </Alert>
      )}

      {data && (
        <SyncBar
          data={data}
          running={running}
          busy={busy}
          note={note}
          onStart={() => void runBatches()}
          onStop={stop}
          onRefresh={() => void runBatches(true)}
        />
      )}

      {data && !data.available && !running && data.sync.total === 0 && (
        <Alert
          variant="warning"
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Nu putem spune ce facturi există"
        >
          {data.message}
        </Alert>
      )}

      {/* ── Filtre: perioadă, furnizor, căutare, sortare ── */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Perioada facturilor">
          <span className="text-xs font-medium text-muted-foreground">Perioadă:</span>
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={activePeriod === p.key ? "default" : "outline"}
              onClick={() => applyPeriod(p.key)}
              aria-pressed={activePeriod === p.key}
            >
              {p.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={!from && !to ? "default" : "outline"}
            onClick={() => applyPeriod("all")}
            aria-pressed={!from && !to}
          >
            Tot
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="efp-from">De la</Label>
            <Input
              id="efp-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="efp-to">Până la</Label>
            <Input
              id="efp-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="efp-supplier">Furnizor</Label>
            <Select
              id="efp-supplier"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Toți furnizorii</option>
              {(data?.suppliers ?? []).map((s) => (
                <option key={s.idno} value={s.idno}>
                  {(s.name ?? s.idno).slice(0, 48)} ({s.count})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="efp-sort">Sortare</Label>
            <Select id="efp-sort" value={sort} onChange={(e) => setSort(e.target.value as InvoiceSort)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Label htmlFor="efp-q">Caută</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="efp-q"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="denumire, cod fiscal, serie sau număr"
                className="pl-9"
              />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Șterge filtrele
            </Button>
          )}
          {data && (
            <p className="ml-auto text-xs text-muted-foreground">
              <strong className="text-foreground">{data.total.toLocaleString("ro-MD")}</strong> facturi
              {data.totalCents > 0 ? ` · ${fmtAmount(data.totalCents)}` : ""}
            </p>
          )}
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Se încarcă…
        </div>
      )}

      {!loading && data && data.invoices.length === 0 && (
        <Card className="p-8 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            {hasFilters
              ? "Nicio factură pentru filtrele alese."
              : data.sync.total > 0
                ? "Nicio factură în copia locală."
                : "Încă nu am citit facturile din SFS."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.message}</p>
        </Card>
      )}

      {!loading && data && data.invoices.length > 0 && (
        <>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => sortBy("supplier_asc", "supplier_asc")}
                      className="flex min-h-[44px] items-center gap-1 font-medium"
                      aria-label="Sortează după furnizor"
                    >
                      Furnizor
                      {sort === "supplier_asc" && <ArrowUp className="h-3 w-3" aria-hidden />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => sortBy("date_asc", "date_desc")}
                      className="flex min-h-[44px] items-center gap-1 font-medium"
                      aria-label="Sortează după dată"
                    >
                      Data
                      {sortIcon("date_asc", "date_desc")}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => sortBy("amount_asc", "amount_desc")}
                      className="flex min-h-[44px] items-center gap-1 font-medium"
                      aria-label="Sortează după sumă"
                    >
                      Sumă
                      {sortIcon("amount_asc", "amount_desc")}
                    </button>
                  </TableHead>
                  <TableHead>Stare în SFS</TableHead>
                  <TableHead>Cerere PAR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invoices.map((inv) => (
                  <TableRow key={`${inv.seria}-${inv.number}`}>
                    <TableCell className="whitespace-nowrap text-sm font-medium">
                      {/* Linkul din codul QR duce la 404 în afara portalului SFS, deci deschidem
                          conținutul facturii aici, în aplicație. */}
                      <button
                        type="button"
                        onClick={() => onOpenInvoice({ seria: inv.seria, number: inv.number })}
                        className="min-h-[44px] text-primary hover:underline"
                        aria-label={`Vezi factura ${inv.seria} ${inv.number}`}
                      >
                        {inv.seria} {inv.number}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{inv.supplierName ?? "—"}</span>
                      {inv.supplierIdno && <p className="text-xs text-muted-foreground">{inv.supplierIdno}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {inv.detailsRead ? (
                        fmtDate(inv.invoiceDate)
                      ) : (
                        // „Necitit" nu e „gol": omul trebuie să vadă că datele urmează, nu că lipsesc.
                        <span className="text-xs text-muted-foreground">se citește…</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {inv.totalCents != null ? fmtAmount(inv.totalCents) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.invoiceStatusLabel || `cod ${inv.invoiceStatus}`}
                    </TableCell>
                    <TableCell>
                      {inv.linkedParId ? (
                        <button
                          type="button"
                          onClick={() => router.navigate(`/business/par/${inv.linkedParId}`)}
                          className="min-h-[44px] text-sm font-medium text-primary hover:underline"
                        >
                          {inv.linkedRequestNo}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">fără cerere</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                aria-label="Pagina anterioară"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Înapoi
              </Button>
              <p className="text-xs text-muted-foreground">
                Pagina {data.page} din {totalPages}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={data.page >= totalPages}
                aria-label="Pagina următoare"
              >
                Înainte
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </>
      )}

      {data?.sync.done && data.sync.total > 0 && !running && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
          Istoricul din SFS (ultimii {data.sync.historyYears} ani) e salvat local — deschiderile
          următoare nu mai cer nimic de la SFS.
        </p>
      )}
    </div>
  );
}

export default ParEfacturaInvoices;
