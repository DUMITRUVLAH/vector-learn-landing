/**
 * PONTAJ-001 — „Pontajul meu": grila de evidență a timpului de muncă, self-service.
 *
 * Forma e aceeași cu a pontajului din HR 365, intenționat: zilele lunii pe ORIZONTALĂ, un rând
 * per om, coloanele de total la dreapta, iar click pe o celulă deschide un popover cu simbolul,
 * orele și motivul corecției. Cine a folosit tabelul acolo nu are ce reînvăța aici, iar ecranul
 * seamănă cu hârtia care iese la tipărire — aceleași coloane, aceeași ordine, aceleași simboluri.
 *
 * Diferența față de HR 365 e domeniul, nu forma: aici e un singur rând, al tău. Nu există
 * manager, aprobare, departamente sau căutare de angajat — etapa asta e strict self-service, iar
 * grila e construită ca lista de rânduri, ca ziua în care apare vizualizarea de echipă să adauge
 * rânduri, nu să rescrie ecranul.
 *
 * Luna vine deja COMPUSĂ de la server (`/api/pontaj/month`): sărbătorile legale, ziua scurtă din
 * ajun și concediile se rezolvă într-un singur motor, pe server. Fără regula asta, ecranul și
 * formularul tipărit ar fi ajuns să spună lucruri diferite despre aceeași zi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Dialog, Input, Label, Select, Switch } from "@/components/ds";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  addPontajLeave,
  cellText,
  clearPontajDay,
  deletePontajLeave,
  formatHours,
  getPontajMonth,
  monthLabel,
  savePontajProfile,
  setPontajDay,
  shiftMonth,
  WEEKDAY_SHORT,
  type PontajDay,
  type PontajMonth,
  type PontajSymbol,
} from "@/lib/api/pontaj";
import { buildTimesheetCsv, printTimesheet, type PrintRow } from "@/lib/pontaj/print";

// ─── Ajutoare ─────────────────────────────────────────────────────────────────

/** Culoarea celulei, pe simbol — aceeași convenție ca în formularul tipărit. */
const CELL_TONE: Record<string, string> = {
  P: "",
  R: "bg-muted text-muted-foreground",
  Sn: "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  C: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  Cn: "bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
  Cm: "bg-orange-50 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200",
  Cc: "bg-pink-50 text-pink-900 dark:bg-pink-950/60 dark:text-pink-200",
  Cs: "bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
  Ls: "bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:text-teal-200",
  D: "bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  A: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

const MONTH_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];

function dayLabel(date: string): string {
  return `${Number(date.slice(8))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** „8" / „7,5" → minute. Acceptă și virgula, fiindcă așa scrie lumea în română. */
function hoursTextToMinutes(text: string): number | null {
  const n = parseFloat((text || "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 60);
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "module_disabled") return "Modulul de pontaj nu este activ pentru organizația ta.";
    if (err.code === "hours_too_large") return "Durata zilei depășește maximul admis.";
    if (err.code === "hours_required") return "Pentru o zi lucrată trebuie să indici durata.";
    if (err.code === "end_before_start") return "Data de sfârșit este înaintea celei de început.";
    if (err.code === "range_too_long") return "Intervalul este prea lung — verifică datele.";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

interface CellAnchor {
  day: PontajDay;
  rect: { left: number; top: number; bottom: number };
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export function PontajPage() {
  const [month, setMonth] = useState<string>(thisMonth());
  const [data, setData] = useState<PontajMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cell, setCell] = useState<CellAnchor | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPontajMonth(target));
    } catch (e) {
      setError(errorText(e, "Nu am putut încărca luna."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  const refresh = useCallback(async () => {
    try {
      setData(await getPontajMonth(month));
    } catch (e) {
      setError(errorText(e, "Nu am putut reîncărca luna."));
    }
  }, [month]);

  const printRow = useMemo<PrintRow | null>(() => {
    if (!data) return null;
    return {
      name: data.employee.name,
      jobTitle: data.employee.jobTitle,
      days: data.days,
      counts: data.totals.counts,
      workedMinutes: data.totals.workedMinutes,
    };
  }, [data]);

  const printInput = data && printRow
    ? {
        month: data.month,
        jurisdiction: data.jurisdiction,
        unitName: data.org.unitName,
        subdivisionName: data.org.subdivisionName,
        rows: [printRow],
      }
    : null;

  const onPrint = () => {
    if (!printInput) return;
    if (!printTimesheet(printInput)) {
      setError("Browserul a blocat fereastra de tipărire. Permite ferestrele pop-up pentru acest site.");
    }
  };

  const onExportCsv = () => {
    if (!printInput || !data) return;
    const url = URL.createObjectURL(
      new Blob([buildTimesheetCsv(printInput)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pontaj-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <BusinessShell
      pageTitle="Pontajul meu"
      pageDescription={
        data
          ? `${data.employee.name} · normă ${formatHours(data.employee.dailyMinutes)} ore/zi · ${data.jurisdiction.label}`
          : "Evidența timpului de muncă"
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" /> Setări
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setLeaveOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> Adaugă concediu
          </Button>
          <Button variant="secondary" size="sm" onClick={onExportCsv} disabled={!data}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={onPrint} disabled={!data}>
            <Printer className="h-4 w-4" /> Tipărește
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        {data?.schemaLag && (
          <Alert variant="warning">
            Luna e afișată doar din calendar: corecțiile și concediile nu au putut fi citite.
          </Alert>
        )}
        {data && !data.jurisdiction.isAdapted && (
          <Alert variant="warning">
            Pentru jurisdicția aleasă platforma nu are reguli legale (sărbători, zi scurtă în ajun).
            Zilele nelucrătoare se adaugă manual din setările organizației.
          </Alert>
        )}

        {/* Bara de lună */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Luna precedentă">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
            <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Luna următoare">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {month !== thisMonth() && (
              <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth())}>Luna curentă</Button>
            )}
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                {data.totals.workedDays} zile lucrate · {formatHours(data.totals.workedMinutes)} ore
              </Badge>
              {data.jurisdiction.summaryCols
                .filter((col) => (data.totals.counts[col.key] || 0) > 0 && col.key !== "zl")
                .map((col) => (
                  <Badge key={col.key} variant="secondary">
                    {col.short}: {data.totals.counts[col.key]}
                  </Badge>
                ))}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă luna…
          </div>
        )}

        {/* GRILA — zilele pe orizontală, exact ca formularul tipărit */}
        {!loading && data && (
          <div className="rounded-xl border border-border bg-card">
            <div className="relative max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky top-0 z-20 min-w-[32px] border-r border-border bg-muted p-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                      Nr.
                    </th>
                    <th className="sticky left-0 top-0 z-30 min-w-[140px] border-r border-border bg-muted p-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Numele, prenumele
                    </th>
                    <th className="sticky top-0 z-20 min-w-[92px] border-r border-border bg-muted p-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">
                      Funcția
                    </th>
                    {data.days.map((d) => (
                      <th
                        key={d.date}
                        title={d.holidayName ?? (d.isPreHolidayEve ? "Ajun de sărbătoare — zi scurtată" : undefined)}
                        className={cn(
                          "sticky top-0 z-20 min-w-[26px] border-l border-border/40 bg-card p-0.5 text-center text-[10px] font-medium",
                          d.isWeekend && "bg-muted",
                          d.isHoliday && "bg-amber-50 dark:bg-amber-950/50",
                          d.isPreHolidayEve && "bg-amber-50/60 dark:bg-amber-950/30",
                        )}
                      >
                        <div className="font-semibold text-foreground">{Number(d.date.slice(8))}</div>
                        <div className="text-[9px] font-normal text-muted-foreground">{WEEKDAY_SHORT[d.weekday - 1]}</div>
                      </th>
                    ))}
                    {data.jurisdiction.summaryCols.map((col) => (
                      <th
                        key={col.key}
                        className="sticky top-0 z-20 min-w-[24px] border-l border-border bg-primary/5 p-0.5 text-center text-[9px] font-semibold text-primary"
                      >
                        {col.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="border-r border-border p-1 text-center text-xs text-muted-foreground">1</td>
                    <td className="sticky left-0 z-10 border-r border-border bg-card p-2 text-xs font-medium text-foreground">
                      {data.employee.name}
                    </td>
                    <td className="border-r border-border p-1 text-[11px] text-muted-foreground">
                      {data.employee.jobTitle || "—"}
                    </td>
                    {data.days.map((d) => {
                      const today = d.date === todayKey();
                      return (
                        <td
                          key={d.date}
                          className={cn(
                            "relative border-l border-border/40 p-0 text-center align-middle",
                            CELL_TONE[d.symbol] ?? "",
                            today && "ring-1 ring-inset ring-primary/50",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={`${dayLabel(d.date)} — ${cellText(d, data.jurisdiction.symbols)}`}
                            onClick={(e) => {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setCell({ day: d, rect: { left: r.left, top: r.top, bottom: r.bottom } });
                            }}
                            className={cn(
                              "h-8 w-full cursor-pointer text-[11px] leading-none transition-colors hover:bg-primary/10",
                              // Corecția manuală se vede dintr-o privire, ca pe hârtie.
                              d.source === "manual" && "outline outline-1 -outline-offset-1 outline-indigo-500",
                            )}
                          >
                            {cellText(d, data.jurisdiction.symbols)}
                            {d.source === "manual" && d.note && (
                              <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-indigo-500" aria-hidden />
                            )}
                          </button>
                        </td>
                      );
                    })}
                    {data.jurisdiction.summaryCols.map((col) => (
                      <td
                        key={col.key}
                        className="border-l border-border bg-primary/5 p-1 text-center text-[11px] tabular-nums text-foreground"
                      >
                        {data.totals.counts[col.key] || 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Concediile care ating luna */}
        {!loading && data && data.leaves.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Concedii și absențe care ating luna</h3>
            <ul className="space-y-2">
              {data.leaves.map((leave) => {
                const sym = data.jurisdiction.symbols.find((s) => s.code === leave.symbol);
                return (
                  <li key={leave.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <Badge variant="secondary">{sym?.display ?? leave.symbol}</Badge>{" "}
                      <span className="font-medium">{sym?.label ?? leave.symbol}</span>{" "}
                      <span className="text-muted-foreground">
                        {leave.startDate} → {leave.endDate}
                        {leave.note ? ` · ${leave.note}` : ""}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await deletePontajLeave(leave.id);
                          await refresh();
                        } catch (e) {
                          setError(errorText(e, "Nu am putut șterge concediul."));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Legenda — aceleași simboluri care ies pe hârtie */}
        {data && (
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">
              Legendă — {data.jurisdiction.label}
              {data.jurisdiction.code === "MD" && " (simbolurile din Anexa la Convenția colectivă nr. 17/2020)"}
            </p>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.jurisdiction.symbols.map((s) => (
                <span key={s.code}>
                  <b className="text-foreground">{s.display}</b> — {s.label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-indigo-600 dark:text-indigo-400">
              Celulă cu contur violet = corecție manuală, făcută de tine peste valoarea calculată.
            </p>
            {data.jurisdiction.preHolidayLegalRef && (
              <p className="mt-1">
                Ziua din ajunul unei sărbători nelucrătoare se scurtează cu{" "}
                {formatHours(data.jurisdiction.preHolidayReductionMinutes)} oră ·{" "}
                {data.jurisdiction.preHolidayLegalRef}.
              </p>
            )}
            {data.jurisdiction.annualLeaveLegalRef && (
              <p>
                Concediul anual de odihnă: {data.jurisdiction.annualLeaveDays}{" "}
                {data.jurisdiction.annualLeaveUnit === "calendar" ? "zile calendaristice" : "zile lucrătoare"} ·{" "}
                {data.jurisdiction.annualLeaveLegalRef}.
              </p>
            )}
          </div>
        )}
      </div>

      {cell && data && (
        <CellPopover
          anchor={cell}
          employeeName={data.employee.name}
          symbols={data.jurisdiction.symbols}
          defaultMinutes={data.employee.dailyMinutes}
          onClose={() => setCell(null)}
          onSaved={async (message) => {
            setCell(null);
            setNotice(message);
            await refresh();
          }}
          onError={setError}
        />
      )}

      {leaveOpen && data && (
        <LeaveDialog
          month={data.month}
          symbols={data.jurisdiction.symbols.filter((s) => !["P", "R", "Sn"].includes(s.code))}
          onClose={() => setLeaveOpen(false)}
          onSaved={async (message) => {
            setLeaveOpen(false);
            setNotice(message);
            await refresh();
          }}
          onError={setError}
        />
      )}

      {settingsOpen && data && (
        <ProfileDialog
          employee={data.employee}
          maxMinutes={data.jurisdiction.maxDailyMinutes}
          normLegalRef={data.jurisdiction.fullDailyNormLegalRef}
          onClose={() => setSettingsOpen(false)}
          onSaved={async (message) => {
            setSettingsOpen(false);
            setNotice(message);
            await refresh();
          }}
          onError={setError}
        />
      )}
    </BusinessShell>
  );
}

// ─── Popover-ul unei celule ───────────────────────────────────────────────────

/**
 * Editarea stă lângă celula pe care o schimbi, nu într-un dialog centrat: într-o grilă de 31 de
 * coloane, un modal care acoperă tabelul rupe legătura dintre „ce apăs" și „ce se schimbă".
 */
function CellPopover({
  anchor,
  employeeName,
  symbols,
  defaultMinutes,
  onClose,
  onSaved,
  onError,
}: {
  anchor: CellAnchor;
  employeeName: string;
  symbols: PontajSymbol[];
  defaultMinutes: number;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const day = anchor.day;
  const [symbol, setSymbol] = useState(day.symbol);
  const [hours, setHours] = useState(
    formatHours(day.symbol === "P" && day.minutes > 0 ? day.minutes : defaultMinutes),
  );
  const [note, setNote] = useState(day.note ?? "");
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Escape și clicul în afară închid popoverul — altfel, într-o grilă, rămâne agățat peste zile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const WIDTH = 260;
  const left = Math.min(Math.max(8, anchor.rect.left - WIDTH / 2), window.innerWidth - WIDTH - 8);
  const openUp = anchor.rect.bottom + 300 > window.innerHeight;
  const style = openUp
    ? { left, bottom: window.innerHeight - anchor.rect.top + 6 }
    : { left, top: anchor.rect.bottom + 6 };

  const save = async () => {
    const minutes = symbol === "P" ? hoursTextToMinutes(hours) : 0;
    if (symbol === "P" && (minutes === null || minutes <= 0)) {
      onError("Scrie câte ore ai lucrat în ziua asta.");
      return;
    }
    setSaving(true);
    try {
      await setPontajDay({ date: day.date, symbol, minutes: minutes ?? 0, note: note.trim() || undefined });
      await onSaved(`Ziua ${dayLabel(day.date)} a fost actualizată.`);
    } catch (e) {
      onError(errorText(e, "Nu am putut salva ziua."));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await clearPontajDay(day.date);
      await onSaved(`Ziua ${dayLabel(day.date)} a revenit la valoarea calculată.`);
    } catch (e) {
      onError(errorText(e, "Nu am putut reseta ziua."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Ziua ${dayLabel(day.date)}`}
      style={{ position: "fixed", width: WIDTH, zIndex: 60, ...style }}
      className="rounded-xl border border-border bg-popover p-3 shadow-lg"
    >
      <p className="mb-2 text-sm font-semibold text-foreground">
        {employeeName} · {dayLabel(day.date)}
      </p>
      {(day.isHoliday || day.isPreHolidayEve || day.source === "leave") && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {day.holidayName
            ? day.holidayName
            : day.source === "leave"
              ? (symbols.find((s) => s.code === day.symbol)?.label ?? "Concediu")
              : "Ajun de sărbătoare — ziua se scurtează"}
        </p>
      )}
      <div className="space-y-2">
        <div>
          <Label htmlFor="pontaj-day-symbol">Simbol</Label>
          <Select id="pontaj-day-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => (
              <option key={s.code} value={s.code}>
                {s.display} — {s.label}
              </option>
            ))}
          </Select>
        </div>
        {symbol === "P" && (
          <div>
            <Label htmlFor="pontaj-day-hours">Ore lucrate</Label>
            <Input
              id="pontaj-day-hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              inputMode="decimal"
              placeholder="8"
            />
          </div>
        )}
        <div>
          <Label htmlFor="pontaj-day-note">Notă (motiv corecție)</Label>
          <Input
            id="pontaj-day-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="ex. certificat medical nr. 12"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {day.source === "manual" ? (
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving} title="Înapoi la valoarea calculată">
            <RotateCcw className="h-3.5 w-3.5" /> Resetează
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Anulează</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvează
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Dialogul de concediu pe interval ─────────────────────────────────────────

function LeaveDialog({
  month,
  symbols,
  onClose,
  onSaved,
  onError,
}: {
  month: string;
  symbols: PontajSymbol[];
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const firstOfMonth = `${month}-01`;
  const [symbol, setSymbol] = useState(symbols[0]?.code ?? "C");
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(firstOfMonth);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Data de sfârșit urmează data de început cât timp e în urma ei: nimeni nu vrea să scrie un
  // interval care se termină înainte să înceapă, iar validarea de pe server ar fi doar un „nu".
  const onStartChange = (value: string) => {
    setStartDate(value);
    if (endDate < value) setEndDate(value);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await addPontajLeave({ symbol, startDate, endDate, note: note.trim() || undefined });
      await onSaved(
        `Înregistrat: ${res.calendarDays} zile calendaristice, dintre care ${res.workingDays} lucrătoare.`,
      );
    } catch (e) {
      onError(errorText(e, "Nu am putut înregistra concediul."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Adaugă concediu sau absență"
      description="Se înregistrează pe tot intervalul deodată — o singură intrare, oricâte zile."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Înregistrează
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="pontaj-leave-symbol">Tipul</Label>
          <Select id="pontaj-leave-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => (
              <option key={s.code} value={s.code}>
                {s.display} — {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pontaj-leave-start">De la</Label>
            <Input id="pontaj-leave-start" type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pontaj-leave-end">Până la (inclusiv)</Label>
            <Input id="pontaj-leave-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="pontaj-leave-note">Observație (opțional)</Label>
          <Input
            id="pontaj-leave-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="ex. cerere nr. 12 din 03.09"
          />
        </div>
      </div>
    </Dialog>
  );
}

// ─── Dialogul de setări proprii ───────────────────────────────────────────────

function ProfileDialog({
  employee,
  maxMinutes,
  normLegalRef,
  onClose,
  onSaved,
  onError,
}: {
  employee: PontajMonth["employee"];
  maxMinutes: number;
  normLegalRef: string;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [hours, setHours] = useState(formatHours(employee.dailyMinutes));
  const [jobTitle, setJobTitle] = useState(employee.jobTitle ?? "");
  const [staffCode, setStaffCode] = useState(employee.staffCode ?? "");
  const [reduced, setReduced] = useState(employee.reducedSchedule);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const minutes = hoursTextToMinutes(hours);
    if (minutes === null || minutes < 30 || minutes > maxMinutes) {
      onError(`Norma zilnică trebuie să fie între 0,5 și ${formatHours(maxMinutes)} ore.`);
      return;
    }
    setSaving(true);
    try {
      await savePontajProfile({
        dailyMinutes: minutes,
        jobTitle: jobTitle.trim() || null,
        staffCode: staffCode.trim() || null,
        reducedSchedule: reduced,
      });
      await onSaved("Setările tale au fost salvate.");
    } catch (e) {
      onError(errorText(e, "Nu am putut salva setările."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Setările mele de pontaj"
      description="Se aplică zilelor completate automat. Zilele deja corectate rămân cum le-ai scris."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvează
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="pontaj-norm">Ore pe zi</Label>
          <Input id="pontaj-norm" value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
          <p className="mt-1 text-xs text-muted-foreground">
            Implicit 8 ore{normLegalRef ? ` — norma întreagă din ${normLegalRef}` : ""}.
          </p>
        </div>
        <div>
          <Label htmlFor="pontaj-job">Funcția</Label>
          <Input
            id="pontaj-job"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            maxLength={300}
            placeholder="ex. contabil-șef"
          />
          <p className="mt-1 text-xs text-muted-foreground">Apare în coloana „Funcția" din formularul tipărit.</p>
        </div>
        <div>
          <Label htmlFor="pontaj-staff">Număr matricol (opțional)</Label>
          <Input id="pontaj-staff" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} maxLength={60} />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Program redus / zi de muncă parțială</p>
            <p className="text-xs text-muted-foreground">
              Dacă e pornit, ziua din ajunul sărbătorii nu se mai scurtează — categoriile de la
              art. 96 și 97 sunt scutite prin art. 102 din Codul muncii.
            </p>
          </div>
          <Switch checked={reduced} onChange={setReduced} aria-label="Program redus sau zi de muncă parțială" />
        </div>
      </div>
    </Dialog>
  );
}
