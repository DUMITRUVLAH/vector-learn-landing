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
import { BarChart3, Download, Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Card, EmptyState, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
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
  const [owner, setOwner] = useState<string>("all");
  const [data, setData] = useState<CrmReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset), [preset]);

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
    rows.push([], ["Motiv pierdere", "Număr", "Procent"]);
    for (const r of data.lostReasons) rows.push([r.reason, r.count, `${r.pct}%`]);
    downloadCsv(`rapoarte-crm-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <BusinessShell
      pageTitle="Rapoarte"
      pageDescription="Indicatorii de vânzări, pe agent și pe echipă, pentru perioada aleasă."
      actions={
        <Button variant="outline" onClick={exportCsv} disabled={!data || loading}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
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
              {(Object.keys(CRM_PERIOD_LABELS) as CrmPeriodPreset[])
                .filter((p) => p !== "custom")
                .map((p) => (
                  <option key={p} value={p}>
                    {CRM_PERIOD_LABELS[p]}
                  </option>
                ))}
            </Select>
          </div>
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
              {KPI_LABELS.map((k) => (
                <Card key={k.key} className="p-4">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {k.money ? money(data.kpis[k.key] as number) : (data.kpis[k.key] as number)}
                  </p>
                </Card>
              ))}
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Durata medie a ciclului</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {data.cycleDays ? `${data.cycleDays.toFixed(1)} zile` : "—"}
                </p>
              </Card>
            </div>

            {data.conversion.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Conversia între etape</h2>
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
                        <TableCell className="text-right tabular-nums">{r.entered}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.advanced}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.ratePct}%</TableCell>
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
                <Table aria-label="Motivele pierderii">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motiv</TableHead>
                      <TableHead className="text-right">Număr</TableHead>
                      <TableHead className="text-right">Procent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lostReasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell>{r.reason}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.pct}%</TableCell>
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
                      <TableHead className="text-right">Rată</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perProduct.map((p) => (
                      <TableRow key={p.productKey}>
                        <TableCell>{p.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.won}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.winRatePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.wonValueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}
          </>
        )}
      </div>
    </BusinessShell>
  );
}
