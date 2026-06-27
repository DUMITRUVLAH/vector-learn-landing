/**
 * Team Docs — Reconciliere & TVA la import: /app/fin/reconcile
 *
 * Contabilul apasă „Sincronizează" → AI/motorul potrivește tranzacțiile bancare
 * ieșite cu documentele încărcate de echipe. Vede:
 *  - câte tranzacții sunt acoperite de o factură (matched)
 *  - care tranzacții NU au factură (de urmărit)
 *  - TVA la import datorat pentru companiile din watchlist (calculat automat)
 */
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Building2,
  Upload,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { apiUpload } from "@/lib/api";
import { formatMDLCents } from "@/lib/api/finCaptures";
import {
  runSync,
  getVatCompanies,
  addVatCompany,
  deleteVatCompany,
  type SyncResult,
  type VatImportCompany,
} from "@/lib/api/finReconcile";

export default function ReconcilePage() {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [companies, setCompanies] = useState<VatImportCompany[]>([]);
  const [newName, setNewName] = useState("");
  const [newIdno, setNewIdno] = useState("");
  const [newRate, setNewRate] = useState("20");
  const [savingCompany, setSavingCompany] = useState(false);

  const loadCompanies = useCallback(() => {
    getVatCompanies().then(setCompanies).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      setResult(await runSync());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la sincronizare");
    } finally {
      setSyncing(false);
    }
  };

  const importStatement = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file, file.name);
      const r = await apiUpload<{ imported?: number; duplicates?: number }>(
        "/api/fin/cash/import",
        form,
      );
      const imported = r.imported ?? 0;
      const dup = r.duplicates ?? 0;
      setImportMsg(
        `Extras încărcat: ${imported} tranzacții noi${dup ? `, ${dup} duplicate ignorate` : ""}. Apăsați „Sincronizează".`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea extrasului");
    } finally {
      setImporting(false);
    }
  };

  const addCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSavingCompany(true);
    try {
      await addVatCompany({
        name: newName.trim(),
        idno: newIdno.trim() || null,
        vatRateBp: Math.round((parseFloat(newRate) || 20) * 100),
      });
      setNewName("");
      setNewIdno("");
      setNewRate("20");
      loadCompanies();
    } finally {
      setSavingCompany(false);
    }
  };

  const removeCompany = async (id: string) => {
    await deleteVatCompany(id);
    loadCompanies();
  };

  return (
    <BusinessShell pageTitle="Reconciliere & TVA import">
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        {/* Header + Synchronize */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Reconciliere & TVA la import</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Potrivește tranzacțiile bancare cu documentele încărcate de echipe și vezi ce lipsește.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {importing ? "Se încarcă…" : "Încarcă extras de cont"}
              <input
                type="file"
                accept=".csv,.mt940,.sta,text/csv"
                className="sr-only"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importStatement(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={sync}
              disabled={syncing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              {syncing ? "Se sincronizează…" : "Sincronizează"}
            </button>
          </div>
        </div>

        {importMsg && (
          <div className="flex items-center gap-2 rounded-lg bg-green-100 px-4 py-3 text-sm text-green-800 dark:bg-green-900/40 dark:text-green-300" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {importMsg}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Sync results */}
        {result && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Tranzacții" value={String(result.totalTransactions)} />
              <Stat label="Cu factură" value={String(result.matchedCount)} tone="success" />
              <Stat label="Fără factură" value={String(result.missingInvoiceCount)} tone="warning" />
              <Stat label="TVA import" value={formatMDLCents(result.vatImportTotalCents)} />
            </div>

            {/* Transactions missing an invoice */}
            <section className="rounded-xl border border-border bg-card">
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">
                  Tranzacții fără factură ({result.missingInvoiceCount})
                </h2>
              </header>
              {result.missingInvoices.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  Toate tranzacțiile au document atașat. Nimic de urmărit.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Data</th>
                      <th className="px-4 py-2.5 font-medium">Contraparte</th>
                      <th className="px-4 py-2.5 font-medium">Referință</th>
                      <th className="px-4 py-2.5 text-right font-medium">Sumă</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.missingInvoices.map((m) => (
                      <tr key={m.id} className="bg-card">
                        <td className="px-4 py-2.5 text-muted-foreground">{m.txDate}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{m.counterparty ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">
                          {formatMDLCents(m.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* VAT on imports computed */}
            {result.vatImports.length > 0 && (
              <section className="rounded-xl border border-border bg-card">
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">TVA la import de declarat</h2>
                  <span className="text-sm font-semibold text-foreground">
                    {formatMDLCents(result.vatImportTotalCents)}
                  </span>
                </header>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Companie</th>
                      <th className="px-4 py-2.5 text-right font-medium">Bază</th>
                      <th className="px-4 py-2.5 text-right font-medium">Cotă</th>
                      <th className="px-4 py-2.5 text-right font-medium">TVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.vatImports.map((v) => (
                      <tr key={v.txId} className="bg-card">
                        <td className="px-4 py-2.5 font-medium text-foreground">{v.company}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{formatMDLCents(v.baseCents)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{v.vatRateBp / 100}%</td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">{formatMDLCents(v.vatCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {/* VAT-on-imports company watchlist */}
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Companii cu TVA la import
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            La sincronizare, tranzacțiile către aceste companii primesc TVA la import calculat automat.
          </p>

          <form onSubmit={addCompany} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grow">
              <label htmlFor="vc-name" className="block text-xs font-medium text-muted-foreground mb-1">Companie</label>
              <input
                id="vc-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="DHL Logistics SRL"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="vc-idno" className="block text-xs font-medium text-muted-foreground mb-1">IDNO</label>
              <input
                id="vc-idno"
                value={newIdno}
                onChange={(e) => setNewIdno(e.target.value)}
                placeholder="1009600099999"
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="vc-rate" className="block text-xs font-medium text-muted-foreground mb-1">Cotă %</label>
              <input
                id="vc-rate"
                type="number"
                min="0"
                max="100"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={savingCompany}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adaugă
            </button>
          </form>

          {companies.length > 0 && (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-foreground">
                    {c.name}
                    {c.idno && <span className="text-muted-foreground"> · {c.idno}</span>}
                    <span className="text-muted-foreground"> · {c.vatRateBp / 100}%</span>
                  </span>
                  <button
                    onClick={() => removeCompany(c.id)}
                    aria-label={`Șterge ${c.name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </BusinessShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-green-600 dark:text-green-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
