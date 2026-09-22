/**
 * PONTAJ-001 — „Pontajul meu": tabelul de evidență a timpului de muncă, self-service.
 *
 * Un singur ecran, fiindcă asta face omul aici o dată pe lună: își vede luna completată automat
 * din calendarul organizației, corectează zilele care au ieșit altfel, adaugă concediul pe
 * interval și tipărește. Nu există manager și nu există aprobare în etapa asta — ce scrie aici e
 * declarația angajatului.
 *
 * Luna vine deja COMPUSĂ de la server (`/api/pontaj/month`): sărbătorile legale, ziua scurtă din
 * ajun și concediile se rezolvă într-un singur motor, pe server, nu a doua oară în browser. Fără
 * regula asta, ecranul și formularul tipărit ar fi ajuns să spună lucruri diferite despre
 * aceeași zi — exact eroarea tăcută pe care modulul o previne prin construcție.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Printer,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Input,
  Label,
  Select,
  Switch,
} from "@/components/ds";
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
} from "@/lib/api/pontaj";
import { buildTimesheetCsv, printTimesheet, type PrintRow } from "@/lib/pontaj/print";

// ─── Ajutoare de afișare ──────────────────────────────────────────────────────

/** Fundalul celulei, pe simbol. Aceleași culori ca în formularul tipărit. */
const CELL_TONE: Record<string, string> = {
  P: "bg-surface text-fg",
  R: "bg-muted text-fg-muted",
  Sn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  C: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Cn: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  Cm: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  Cc: "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200",
  Cs: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  Ls: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  D: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  A: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

/** Luna curentă în fusul browserului — punctul de pornire al ecranului. */
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

// ─── Pagina ───────────────────────────────────────────────────────────────────

export function PontajPage() {
  const [month, setMonth] = useState<string>(thisMonth());
  const [data, setData] = useState<PontajMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [dayDialog, setDayDialog] = useState<PontajDay | null>(null);
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

  const onPrint = () => {
    if (!data || !printRow) return;
    const ok = printTimesheet({
      month: data.month,
      jurisdiction: data.jurisdiction,
      unitName: data.org.unitName,
      subdivisionName: data.org.subdivisionName,
      rows: [printRow],
    });
    if (!ok) setError("Browserul a blocat fereastra de tipărire. Permite ferestrele pop-up pentru acest site.");
  };

  const onExportCsv = () => {
    if (!data || !printRow) return;
    const csv = buildTimesheetCsv({
      month: data.month,
      jurisdiction: data.jurisdiction,
      unitName: data.org.unitName,
      subdivisionName: data.org.subdivisionName,
      rows: [printRow],
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pontaj-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data
    ? data.jurisdiction.summaryCols.filter((col) => (data.totals.counts[col.key] || 0) > 0)
    : [];

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
            Reîncearcă în câteva minute.
          </Alert>
        )}
        {data && !data.jurisdiction.isAdapted && (
          <Alert variant="warning">
            Pentru jurisdicția aleasă platforma nu are reguli legale (sărbători, zi scurtă în
            ajun). Zilele nelucrătoare se adaugă manual din setările organizației.
          </Alert>
        )}

        {/* Bara de lună */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Luna precedentă">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] text-center text-sm font-semibold capitalize">
              {monthLabel(month)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Luna următoare">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {month !== thisMonth() && (
              <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth())}>
                Luna curentă
              </Button>
            )}
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <Badge variant="secondary">
                {data.totals.workedDays} zile lucrate · {formatHours(data.totals.workedMinutes)} ore
              </Badge>
              {summary.map((col) => (
                <Badge key={col.key} variant="secondary">
                  {col.short}: {data.totals.counts[col.key]}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 p-8 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă luna…
          </div>
        )}

        {/* Grila lunii */}
        {!loading && data && (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-semibold">Ziua</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Situație</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Ore</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => {
                  const today = day.date === todayKey();
                  return (
                    <tr
                      key={day.date}
                      className={[
                        "border-b border-border/60 last:border-0",
                        day.isWeekend || day.isHoliday ? "bg-muted/30" : "",
                        today ? "ring-1 ring-inset ring-primary/40" : "",
                      ].join(" ")}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className="font-medium tabular-nums">{Number(day.date.slice(8))}</span>
                        <span className="ml-2 text-xs text-fg-muted">{WEEKDAY_SHORT[day.weekday - 1]}</span>
                        {today && <span className="ml-2 text-[10px] uppercase text-primary">azi</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${CELL_TONE[day.symbol] ?? "bg-muted"}`}
                        >
                          {cellText(day, data.jurisdiction.symbols)}
                        </span>
                        <span className="ml-2 text-xs text-fg-muted">
                          {day.holidayName
                            ? day.holidayName
                            : day.source === "leave"
                              ? (data.jurisdiction.symbols.find((s) => s.code === day.symbol)?.label ?? "Concediu")
                              : day.isPreHolidayReduced
                                ? `Ajun de sărbătoare — zi scurtată (${data.jurisdiction.preHolidayLegalRef})`
                                : day.source === "manual"
                                  ? (day.note ?? "Corectat de tine")
                                  : ""}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {day.symbol === "P" ? formatHours(day.minutes) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDayDialog(day)}>
                            Modifică
                          </Button>
                          {day.source === "manual" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Înapoi la valoarea calculată"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await clearPontajDay(day.date);
                                  await refresh();
                                } catch (e) {
                                  setError(errorText(e, "Nu am putut reseta ziua."));
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Concediile din luna afișată */}
        {!loading && data && data.leaves.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" /> Concedii și absențe care ating luna
            </h3>
            <ul className="space-y-2">
              {data.leaves.map((leave) => {
                const sym = data.jurisdiction.symbols.find((s) => s.code === leave.symbol);
                return (
                  <li key={leave.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <Badge variant="secondary">{sym?.display ?? leave.symbol}</Badge>{" "}
                      <span className="font-medium">{sym?.label ?? leave.symbol}</span>{" "}
                      <span className="text-fg-muted">
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

        {/* Legenda jurisdicției */}
        {data && (
          <div className="rounded-xl border border-border bg-surface p-4 text-xs text-fg-muted">
            <p className="mb-2 flex items-center gap-2 font-semibold text-fg">
              <Info className="h-3.5 w-3.5" /> Legendă — {data.jurisdiction.label}
            </p>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.jurisdiction.symbols.map((s) => (
                <span key={s.code}>
                  <b className="text-fg">{s.display}</b> — {s.label}
                </span>
              ))}
            </div>
            {data.jurisdiction.preHolidayLegalRef && (
              <p className="mt-3">
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

      {dayDialog && data && (
        <DayDialog
          day={dayDialog}
          symbols={data.jurisdiction.symbols}
          defaultMinutes={data.employee.dailyMinutes}
          onClose={() => setDayDialog(null)}
          onSaved={async (message) => {
            setDayDialog(null);
            setNotice(message);
            await refresh();
          }}
          onError={setError}
        />
      )}

      {leaveOpen && data && (
        <LeaveDialog
          month={data.month}
          symbols={data.jurisdiction.symbols.filter((s) => s.code !== "P" && s.code !== "R" && s.code !== "Sn")}
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

// ─── Dialogul unei zile ───────────────────────────────────────────────────────

function DayDialog({
  day,
  symbols,
  defaultMinutes,
  onClose,
  onSaved,
  onError,
}: {
  day: PontajDay;
  symbols: { code: string; display: string; label: string }[];
  defaultMinutes: number;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [symbol, setSymbol] = useState(day.symbol);
  const [hours, setHours] = useState(
    formatHours(day.symbol === "P" && day.minutes > 0 ? day.minutes : defaultMinutes),
  );
  const [note, setNote] = useState(day.note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const minutes = symbol === "P" ? hoursTextToMinutes(hours) : 0;
    if (symbol === "P" && (minutes === null || minutes <= 0)) {
      onError("Scrie câte ore ai lucrat în ziua asta.");
      return;
    }
    setSaving(true);
    try {
      await setPontajDay({ date: day.date, symbol, minutes: minutes ?? 0, note: note.trim() || undefined });
      await onSaved(`Ziua ${day.date} a fost actualizată.`);
    } catch (e) {
      onError(errorText(e, "Nu am putut salva ziua."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Ziua ${day.date}`}
      description="Ce scrii aici bate valoarea calculată din calendar și din concedii."
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
          <Label htmlFor="pontaj-day-symbol">Situația zilei</Label>
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
          <Label htmlFor="pontaj-day-note">Observație (opțional)</Label>
          <Input
            id="pontaj-day-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="ex. recuperare"
          />
        </div>
      </div>
    </Dialog>
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
  symbols: { code: string; display: string; label: string }[];
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
            <Input
              id="pontaj-leave-start"
              type="date"
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pontaj-leave-end">Până la (inclusiv)</Label>
            <Input
              id="pontaj-leave-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
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
      description="Se aplică zilelor completate automat, de acum înainte. Zilele deja corectate rămân cum le-ai scris."
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
          <p className="mt-1 text-xs text-fg-muted">
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
          <p className="mt-1 text-xs text-fg-muted">Apare în coloana „Funcția" din formularul tipărit.</p>
        </div>
        <div>
          <Label htmlFor="pontaj-staff">Număr matricol (opțional)</Label>
          <Input id="pontaj-staff" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} maxLength={60} />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Program redus / zi de muncă parțială</p>
            <p className="text-xs text-fg-muted">
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
