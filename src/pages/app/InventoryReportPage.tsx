/**
 * INVENTORY-004: Raport inventar complet
 * Ruta: /app/fin/inventory/report
 *
 * Secțiuni:
 *   1. Situație stoc la dată — qty + valoare per articol + TOTAL
 *   2. Mișcări în perioadă  — intrări vs ieșiri pivot per articol
 *   3. Sub stoc minim       — articole cu qty < min_qty_alert
 *
 * Export CSV client-side pentru fiecare secțiune.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  FileDown,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  CheckCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getStockSnapshot,
  getPeriodReport,
  type StockSnapshot,
  type PeriodReport,
  type StockSnapshotRow,
} from "@/lib/api/finInventory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function lastOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function snapshotToCSV(snap: StockSnapshot): string {
  const header = "Articol,SKU,Categorie,Stoc (qty),Cost mediu (MDL/unit),Valoare totala (MDL)\n";
  const rows = snap.rows
    .map(
      (r) =>
        `"${r.name}","${r.sku ?? ""}","${r.category ?? ""}",${r.qty},${(r.avgCostCents / 100).toFixed(2)},${(r.valueCents / 100).toFixed(2)}`
    )
    .join("\n");
  const total = `"TOTAL","","","","",${ (snap.totalValueCents / 100).toFixed(2)}`;
  return header + rows + "\n" + total;
}

function periodToCSV(rep: PeriodReport): string {
  const header =
    "Articol,SKU,Categorie,Intrari (qty),Valoare intrari (MDL),Iesiri (qty),Valoare iesiri (MDL),Net qty\n";
  const rows = rep.rows
    .map(
      (r) =>
        `"${r.name}","${r.sku ?? ""}","${r.category ?? ""}",${r.inQty},${(r.inValueCents / 100).toFixed(2)},${r.outQty},${(r.outValueCents / 100).toFixed(2)},${r.netQty}`
    )
    .join("\n");
  return header + rows;
}

// ─── Tipuri tab ───────────────────────────────────────────────────────────────

type ActiveTab = "snapshot" | "period" | "below";

// ─── Componentă principală ────────────────────────────────────────────────────

export function InventoryReportPage(): JSX.Element {
  const { status } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("snapshot");

  // Situație stoc
  const [snapshotDate, setSnapshotDate] = useState(todayStr());
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  // Mișcări perioadă
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth());
  const [periodTo, setPeriodTo] = useState(lastOfMonth());
  const [period, setPeriod] = useState<PeriodReport | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  // ─── Fetch snapshot ─────────────────────────────────────────────────────────

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const data = await getStockSnapshot(snapshotDate);
      setSnapshot(data);
    } catch {
      setSnapshotError("Nu am putut încărca situația stocului. Încearcă din nou.");
    } finally {
      setSnapshotLoading(false);
    }
  }, [snapshotDate]);

  // ─── Fetch period ────────────────────────────────────────────────────────────

  const loadPeriod = useCallback(async () => {
    setPeriodLoading(true);
    setPeriodError(null);
    try {
      const data = await getPeriodReport(periodFrom, periodTo);
      setPeriod(data);
    } catch {
      setPeriodError("Nu am putut încărca raportul de mișcări. Încearcă din nou.");
    } finally {
      setPeriodLoading(false);
    }
  }, [periodFrom, periodTo]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  // ─── Articole sub minim (derivate din snapshot) ───────────────────────────────

  const belowMin: StockSnapshotRow[] = (snapshot?.rows ?? []).filter(
    (r) => r.minQtyAlert > 0 && r.qty < r.minQtyAlert
  );

  // ─── Dacă se încarcă sesiunea ────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <AppShell pageTitle="Raport inventar">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  // ─── Tab-uri ─────────────────────────────────────────────────────────────────

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "snapshot", label: "Situație stoc" },
    { key: "period", label: "Mișcări perioadă" },
    { key: "below", label: `Sub minim${belowMin.length > 0 ? ` (${belowMin.length})` : ""}` },
  ];

  return (
    <AppShell pageTitle="Raport inventar">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <a
            href="#/app/fin/inventory"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label="Înapoi la inventar"
          >
            <ArrowLeft className="h-4 w-4" />
            Inventar
          </a>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-foreground">Raport inventar</h1>
          </div>
        </div>

        {/* Tab-uri */}
        <div
          role="tablist"
          aria-label="Secțiuni raport inventar"
          className="flex gap-1 border-b border-border"
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              aria-controls={`panel-${key}`}
              id={`tab-${key}`}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeTab === key
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab 1: Situație stoc ─────────────────────────────────────────────── */}
        {activeTab === "snapshot" && (
          <section
            id="panel-snapshot"
            role="tabpanel"
            aria-labelledby="tab-snapshot"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="snapshot-date"
                  className="text-sm font-medium text-foreground"
                >
                  La data de
                </label>
                <input
                  id="snapshot-date"
                  type="date"
                  value={snapshotDate}
                  max={todayStr()}
                  onChange={(e) => setSnapshotDate(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                onClick={() => void loadSnapshot()}
                disabled={snapshotLoading}
                className="h-9 inline-flex items-center gap-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {snapshotLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Generează
              </button>
              {snapshot && (
                <button
                  onClick={() =>
                    downloadCSV(
                      snapshotToCSV(snapshot),
                      `inventar-situatie-${snapshotDate}.csv`
                    )
                  }
                  className="h-9 inline-flex items-center gap-2 px-4 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Exportă situație stoc CSV"
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Exportă CSV
                </button>
              )}
            </div>

            {snapshotError && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {snapshotError}
              </div>
            )}

            {snapshotLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
              </div>
            )}

            {!snapshotLoading && snapshot && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Articol</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Stoc (qty)</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Cost mediu</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Valoare totală</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Niciun articol activ găsit.
                        </td>
                      </tr>
                    ) : (
                      snapshot.rows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-foreground font-medium">{row.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.sku ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{row.category ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {row.qty} {row.unit}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {formatMDL(row.avgCostCents)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                            {formatMDL(row.valueCents)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {snapshot.rows.length > 0 && (
                    <tfoot className="bg-muted/70 font-semibold border-t-2 border-border">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-foreground">TOTAL</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatMDL(snapshot.totalValueCents)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Tab 2: Mișcări perioadă ───────────────────────────────────────────── */}
        {activeTab === "period" && (
          <section
            id="panel-period"
            role="tabpanel"
            aria-labelledby="tab-period"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="period-from" className="text-sm font-medium text-foreground">
                  De la
                </label>
                <input
                  id="period-from"
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="period-to" className="text-sm font-medium text-foreground">
                  Până la
                </label>
                <input
                  id="period-to"
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                onClick={() => void loadPeriod()}
                disabled={periodLoading}
                className="h-9 inline-flex items-center gap-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {periodLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Generează
              </button>
              {period && period.rows.length > 0 && (
                <button
                  onClick={() =>
                    downloadCSV(
                      periodToCSV(period),
                      `inventar-miscari-${periodFrom}-${periodTo}.csv`
                    )
                  }
                  className="h-9 inline-flex items-center gap-2 px-4 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Exportă mișcări perioadă CSV"
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Exportă CSV
                </button>
              )}
            </div>

            {periodError && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {periodError}
              </div>
            )}

            {periodLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
              </div>
            )}

            {!periodLoading && period && (
              period.rows.length === 0 ? (
                <div className="rounded-lg border border-border px-6 py-10 text-center text-muted-foreground">
                  Nicio mișcare înregistrată în această perioadă.
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Articol</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
                            Intrări (qty)
                          </span>
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Val. intrări</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                            Ieșiri (qty)
                          </span>
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Val. ieșiri</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Net qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {period.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-foreground font-medium">{row.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                            {row.inQty} {row.unit}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {formatMDL(row.inValueCents)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                            {row.outQty} {row.unit}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {formatMDL(row.outValueCents)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${
                              row.netQty >= 0
                                ? "text-green-700 dark:text-green-400"
                                : "text-red-700 dark:text-red-400"
                            }`}
                          >
                            {row.netQty >= 0 ? "+" : ""}
                            {row.netQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        )}

        {/* ── Tab 3: Sub stoc minim ─────────────────────────────────────────────── */}
        {activeTab === "below" && (
          <section
            id="panel-below"
            role="tabpanel"
            aria-labelledby="tab-below"
            className="space-y-4"
          >
            {snapshotLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
              </div>
            )}

            {!snapshotLoading && !snapshot && (
              <div className="rounded-lg border border-border px-6 py-10 text-center text-muted-foreground">
                Generează mai întâi situația stocului din tab-ul „Situație stoc".
              </div>
            )}

            {!snapshotLoading && snapshot && belowMin.length === 0 && (
              <div className="rounded-lg border border-border px-6 py-10 text-center">
                <CheckCircle
                  className="h-10 w-10 text-green-600 dark:text-green-400 mx-auto mb-3"
                  aria-hidden="true"
                />
                <p className="text-foreground font-medium">Toate articolele au stoc suficient</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Niciun articol nu este sub pragul de alertă.
                </p>
              </div>
            )}

            {!snapshotLoading && snapshot && belowMin.length > 0 && (
              <>
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{belowMin.length}</strong>{" "}
                    {belowMin.length === 1 ? "articol este" : "articole sunt"} sub stocul minim —
                    verifică comenzile de aprovizionare.
                  </span>
                </div>

                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Articol</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Stoc curent</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Stoc minim</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Deficit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {belowMin.map((row) => (
                        <tr key={row.id} className="bg-red-50/40 dark:bg-red-950/20">
                          <td className="px-4 py-3 text-foreground font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-red-500 dark:bg-red-400"
                                aria-hidden="true"
                              />
                              {row.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{row.category ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400 font-semibold">
                            {row.qty} {row.unit}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {row.minQtyAlert} {row.unit}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400 font-bold">
                            -{row.minQtyAlert - row.qty} {row.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
