/**
 * CRM (Faza 6) — Rapoarte de vânzări, pe agent și pe echipă.
 *
 * Portat din crm-vector. Toată agregarea e pe server (o singură cerere), aici e
 * doar afișarea. Perioada și agentul refac cererea — nu filtrăm în memorie,
 * fiindcă raportul trebuie să spună adevărul și pentru date pe care pagina nu
 * le-a încărcat.
 *
 * Exportul e CSV cu BOM UTF-8: fără el, Excel deschide „Preț" ca „PreÈ›".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileText, Loader2, Target } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { KpiTargetsDialog } from "@/components/crm/KpiTargetsDialog";
import { Alert, Button, Card, DateField, EmptyState, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { TimelineChart, ConversionChart, LostReasonsChart } from "@/components/crm/ReportsCharts";
import { downloadCrmReportPdf } from "@/lib/crmReportPdf";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import {
  getCrmReports,
  presetRange,
  CRM_PERIOD_LABELS,
  type CrmPeriodPreset,
  type CrmReportsResponse,
} from "@/lib/api/crmReports";

/** Bani (cenți) → text. Moneda e a workspace-ului; leadurile n-au monedă proprie. */
function money(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    (cents ?? 0) / 100
  );
}

/**
 * CSV corect: valorile care conțin separatorul, ghilimele sau rânduri noi se
 * pun între ghilimele, iar ghilimelele dinăuntru se dublează. BOM-ul din față
 * e ce face Excel să citească diacriticele.
 */
function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const KPI_LABELS: { key: keyof CrmReportsResponse["kpis"]; label: string; money?: boolean }[] = [
  { key: "leadsAllocated", label: "Lead-uri alocate" },
  { key: "callsMade", label: "Apeluri efectuate" },
  { key: "successfulContacts", label: "Contacte reușite" },
  { key: "meetings", label: "Întâlniri" },
  { key: "offersSent", label: "Oferte trimise" },
  { key: "contractsSigned", label: "Contracte semnate" },
  { key: "salesValueCents", label: "Valoare vânzări", money: true },
  { key: "tasksDone", label: "Taskuri finalizate" },
  { key: "tasksOverdue", label: "Taskuri restante" },
];

export function CrmReportsPage() {
  const [preset, setPreset] = useState<CrmPeriodPreset>("thisMonth");
  /** Interval ales manual (cerința 57 — „pe perioadă selectată de utilizator"). */
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [owner, setOwner] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const { data: session } = useBusinessSession();
  const [data, setData] = useState<CrmReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    // Intervalul e semi-deschis [from, to): ziua „până la" se include mutând limita la miezul
    // nopții următoare, altfel ultima zi aleasă ar lipsi din raport.
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : null;
    const to = customTo ? new Date(`${customTo}T00:00:00`) : null;
    if (to) to.setDate(to.getDate() + 1);
    return { from, to: to ? to.toISOString() : null };
  }, [preset, customFrom, customTo]);

  /** Perioada în cuvinte — pentru antetul PDF-ului și pentru numele fișierelor. */
  const periodLabel = useMemo(() => {
    if (preset === "all") return "toate perioadele";
    if (preset !== "custom") return CRM_PERIOD_LABELS[preset].toLowerCase();
    if (!customFrom && !customTo) return "toate perioadele";
    const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" });
    if (customFrom && customTo) return `${fmt(customFrom)} – ${fmt(customTo)}`;
    return customFrom ? `din ${fmt(customFrom)}` : `până la ${fmt(customTo)}`;
  }, [preset, customFrom, customTo]);

  const ownerLabel = useMemo(() => {
    if (owner === "all") return "toată echipa";
    return data?.owners.find((o) => o.id === owner)?.name ?? "agent";
    // `data` intră înadins: numele agentului vine din răspuns, nu dintr-o listă locală.
  }, [owner, data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCrmReports({
        from: range.from,
        to: range.to,
        owner: owner === "all" ? null : owner,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca rapoartele.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, owner]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["Indicator", "Valoare"]];
    for (const k of KPI_LABELS) {
      const v = data.kpis[k.key] as number;
      rows.push([k.label, k.money ? money(v) : v]);
    }
    rows.push([], ["Agent", ...KPI_LABELS.map((k) => k.label)]);
    for (const o of data.perOwner) {
      rows.push([o.ownerName, ...KPI_LABELS.map((k) => (k.money ? money(o[k.key] as number) : (o[k.key] as number)))]);
    }
    rows.push([], ["Motiv pierdere", "Număr", "Procent", "Valoare pierdută"]);
    for (const r of data.lostReasons) rows.push([r.reason, r.count, `${r.pct}%`, money(r.valueCents)]);
    rows.push([], ["Produs", "Total", "Câștigate", "Pierdute", "Rată", "Valoare"]);
    for (const p of data.perProduct) {
      rows.push([p.product, p.total, p.won, p.lost, `${p.winRatePct}%`, money(p.valueCents)]);
    }
    rows.push([], ["Din", "În", "Au ajuns", "Au avansat", "Rată"]);
    for (const r of data.conversion) {
      rows.push([r.fromLabel, r.toLabel, r.reached, r.advanced, `${r.conversionPct}%`]);
    }
    downloadCsv(`rapoarte-crm-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  /**
   * PDF-ul poartă aceleași cifre ca ecranul, plus perioada și agentul în antet. Cerința 58 cere
   * explicit „Excel și PDF" — CSV-ul de mai sus acoperă Excel (separator `;` + BOM, cum îl vrea
   * Excel-ul în română).
   */
  async function exportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      await downloadCrmReportPdf(
        {
          orgName: session?.tenant.name ?? "Workspace",
          periodLabel,
          ownerLabel,
          kpis: KPI_LABELS.map((k) => ({
            label: k.label,
            value: k.money ? money(data.kpis[k.key] as number) : String(data.kpis[k.key]),
          })),
          cycleLabel: data.cycleDays ? `${data.cycleDays.toFixed(1)} zile` : "—",
          tables: [
            {
              title: "Conversia între etape",
              head: ["Din", "În", "Au ajuns", "Au avansat", "Rată"],
              rows: data.conversion.map((r) => [r.fromLabel, r.toLabel, r.reached, r.advanced, `${r.conversionPct}%`]),
              numericFrom: 2,
            },
            {
              title: "Rezultate pe agent",
              head: ["Agent", "Leaduri", "Apeluri", "Contracte", "Valoare"],
              rows: data.perOwner.map((o) => [
                o.ownerName,
                o.leadsAllocated,
                o.callsMade,
                o.contractsSigned,
                money(o.salesValueCents),
              ]),
            },
            {
              title: "De ce pierdem",
              head: ["Motiv", "Număr", "Procent", "Valoare pierdută"],
              rows: data.lostReasons.map((r) => [r.reason, r.count, `${r.pct}%`, money(r.valueCents)]),
            },
            {
              title: "Rezultate pe produs",
              head: ["Produs", "Total", "Câștigate", "Pierdute", "Rată", "Valoare"],
              rows: data.perProduct.map((p) => [p.product, p.total, p.won, p.lost, `${p.winRatePct}%`, money(p.valueCents)]),
            },
          ],
        },
        `raport-crm-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <BusinessShell
      pageTitle="Rapoarte"
      pageDescription="Indicatorii de vânzări, pe agent și pe echipă, pentru perioada aleasă."
      actions={
        <>
          <Button variant="outline" onClick={() => setTargetsOpen(true)}>
            <Target className="h-4 w-4" aria-hidden="true" />
            Norme
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data || loading}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => void exportPdf()} disabled={!data || loading || exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
            Export PDF
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="rap-perioada">Perioadă</Label>
            <Select
              id="rap-perioada"
              value={preset}
              onChange={(e) => setPreset(e.target.value as CrmPeriodPreset)}
            >
              {(Object.keys(CRM_PERIOD_LABELS) as CrmPeriodPreset[]).map((p) => (
                <option key={p} value={p}>
                  {CRM_PERIOD_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>

          {/* Cerința 57: perioada aleasă de utilizator, nu doar preseturile. */}
          {preset === "custom" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="rap-de-la">De la</Label>
                <DateField id="rap-de-la" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rap-pana-la">Până la</Label>
                <DateField id="rap-pana-la" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="rap-agent">Agent</Label>
            <Select id="rap-agent" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">Toată echipa</option>
              {(data?.owners ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă rapoartele" />
          </div>
        ) : !data || data.schemaLag ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nu sunt date de raportat"
            description="Rapoartele apar după primele lead-uri și activități din perioada aleasă."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {KPI_LABELS.map((k) => {
                // Gradul de realizare apare DOAR când există o normă pentru indicatorul ăsta și
                // perioada are capete (o țintă săptămânală n-are înțeles peste „tot timpul").
                const att = data.attainment?.[k.key as string];
                return (
                  <Card key={k.key} className="p-4">
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      {k.money ? money(data.kpis[k.key] as number) : (data.kpis[k.key] as number)}
                    </p>
                    {att && (
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        din {k.money ? money(att.target) : att.target} ·{" "}
                        <span
                          className={
                            att.pct >= 100
                              ? "font-semibold text-emerald-600"
                              : att.pct >= 70
                                ? "font-semibold text-amber-600"
                                : "font-semibold text-destructive"
                          }
                        >
                          {att.pct}%
                        </span>
                      </p>
                    )}
                  </Card>
                );
              })}
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Durata medie a ciclului</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {data.cycleDays ? `${data.cycleDays.toFixed(1)} zile` : "—"}
                </p>
              </Card>
            </div>

            {/* Contactabilitatea (CC-6). Apare doar dacă s-a sunat: pe un workspace care nu
                lucrează la telefon, o secțiune goală ar fi doar zgomot. */}
            {data.callFunnel && data.callFunnel.dialed > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Contactabilitate</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Apeluri</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{data.callFunnel.dialed}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">A răspuns cineva</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{data.callFunnel.connected}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Decidenți atinși</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{data.callFunnel.decisionMakers}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Apeluri / decident</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      {data.callFunnel.callsPerDecisionMaker ?? "—"}
                    </p>
                  </Card>
                </div>

                {data.callFunnel.byOutcome.length > 0 && (
                  <Card className="p-4">
                    <Table aria-label="Rezultatele apelurilor">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rezultat</TableHead>
                          <TableHead className="text-right">Apeluri</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.callFunnel.byOutcome.map((r) => (
                          <TableRow key={r.outcome}>
                            <TableCell>{r.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.pct}%</TableCell>
                          </TableRow>
                        ))}
                        {data.callFunnel.unknown > 0 && (
                          <TableRow>
                            {/* Spus pe față: apelurile vechi n-aveau rezultat notat. Împărțite
                                tăcut peste celelalte, ar fi înrăutățit fals statistica. */}
                            <TableCell className="text-muted-foreground">Fără rezultat notat</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {data.callFunnel.unknown}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </section>
            )}

            {/* Evoluția perioadei — imaginea care lipsea. Un tabel îți spune cât ai vândut;
                graficul îți spune dacă urci sau cobori. */}
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Evoluția perioadei</h2>
              <Card className="p-3">
                <TimelineChart data={data.timeline ?? []} size={data.bucketSize ?? "day"} />
              </Card>
            </section>

            {data.conversion.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Conversia între etape</h2>
                <Card className="p-3">
                  <ConversionChart rows={data.conversion} />
                </Card>
                <Table aria-label="Conversia între etape">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Din</TableHead>
                      <TableHead>În</TableHead>
                      <TableHead className="text-right">Au ajuns</TableHead>
                      <TableHead className="text-right">Au avansat</TableHead>
                      <TableHead className="text-right">Rată</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.conversion.map((r) => (
                      <TableRow key={`${r.fromKey}-${r.toKey}`}>
                        <TableCell>{r.fromLabel}</TableCell>
                        <TableCell className="text-muted-foreground">{r.toLabel}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.reached}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.advanced}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.conversionPct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {data.perOwner.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Pe agent</h2>
                <Table aria-label="Rezultate pe agent">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Lead-uri</TableHead>
                      <TableHead className="text-right">Apeluri</TableHead>
                      <TableHead className="text-right">Contracte</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perOwner.map((o) => (
                      <TableRow key={o.ownerKey}>
                        <TableCell className="font-medium">{o.ownerName}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.leadsAllocated}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.callsMade}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.contractsSigned}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(o.salesValueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {data.lostReasons.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">De ce pierdem</h2>
                <Card className="p-3">
                  <LostReasonsChart rows={data.lostReasons} />
                </Card>
                <Table aria-label="Motivele pierderii">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motiv</TableHead>
                      <TableHead className="text-right">Număr</TableHead>
                      <TableHead className="text-right">Procent</TableHead>
                      <TableHead className="text-right">Valoare pierdută</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lostReasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell>{r.reason}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.pct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.valueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {data.perProduct.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Pe produs</h2>
                <Table aria-label="Rezultate pe produs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produs</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Câștigate</TableHead>
                      <TableHead className="text-right">Pierdute</TableHead>
                      <TableHead className="text-right">Rată</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perProduct.map((p) => (
                      <TableRow key={p.product}>
                        <TableCell>{p.product}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.won}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.lost}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.winRatePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.valueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}
          </>
        )}
      </div>

      <KpiTargetsDialog
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        owners={data?.owners ?? []}
        onSaved={() => void load()}
      />
    </BusinessShell>
  );
}
