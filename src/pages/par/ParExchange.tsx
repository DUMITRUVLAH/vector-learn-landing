/**
 * FX-001: Curs valutar — secțiune separată în PAR.
 *
 * Trei lucruri, în ordinea în care le folosește omul care face o cerere de plată:
 *   1. cursul oficial BNM al zilei (EUR / USD / restul valutelor), cu variația față de ziua trecută
 *   2. un convertor — orice sumă, orice pereche, pe cursul zilei alese (cross-rate prin leu)
 *   3. evoluția pe ultimele 30 de zile, ca să se vadă dacă un grant încasat azi valorează mai
 *      mult sau mai puțin decât la semnarea contractului
 *
 * Datele vin de la BNM prin /api/par/fx (server/routes/parFx.ts). Data cerută poate diferi de
 * cea afișată: în weekend, sărbători sau înainte de publicare BNM nu are curs nou, iar atunci
 * arătăm explicit „curs valabil pentru <data>", nu un număr fără context.
 *
 * Design: tokeni Vector 365, light + dark, WCAG AA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowDownRight,
  ArrowUpRight,
  AlertCircle,
  Banknote,
  Calculator,
  ExternalLink,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Card, EmptyState, Input, Label, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { cn } from "@/lib/utils";
import { EMOJI_FONT_STACK, flagOf } from "@/lib/par/currencyFlag";
import {
  crossRate,
  formatMoney,
  formatRate,
  pctDisplay,
  getFxRates,
  getFxSeries,
  type FxRate,
  type FxSeriesPoint,
} from "@/lib/api/parFx";

/** Ziua de azi ca "YYYY-MM-DD", în ora locală (nu UTC — altfel seara sare o zi). */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDateRo(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("ro-MD", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── Steagul valutei ─────────────────────────────────────────────────────────

/**
 * Steag într-un cerc neutru. E DECORATIV (`aria-hidden`): codul valutei stă mereu lângă el, deci
 * cititorul de ecran și platformele fără glife de steag nu pierd nimic. Valutele fără țară (XDR)
 * primesc codul în locul steagului, ca rândul să nu rămână cu un gol în dreptul icoanei.
 */
function CurrencyFlag({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const flag = flagOf(code);
  const box = size === "sm" ? "h-6 w-6 text-[13px]" : "h-9 w-9 text-lg";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted leading-none",
        box,
        !flag && "text-[9px] font-semibold tracking-tight text-muted-foreground",
      )}
      style={flag ? { fontFamily: EMOJI_FONT_STACK } : undefined}
    >
      {flag ?? code}
    </span>
  );
}

// ─── Cartela unei valute de top ──────────────────────────────────────────────

function RateCard({ rate }: { rate: FxRate }) {
  const pct = pctDisplay(rate.change_pct);
  const up = pct.dir > 0;
  const down = pct.dir < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CurrencyFlag code={rate.code} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{rate.code}</p>
            <p className="truncate text-xs text-muted-foreground">{rate.name}</p>
          </div>
        </div>
        {rate.change != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              up && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              down && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
              !up && !down && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {pct.text}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
        {formatRate(rate.mdl_per_unit)} <span className="text-base font-medium text-muted-foreground">MDL</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        pentru 1 {rate.code}
        {rate.change != null ? (
          <>
            {" · "}
            {rate.change > 0 ? "+" : ""}
            {formatRate(rate.change)} față de ziua precedentă
          </>
        ) : null}
      </p>
    </Card>
  );
}

// ─── Convertorul ─────────────────────────────────────────────────────────────

interface ConverterProps {
  rates: FxRate[];
  effectiveDate: string;
}

function Converter({ rates, effectiveDate }: ConverterProps) {
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("MDL");

  // MDL nu e în tabloul BNM (e valuta de bază), dar e cea în care se plătește — deci intră
  // explicit în ambele liste, prima.
  const options = useMemo(
    () =>
      [{ code: "MDL", name: "Leu moldovenesc" }, ...rates.map((r) => ({ code: r.code, name: r.name }))].map((o) => ({
        ...o,
        // `<option>` acceptă doar text, deci steagul intră direct în etichetă.
        label: `${flagOf(o.code) ?? ""} ${o.code} — ${o.name}`.trim(),
      })),
    [rates],
  );

  const parsed = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(parsed);
  const rate = crossRate(rates, from, to);
  const result = valid && rate != null ? parsed * rate : null;

  const swap = useCallback(() => {
    setFrom(to);
    setTo(from);
  }, [from, to]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Calculator valutar</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="fx-amount">Sumă</Label>
          <Input
            id="fx-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={!valid}
            aria-describedby={!valid ? "fx-amount-err" : undefined}
          />
          <div className="pt-1">
            <Label htmlFor="fx-from">Din</Label>
            <Select id="fx-from" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1.5">
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex justify-center sm:pb-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            aria-label="Inversează valutele"
            className="h-11 w-11"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fx-result">Rezultat</Label>
          <div
            id="fx-result"
            role="status"
            aria-live="polite"
            className="flex h-10 max-sm:h-11 items-center rounded-lg border border-border bg-muted/40 px-3 text-base font-semibold tabular-nums text-foreground"
          >
            {result != null ? formatMoney(result, to) : "—"}
          </div>
          <div className="pt-1">
            <Label htmlFor="fx-to">În</Label>
            <Select id="fx-to" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5">
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {!valid ? (
        <p id="fx-amount-err" className="mt-3 text-xs text-destructive">
          Introdu o sumă numerică (ex. 1250,50).
        </p>
      ) : rate == null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          BNM nu cotează perechea {from}/{to} pentru {formatDateRo(effectiveDate)}.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          1 {from} = {formatRate(rate)} {to} · curs oficial BNM din {formatDateRo(effectiveDate)}
          {from !== "MDL" && to !== "MDL" ? " (calculat prin leu, cum cotează BNM)" : ""}
        </p>
      )}
    </Card>
  );
}

// ─── Graficul pe 30 de zile ──────────────────────────────────────────────────

const SERIES_CODES = ["EUR", "USD"];

/** Perioadele oferite în grafic. `days` = câte zile în urmă față de azi. */
const PERIODS = [
  { key: "30d", label: "30 zile", days: 30 },
  { key: "3m", label: "3 luni", days: 92 },
  { key: "1y", label: "1 an", days: 366 },
  { key: "3y", label: "3 ani", days: 1096 },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"] | "custom";

/** Data de la care începe o perioadă predefinită. */
function startOf(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Eticheta de pe axa X. Pe 30 de zile ziua contează („08.12"); pe ani, nu — acolo devine
 * „08.24", adică luna și anul, altfel axa e un zid de numere care se repetă.
 */
function axisLabel(iso: string, longRange: boolean): string {
  const [y, m, d] = iso.split("-");
  return longRange ? `${m}.${y.slice(2)}` : `${d}.${m}`;
}
const SERIES_COLOR: Record<string, string> = {
  // Recharts cere valori de culoare, nu clase Tailwind. Folosim aceeași convenție ca restul
  // graficelor din aplicație (`--chart-N` cu HSL de rezervă), ca seriile să fie distincte și
  // lizibile în ambele teme — `--muted-foreground` ar fi dat o linie ștearsă pe dark.
  EUR: "hsl(var(--chart-1, 217 91% 60%))",
  USD: "hsl(var(--chart-2, 160 84% 39%))",
};

interface HistoryChartProps {
  points: FxSeriesPoint[];
  loading: boolean;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  stepDays: number;
}

function HistoryChart({
  points,
  loading,
  period,
  onPeriod,
  from,
  to,
  onFrom,
  onTo,
  stepDays,
}: HistoryChartProps) {
  const longRange = stepDays > 3;
  const data = useMemo(
    () =>
      points.map((p) => ({
        date: axisLabel(p.date, longRange),
        iso: p.date,
        EUR: p.rates.EUR ?? null,
        USD: p.rates.USD ?? null,
      })),
    [points, longRange],
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Evoluție — lei pentru 1 EUR / 1 USD</h2>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Perioada graficului">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPeriod(p.key)}
              aria-pressed={period === p.key}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPeriod("custom")}
            aria-pressed={period === "custom"}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              period === "custom"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Interval
          </button>
        </div>
      </div>

      {period === "custom" ? (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="fx-from-date">De la</Label>
            <Input
              id="fx-from-date"
              type="date"
              value={from}
              max={to}
              onChange={(e) => onFrom(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fx-to-date">Până la</Label>
            <Input
              id="fx-to-date"
              type="date"
              value={to}
              min={from}
              max={todayIso()}
              onChange={(e) => onTo(e.target.value)}
              className="w-[170px]"
            />
          </div>
        </div>
      ) : null}
      {loading ? (
        <div className="flex h-[240px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă graficul" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState compact title="Nu avem încă istoric" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              width={48}
              tickFormatter={(v) => Number(v).toFixed(2)}
            />
            <Tooltip
              formatter={(v, name) => [`${formatRate(Number(v))} MDL`, String(name)]}
              labelFormatter={(_l, payload) => {
                const iso = (payload?.[0]?.payload as { iso?: string } | undefined)?.iso;
                return iso ? formatDateRo(iso) : "";
              }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
                color: "hsl(var(--foreground))",
              }}
            />
            {SERIES_CODES.map((code) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                stroke={SERIES_COLOR[code]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      {stepDays > 1 && data.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Pe perioade lungi graficul ia un punct la {stepDays} zile — BNM servește o singură zi per
          cerere, iar curba arată la fel. Pentru cursul exact al unei zile, alege data de sus.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-4">
        {SERIES_CODES.map((code) => (
          <span key={code} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES_COLOR[code] }} aria-hidden="true" />
            {code}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ─── Pagina ──────────────────────────────────────────────────────────────────

export function ParExchange() {
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<{
    rates: FxRate[];
    requestedDate: string;
    effectiveDate: string;
    isStale: boolean;
  } | null>(null);
  const [series, setSeries] = useState<FxSeriesPoint[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [rangeFrom, setRangeFrom] = useState(() => startOf(30));
  const [rangeTo, setRangeTo] = useState(todayIso());
  const [stepDays, setStepDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (iso: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFxRates(iso);
      // Datele vin din răspuns, nu din starea locală: serverul e cel care știe pentru ce zi
      // există curs, iar bannerul „curs vechi" trebuie să numească exact zilele lui.
      setData({
        rates: res.rates,
        requestedDate: res.requested_date,
        effectiveDate: res.effective_date,
        isStale: res.is_stale,
      });
    } catch {
      setError("Nu am putut prelua cursul de la BNM. Încearcă din nou peste câteva momente.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  /** Trecerea pe o perioadă predefinită rescrie intervalul; „Interval" îl lasă pe al omului. */
  const choosePeriod = useCallback((next: PeriodKey) => {
    setPeriod(next);
    const preset = PERIODS.find((p) => p.key === next);
    if (preset) {
      setRangeFrom(startOf(preset.days));
      setRangeTo(todayIso());
    }
  }, []);

  /**
   * Serverul completează cel mult 60 de zile noi pe cerere (ca o funcție serverless să nu fie
   * tăiată la timeout) și raportează `partial`. Pe o perioadă lungă cerută prima dată, continuăm
   * în runde până se umple — fiecare rundă desenează deja ce a adus, deci graficul se completează
   * sub ochii omului în loc să stea gol.
   */
  useEffect(() => {
    let cancelled = false;
    setSeriesLoading(true);

    (async () => {
      try {
        for (let round = 0; round < 8; round++) {
          const res = await getFxSeries(SERIES_CODES, {
            from: rangeFrom,
            to: rangeTo,
            refresh: round > 0,
          });
          if (cancelled) return;
          setSeries(res.points);
          setStepDays(res.step_days);
          if (!res.partial) break;
        }
      } catch {
        if (!cancelled) setSeries([]);
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const rates = data?.rates ?? [];
  const pinned = rates.filter((r) => r.pinned).slice(0, 4);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rates, query]);

  return (
    <BusinessShell
      pageTitle="Curs valutar"
      pageDescription="Cursul oficial al Băncii Naționale a Moldovei, plus un calculator"
    >
      <div className="space-y-4">
        {/* Controale: data + reîncărcare */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fx-date">Data cursului</Label>
            <Input
              id="fx-date"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value || todayIso())}
              className="w-[190px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load(date)}
            disabled={loading}
            className="h-10 max-sm:h-11"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            Reîncarcă
          </Button>
          <a
            href="https://www.bnm.md/ro/official_exchange_rates"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 max-sm:h-11 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sursa: bnm.md
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        {error ? (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
            {error}
          </Alert>
        ) : null}

        {data?.isStale ? (
          <Alert icon={<Banknote className="h-4 w-4" />}>
            Pentru {formatDateRo(data.requestedDate)} BNM nu a publicat un curs nou (weekend, sărbătoare sau zi
            nepublicată încă). Se aplică cursul din {formatDateRo(data.effectiveDate)}.
          </Alert>
        ) : null}

        {/* Valutele de top */}
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
        ) : pinned.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pinned.map((r) => (
              <RateCard key={r.code} rate={r} />
            ))}
          </div>
        ) : null}

        {/* Convertor + grafic */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data ? <Converter rates={rates} effectiveDate={data.effectiveDate} /> : <Skeleton className="h-[280px] rounded-2xl" />}
          <HistoryChart
            points={series}
            loading={seriesLoading}
            period={period}
            onPeriod={choosePeriod}
            from={rangeFrom}
            to={rangeTo}
            onFrom={(v) => {
              setPeriod("custom");
              setRangeFrom(v || startOf(30));
            }}
            onTo={(v) => {
              setPeriod("custom");
              setRangeTo(v || todayIso());
            }}
            stepDays={stepDays}
          />
        </div>

        {/* Tabloul complet */}
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Toate valutele{data ? ` · ${formatDateRo(data.effectiveDate)}` : ""}
            </h2>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Caută valuta"
                placeholder="Caută (EUR, dolar…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading && !data ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : filtered.length === 0 ? (
            <EmptyState compact title="Nicio valută găsită" />
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Cursul oficial BNM">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Cod</TableHead>
                    <TableHead scope="col">Valuta</TableHead>
                    <TableHead scope="col" className="text-right">Unități</TableHead>
                    <TableHead scope="col" className="text-right">Curs (MDL)</TableHead>
                    <TableHead scope="col" className="text-right">Variație</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const pct = pctDisplay(r.change_pct);
                    const up = pct.dir > 0;
                    const down = pct.dir < 0;
                    return (
                      <TableRow key={r.code}>
                        <TableCell className="font-medium text-foreground">
                          <span className="inline-flex items-center gap-2">
                            <CurrencyFlag code={r.code} size="sm" />
                            {r.code}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.nominal}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">
                          {formatRate(r.value)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            up && "text-emerald-700 dark:text-emerald-400",
                            down && "text-rose-700 dark:text-rose-400",
                            !up && !down && "text-muted-foreground",
                          )}
                        >
                          {pct.text}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Cursul „Curs (MDL)" e cel publicat de BNM pentru numărul de unități din coloana
            „Unități" (10 lei albanezi, 100 de yeni etc.). Calculatorul lucrează întotdeauna pe
            cursul unei singure unități.
          </p>
        </Card>
      </div>
    </BusinessShell>
  );
}

export default ParExchange;
