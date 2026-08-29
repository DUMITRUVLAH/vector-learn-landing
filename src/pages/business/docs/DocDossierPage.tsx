/**
 * DG-120/121 — dosarul: toate actele unui proiect sau ale unei contrapărți.
 *
 * De ce contează: întrebarea donatorului („ce ați contractat și cât ați plătit?") și cea a
 * contabilei („furnizorul ăsta și-a schimbat IBAN-ul de la ultimul act?") primeau răspuns abia
 * după o căutare prin foldere și e-mailuri. Aici sunt două ecrane cu aceleași cifre pe care le
 * calculează serverul din PAR-urile chiar executate.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  getProjectDossier,
  getCounterpartyDossier,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type ProjectDossier,
  type CounterpartyDossier,
  type CurrencyTotals,
  type DossierDocument,
} from "@/lib/api/docs";
import { listProjects, listVendors } from "@/lib/api/par";

function money(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function TotalsRow({ totals }: { totals: CurrencyTotals }) {
  const entries = Object.entries(totals ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-6">
      {entries.map(([currency, t]) => (
        <div key={currency}>
          <dt className="text-xs text-muted-foreground">Contractat ({currency})</dt>
          <dd className="text-lg font-semibold text-foreground">{money(t.contractedCents, currency)}</dd>
          <dt className="mt-1 text-xs text-muted-foreground">Plătit</dt>
          <dd className="text-sm text-foreground">{money(t.paidCents, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentsTable({ documents }: { documents: DossierDocument[] }) {
  const { navigate } = useRouter();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Număr</th>
            <th className="px-3 py-2 font-medium">Tip</th>
            <th className="px-3 py-2 font-medium">Titlu</th>
            <th className="px-3 py-2 font-medium text-right">Sumă</th>
            <th className="px-3 py-2 font-medium">Stare</th>
            <th className="px-3 py-2 font-medium">Cerere de plată</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr
              key={d.id}
              onClick={() => navigate(`/business/docs/${d.id}`)}
              className="cursor-pointer border-t border-border hover:bg-muted/40"
            >
              <td className="px-3 py-2 font-mono text-xs">{d.docNumber ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{DOC_KIND_LABELS[d.kind] ?? d.kind}</td>
              <td className="px-3 py-2 text-foreground">{d.title}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(d.totalCents, d.currency)}</td>
              <td className="px-3 py-2 text-muted-foreground">{DOC_STATUS_LABELS[d.status] ?? d.status}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {d.paymentRequests.length === 0
                  ? "—"
                  : d.paymentRequests
                      .map((p) => `${p.requestNo}${p.paidAt ? " (plătită)" : ""}`)
                      .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocDossierPage() {
  const { path, navigate } = useRouter();
  const target = useMemo(() => {
    const project = path.match(/\/docs\/proiect\/([^/?]+)/);
    if (project) return { kind: "project" as const, id: project[1] };
    const party = path.match(/\/docs\/contraparte\/([^/?]+)/);
    if (party) return { kind: "counterparty" as const, id: party[1] };
    return null;
  }, [path]);

  const [projectDossier, setProjectDossier] = useState<ProjectDossier | null>(null);
  const [partyDossier, setPartyDossier] = useState<CounterpartyDossier | null>(null);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      if (target.kind === "project") {
        const [dossier, projects] = await Promise.all([
          getProjectDossier(target.id),
          listProjects().then((r) => r.items).catch(() => []),
        ]);
        setProjectDossier(dossier);
        setName(projects.find((p) => p.id === target.id)?.name ?? "Proiect");
      } else {
        const [dossier, vendors] = await Promise.all([
          getCounterpartyDossier(target.id),
          listVendors().then((r) => r.items).catch(() => []),
        ]);
        setPartyDossier(dossier);
        setName(vendors.find((v) => v.id === target.id)?.name ?? "Furnizor");
      }
    } catch {
      setError("Nu am putut încărca dosarul.");
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BusinessShell
      pageTitle={target?.kind === "project" ? `Dosar proiect · ${name}` : `Dosar furnizor · ${name}`}
      pageDescription="Toate actele, cu sumele contractate și cele chiar plătite."
      actions={
        <button
          type="button"
          onClick={() => navigate("/business/docs")}
          className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi la acte
        </button>
      }
    >
      <div className="p-4 sm:p-6 space-y-6">
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă dosarul…
          </div>
        ) : projectDossier ? (
          projectDossier.documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">Niciun act pe acest proiect.</p>
            </div>
          ) : (
            <>
              <section className="rounded-lg border border-border p-4">
                <TotalsRow totals={projectDossier.totals} />
              </section>
              {projectDossier.byCounterparty.map((group) => (
                <section key={group.counterpartyName} className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-sm font-medium text-foreground">{group.counterpartyName}</h2>
                    <span className="text-xs text-muted-foreground">
                      {group.documents.length} acte
                    </span>
                  </div>
                  <DocumentsTable documents={group.documents} />
                </section>
              ))}
            </>
          )
        ) : partyDossier ? (
          <>
            {partyDossier.requisiteChanges.length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
              >
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Rechizitele s-au schimbat față de ultimul act semnat
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {partyDossier.requisiteChanges.map((c) => (
                    <li key={c.field}>
                      {c.label}: pe act <span className="font-mono">{c.onLastAct}</span> → în registru{" "}
                      <span className="font-mono">{c.inRegistry}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <section className="rounded-lg border border-border p-4">
              <TotalsRow totals={partyDossier.totals} />
            </section>
            <DocumentsTable documents={partyDossier.documents} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Alege un proiect sau o contraparte.</p>
        )}
      </div>
    </BusinessShell>
  );
}
