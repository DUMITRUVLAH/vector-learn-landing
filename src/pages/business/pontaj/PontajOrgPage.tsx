/**
 * PONTAJ-001 — setările de pontaj ale organizației: antetul formularului, semnatarii, programul
 * de lucru și zilele nelucrătoare proprii.
 *
 * Ecran separat de „Setările mele", fiindcă și răspunderea e separată: ce e aici intră pe
 * documentul pe care îl tipăresc TOȚI angajații, deci îl scrie administratorul sau managerul
 * workspace-ului, o dată, nu fiecare om pentru rândul lui.
 *
 * Serverul refuză oricum scrierea pentru alte roluri (403 `forbidden`); ascunderea de aici e
 * curtoazie, nu apărare.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Input, Label, Select } from "@/components/ds";
import { Link } from "@/router/HashRouter";
import { ApiError } from "@/lib/api";
import {
  addPontajHoliday,
  deletePontajHoliday,
  getPontajHolidays,
  getPontajSettings,
  savePontajOrg,
  type PontajHolidaysResponse,
  type PontajSettings,
} from "@/lib/api/pontaj";

const WEEKDAYS: [number, string][] = [
  [1, "Luni"], [2, "Marți"], [3, "Miercuri"], [4, "Joi"], [5, "Vineri"], [6, "Sâmbătă"], [7, "Duminică"],
];

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "forbidden") return "Doar administratorul sau managerul workspace-ului poate schimba setările organizației.";
    if (err.code === "module_disabled") return "Modulul de pontaj nu este activ pentru organizația ta.";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function PontajOrgPage() {
  const [settings, setSettings] = useState<PontajSettings | null>(null);
  const [holidays, setHolidays] = useState<PontajHolidaysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Formularul
  const [country, setCountry] = useState("MD");
  const [unitName, setUnitName] = useState("");
  const [subdivisionName, setSubdivisionName] = useState("");
  const [head, setHead] = useState("");
  const [recorder, setRecorder] = useState("");
  const [hr, setHr] = useState("");
  const [normHours, setNormHours] = useState("8");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Zi nelucrătoare proprie
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  const year = Number((holidays?.year ?? new Date().getFullYear()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getPontajSettings();
      setSettings(s);
      setCountry(s.org.country);
      // Câmpul arată DOAR ce a scris administratorul; implicitul (numele workspace-ului) stă în
      // placeholder, ca nimeni să nu creadă că a fost scris de el și să nu-l salveze din reflex.
      setUnitName(s.orgExplicitUnitName ?? "");
      setSubdivisionName(s.org.subdivisionName ?? "");
      setHead(s.org.signatoryHead ?? "");
      setRecorder(s.org.signatoryRecorder ?? "");
      setHr(s.org.signatoryHr ?? "");
      setNormHours(String(Math.round((s.org.fullDailyNormMinutes / 60) * 100) / 100).replace(".", ","));
      setWorkDays(s.org.workWeekdays);
      setHolidays(await getPontajHolidays(new Date().getFullYear()));
    } catch (e) {
      setError(errorText(e, "Nu am putut încărca setările organizației."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const hours = parseFloat(normHours.replace(",", "."));
    if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
      setError("Norma zilnică a organizației trebuie să fie între 1 și 24 de ore.");
      return;
    }
    if (workDays.length === 0) {
      setError("Alege cel puțin o zi lucrătoare — altfel luna ar ieși numai repaus.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePontajOrg({
        country,
        fullDailyNormMinutes: Math.round(hours * 60),
        workWeekdays: workDays,
        unitName: unitName.trim() || null,
        subdivisionName: subdivisionName.trim() || null,
        signatoryHead: head.trim() || null,
        signatoryRecorder: recorder.trim() || null,
        signatoryHr: hr.trim() || null,
      });
      setNotice("Setările organizației au fost salvate. Se aplică pontajului tuturor angajaților.");
      await load();
    } catch (e) {
      setError(errorText(e, "Nu am putut salva setările."));
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayDate || !holidayName.trim()) {
      setError("Scrie și data, și denumirea zilei nelucrătoare.");
      return;
    }
    setSaving(true);
    try {
      await addPontajHoliday({ date: holidayDate, name: holidayName.trim() });
      setHolidayDate("");
      setHolidayName("");
      setHolidays(await getPontajHolidays(year));
      setNotice("Ziua nelucrătoare a fost adăugată.");
    } catch (e) {
      setError(errorText(e, "Nu am putut adăuga ziua."));
    } finally {
      setSaving(false);
    }
  };

  const canEdit = settings?.canEditOrg ?? false;

  return (
    <BusinessShell
      pageTitle="Pontaj — setările organizației"
      pageDescription="Antetul formularului tipărit, semnatarii, programul de lucru și zilele nelucrătoare proprii."
      actions={
        <Link to="/business/pontaj">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Înapoi la pontaj
          </Button>
        </Link>
      }
    >
      <div className="max-w-3xl space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        {!loading && !canEdit && (
          <Alert variant="warning">
            Setările astea intră pe documentul tipărit de toți angajații, deci le poate schimba doar
            administratorul sau managerul workspace-ului. Le poți vedea, dar nu le poți salva.
          </Alert>
        )}

        {loading && (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
          </div>
        )}

        {!loading && settings && (
          <>
            {/* Antetul formularului */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Antetul formularului</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Ce se tipărește sub titlu, pe rândurile „denumirea unității" și „denumirea
                subdiviziunii unității".
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="org-unit">Denumirea unității</Label>
                  <Input
                    id="org-unit"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    maxLength={300}
                    disabled={!canEdit}
                    placeholder={settings.org.unitName ?? "ex. Asociația pentru Tehnologie și Internet"}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {settings.orgExplicitUnitName
                      ? "Lasă gol ca să revii la numele workspace-ului."
                      : `Gol = se tipărește numele workspace-ului: „${settings.org.unitName ?? "—"}". Scrie aici denumirea juridică completă, dacă diferă.`}
                  </p>
                </div>
                <div>
                  <Label htmlFor="org-subdivision">Denumirea subdiviziunii unității</Label>
                  <Input
                    id="org-subdivision"
                    value={subdivisionName}
                    onChange={(e) => setSubdivisionName(e.target.value)}
                    maxLength={300}
                    disabled={!canEdit}
                    placeholder="ex. Direcția proiecte"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Gol = rămâne linia goală din formular.</p>
                </div>
              </div>
            </section>

            {/* Semnatarii */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Persoanele care semnează</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Numele se tipăresc pe cele trei rânduri din subsol, înaintea liniei de semnătură.
                Lăsate goale, rămân liniile din formularul tipizat. Cine răspunde de evidența
                timpului de muncă e o desemnare a angajatorului — de aceea nu o completăm noi.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="org-sig-head">{settings.jurisdiction.form.signatures[0].replace(/\n/g, " ")}</Label>
                  <Input id="org-sig-head" value={head} onChange={(e) => setHead(e.target.value)} maxLength={200} disabled={!canEdit} placeholder="Nume, prenume" />
                </div>
                <div>
                  <Label htmlFor="org-sig-recorder">{settings.jurisdiction.form.signatures[1].replace(/\n/g, " ")}</Label>
                  <Input id="org-sig-recorder" value={recorder} onChange={(e) => setRecorder(e.target.value)} maxLength={200} disabled={!canEdit} placeholder="Nume, prenume" />
                </div>
                <div>
                  <Label htmlFor="org-sig-hr">{settings.jurisdiction.form.signatures[2].replace(/\n/g, " ")}</Label>
                  <Input id="org-sig-hr" value={hr} onChange={(e) => setHr(e.target.value)} maxLength={200} disabled={!canEdit} placeholder="Nume, prenume" />
                </div>
              </div>
            </section>

            {/* Jurisdicție + program */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Jurisdicție și program de lucru</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Jurisdicția decide sărbătorile legale, simbolurile și formularul tipărit.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="org-country">Jurisdicția</Label>
                  <Select id="org-country" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!canEdit}>
                    <option value="MD">Republica Moldova</option>
                    <option value="RO">România</option>
                    <option value="OTHER">Altă țară (fără reguli legale)</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="org-norm">Norma zilnică întreagă (ore)</Label>
                  <Input id="org-norm" value={normHours} onChange={(e) => setNormHours(e.target.value)} inputMode="decimal" disabled={!canEdit} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reperul față de care se decide cine are dreptul la ziua scurtă din ajun
                    {settings.jurisdiction.fullDailyNormLegalRef ? ` — ${settings.jurisdiction.fullDailyNormLegalRef}` : ""}.
                    Norma fiecărui om se setează separat, din „Setări" pe pontajul lui.
                  </p>
                </div>
                <div>
                  <Label>Zile lucrătoare</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {WEEKDAYS.map(([iso, label]) => {
                      const on = workDays.includes(iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={!canEdit}
                          aria-pressed={on}
                          onClick={() =>
                            setWorkDays((prev) =>
                              prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
                            )
                          }
                          className={
                            on
                              ? "rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                              : "rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-60"
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={save} disabled={!canEdit || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvează setările
              </Button>
            </div>

            {/* Zile nelucrătoare proprii */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarDays className="h-4 w-4" /> Zile nelucrătoare proprii
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Sărbătorile legale sunt calculate automat din lege. Aici se adaugă doar ce platforma
                nu are cum să știe — în primul rând ziua Hramului localității, pe care art. 111 din
                Codul muncii o declară nelucrătoare, dar o lasă la nivel de localitate.
              </p>

              {canEdit && (
                <div className="mb-4 flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="org-holiday-date">Data</Label>
                    <Input id="org-holiday-date" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor="org-holiday-name">Denumirea</Label>
                    <Input id="org-holiday-name" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} maxLength={200} placeholder="ex. Hramul orașului Chișinău" />
                  </div>
                  <Button variant="secondary" onClick={addHoliday} disabled={saving}>
                    <Plus className="h-4 w-4" /> Adaugă
                  </Button>
                </div>
              )}

              {holidays && holidays.company.length > 0 ? (
                <ul className="space-y-2">
                  {holidays.company.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        <span className="tabular-nums text-muted-foreground">{h.date}</span>{" "}
                        <span className="font-medium text-foreground">{h.name}</span>
                      </span>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await deletePontajHoliday(h.id);
                              setHolidays(await getPontajHolidays(year));
                            } catch (e) {
                              setError(errorText(e, "Nu am putut șterge ziua."));
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nicio zi proprie în {year}. Sărbătorile legale se aplică oricum.
                </p>
              )}

              {holidays && holidays.legal.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Sărbătorile legale din {holidays.year} ({holidays.legal.length}) — calculate din lege
                  </summary>
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {holidays.legal.map((h) => (
                      <li key={h.date}>
                        <span className="tabular-nums">{h.date}</span> — {h.name}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </>
        )}
      </div>
    </BusinessShell>
  );
}
